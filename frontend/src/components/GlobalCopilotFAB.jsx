// GlobalCopilotFAB — the always-on floating Co-Pilot mic that lives on
// every authenticated page in RoadBoss / WreckerLogix.
//
// MODE: Push-to-Talk by DEFAULT (zero false triggers).
//
// Flow:
//   1. Tap orb → mic turns on, captures one utterance.
//   2. Auto-stops on ~1.5s of silence, OR user taps stop.
//   3. Transcript appears in popover. User reviews → taps "Send" or "Cancel".
//   4. On Send → POST /copilot/chat → speaks reply → executes any action.
//
// Wake-word ("Hey Co-Pilot") is now an OPT-IN advanced toggle in the panel.
// It's OFF by default because hot-mic wake words misfire constantly in the
// real world (background voices, partial words, etc). Push-to-talk is rock-
// solid and demo-grade reliable — we'll polish wake word later.
//
// What we explicitly DON'T promise:
//   - Wake word does NOT work on a locked iPhone screen. Apple suspends mic.
//   - Wake word does NOT work in the Emergent preview iframe (cross-origin
//     mic block). The component shows an "Open in tab" hint when iframed.

import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Mic, MicOff, X, Sparkles, Send, AlertTriangle, ExternalLink,
  Loader2, Volume2, Settings, Square, Check, ChevronRight,
} from 'lucide-react';
import { useWakeWord, isInIframe, supportsSTT } from '@/hooks/useWakeWord';
import { usePushToTalk } from '@/hooks/usePushToTalk';
import { api, getUser } from '@/lib/api';
import { toast } from 'sonner';

// Routes where the FAB should NOT appear (auth, public marketing, dedicated
// voice surfaces). Match by exact path OR prefix.
const EXACT_HIDE = new Set([
  '/', '/login', '/forgot-password', '/reset-password',
  '/pitch', '/deck', '/reel', '/intro', '/cuts', '/share-kit', '/try',
  '/guide', '/help', '/roi', '/savings', '/fleet', '/pricing',
  '/auth/google-callback', '/investors',
]);
const PREFIX_HIDE = ['/driver/copilot', '/wrecker/voice', '/pay/', '/cuts/', '/accept-invite'];
const SUFFIX_HIDE = ['/voice']; // matches /driver/inspection/:id/voice

function pathHidden(pathname) {
  if (EXACT_HIDE.has(pathname)) return true;
  if (PREFIX_HIDE.some((p) => pathname.startsWith(p))) return true;
  if (SUFFIX_HIDE.some((s) => pathname.endsWith(s))) return true;
  return false;
}

const STORAGE_UNLOCK = 'roadboss.globalfab.unlocked.v1';
const STORAGE_WAKE = 'roadboss.globalfab.wakeword.v2'; // OFF by default now

// Small audible cue so user KNOWS the mic just opened
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + i * 0.06);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.01 + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16 + i * 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + 0.20 + i * 0.06);
    });
    setTimeout(() => { try { ctx.close(); } catch {} }, 600);
  } catch {}
}

function speak(text, onEnd) {
  try {
    if (!('speechSynthesis' in window)) { onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.04; u.pitch = 1; u.volume = 1; u.lang = 'en-US';
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.cancel();
    try { window.speechSynthesis.resume(); } catch {}
    window.speechSynthesis.speak(u);
  } catch { onEnd?.(); }
}

export default function GlobalCopilotFAB() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = getUser();

  const [unlocked, setUnlocked] = useState(() => {
    try { return localStorage.getItem(STORAGE_UNLOCK) === '1'; } catch { return false; }
  });
  // Wake-word OPT-IN. Default OFF — push-to-talk is the reliable mode.
  const [wakeEnabled, setWakeEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_WAKE) === '1'; } catch { return false; }
  });
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState('idle'); // idle | thinking | speaking
  const [reply, setReply] = useState('');
  const [typed, setTyped] = useState('');
  // Captured push-to-talk transcript awaiting user confirmation
  const [pendingCommand, setPendingCommand] = useState('');
  const inIframe = isInIframe();
  const sttSupported = supportsSTT();

  // Visibility decision — computed BEFORE hooks so render bails early but
  // hook order is preserved (we still call all hooks regardless).
  const hidden = !me || pathHidden(location.pathname);

  // Persist unlock so next navigation doesn't ask again
  useEffect(() => {
    try { if (unlocked) localStorage.setItem(STORAGE_UNLOCK, '1'); } catch {}
  }, [unlocked]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_WAKE, wakeEnabled ? '1' : '0'); } catch {}
  }, [wakeEnabled]);

  const submitCommand = useCallback(async (command) => {
    const t = (command || '').trim();
    if (!t) return;

    // ⚡ LOCAL ROUTING — Detect phrases that should launch a dedicated voice
    // surface BEFORE hitting the LLM. Saves $$$ and is more reliable.
    const lower = t.toLowerCase();
    const wantsNewJobWizard = (
      /(start|create|new|log|open|begin)\b.*\b(tow\s*job|new\s*job|job)\b/.test(lower) ||
      /\b(tow\s*job|new\s*tow|new\s*job)\b/.test(lower)
    ) && lower.length < 60; // long sentences = likely actual data, not just a launcher
    if (wantsNewJobWizard) {
      const role = (me?.role || '').toLowerCase();
      const wreckerRoles = ['wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'dispatcher', 'super_admin'];
      if (wreckerRoles.includes(role)) {
        setOpen(false);
        setPendingCommand('');
        toast.success('Launching Hands-Free Voice Fill…', { duration: 2500 });
        navigate('/wrecker/jobs/new?voice=1');
        return;
      }
    }

    setMode('thinking');
    setReply('');
    setOpen(true);
    setPendingCommand('');
    try {
      const r = await api.post('/copilot/chat', { message: t });
      const text = r.data?.reply || '';
      setReply(text);
      const action = r.data?.action;

      // Action-specific toasts so Mike sees confirmation
      if (action?.executed) {
        const ty = action.type;
        if (ty === 'duty_change') toast.success(`Status: ${action.new_status?.replace('_', ' ')}`);
        if (ty === 'start_trip') toast.success('Trip started');
        if (ty === 'end_trip') toast.success('Trip completed');
        if (ty === 'log_fuel') toast.success('Fuel logged');
        if (ty === 'tow_job_status') toast.success(`Job → ${action.new_status?.replace('_', ' ')}`);
        if (ty === 'send_sms' && action.recipient_email) toast.success(`Text sent to ${action.recipient_email}`);
        if (ty === 'inspection_mark_all') toast.success(`${action.items_marked} items marked ${action.status}`);
        if (ty === 'new_tow_job') toast.success(`New tow job created for ${action.customer_name}`);
        if (ty === 'set_job_price') toast.success(`$${action.amount?.toFixed(2)} charged${action.customer ? ' · ' + action.customer : ''}`);
        if (ty === 'mark_paid') toast.success(`Paid · ${action.payment_method?.replace('_', ' ')}${action.amount ? ' · $' + action.amount.toFixed(2) : ''}`);
        if (ty === 'daily_summary') toast.success(`Today: $${action.total_invoiced?.toFixed(2)} billed · $${action.total_paid?.toFixed(2)} paid`);
        if (ty === 'log_expense') toast.success(`Expense logged · ${action.kind} · $${action.amount?.toFixed(2)}`);
      } else if (action?.error) {
        toast.info(action.error);
      }

      // Speak first, then redirect (keeps it truly hands-free)
      if (text) {
        setMode('speaking');
        speak(text, () => {
          setMode('idle');
          if (action?.executed && action?.redirect) {
            navigate(action.redirect);
          }
        });
      } else {
        setMode('idle');
        if (action?.executed && action?.redirect) navigate(action.redirect);
      }
    } catch (e) {
      const status = e?.response?.status;
      const errMsg = e?.response?.data?.detail || 'Co-Pilot is offline right now.';
      setReply(errMsg);
      setMode('idle');
      if (status === 402 || status === 401) {
        toast.error(errMsg, { duration: 12000 });
      } else if (status === 429) {
        toast.warning(errMsg, { duration: 6000 });
      } else {
        toast.error(errMsg);
      }
    }
  }, [navigate, me]);

  // ---- Push-to-Talk ----
  // When transcript finalizes, stash it for user review (no auto-send).
  const onTranscript = useCallback((text) => {
    setPendingCommand(text);
    setOpen(true);
  }, []);
  const ptt = usePushToTalk({ onTranscript, silenceMs: 1500 });

  // ---- Wake Word (opt-in only) ----
  const onWake = useCallback((command) => {
    chime();
    // Wake word still goes through the confirm flow — show transcript first.
    setPendingCommand(command);
    setOpen(true);
  }, []);

  // Tightened wake phrases — only "hey co-pilot" variants. Removed the loose
  // ones that misfire on background speech ("copilot", "boss", "roadboss").
  const wakeWord = useWakeWord({
    enabled: wakeEnabled && !hidden && unlocked && !inIframe && sttSupported,
    wakePhrases: ['hey co-pilot', 'hey copilot'],
    onCommand: onWake,
  });

  // Auto-disable + warn on persistent permission errors (wake-word path)
  useEffect(() => {
    if (wakeWord.lastError === 'not-allowed' || wakeWord.lastError === 'service-not-allowed') {
      toast.error('Mic permission denied. Tap the address-bar lock → Microphone → Allow, then reload.', { duration: 8000 });
      setUnlocked(false);
      setWakeEnabled(false);
      try { localStorage.removeItem(STORAGE_UNLOCK); } catch {}
    }
  }, [wakeWord.lastError]);

  // Show ptt errors
  useEffect(() => {
    if (ptt.error === 'not-allowed' || ptt.error === 'service-not-allowed') {
      toast.error('Mic permission denied. Tap the address-bar lock → Microphone → Allow, then reload.', { duration: 8000 });
    } else if (ptt.error === 'not_supported') {
      toast.error('Voice not supported on this browser. Use the type box instead.', { duration: 5000 });
    }
  }, [ptt.error]);

  // ALL hooks above this line. Now we can safely bail on hidden routes.
  if (hidden) return null;

  // Lift the orb up over the bottom nav on driver/wrecker pages.
  const hasBottomNav = location.pathname.startsWith('/driver') || location.pathname.startsWith('/wrecker');
  const fabPositionCls = hasBottomNav ? 'bottom-24 right-4 sm:bottom-24 sm:right-5' : 'bottom-4 right-4 sm:bottom-5 sm:right-5';
  const popoverBottomCls = hasBottomNav ? 'bottom-44 right-3 sm:bottom-44 sm:right-5' : 'bottom-[88px] right-3 sm:right-5';

  const handleOrbTap = () => {
    // First-time: unlock iOS audio
    if (!unlocked) {
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0.01;
        window.speechSynthesis.speak(u);
      } catch {}
      setUnlocked(true);
      setOpen(true);
      if (inIframe) {
        toast.error('Microphone is blocked inside the preview iframe. Open in a real Safari tab for full voice.', { duration: 7000 });
      } else if (!sttSupported) {
        toast.error('Voice not supported on this browser. Use the type box instead.', { duration: 5000 });
      } else {
        toast.success('Co-Pilot ready. Tap the orb to talk.', { duration: 4000 });
      }
      return;
    }

    // If currently recording → stop and let onTranscript fire
    if (ptt.recording) {
      ptt.stop();
      return;
    }

    // If thinking/speaking → just open the panel (don't interrupt)
    if (mode === 'thinking' || mode === 'speaking') {
      setOpen(true);
      return;
    }

    // Cannot record in iframe or unsupported browser
    if (inIframe || !sttSupported) {
      setOpen(true);
      return;
    }

    // Start a fresh push-to-talk capture
    setPendingCommand('');
    setReply('');
    setOpen(true);
    chime();
    ptt.start();
  };

  const onTypedSubmit = (e) => {
    e.preventDefault();
    submitCommand(typed);
    setTyped('');
  };

  const sendPending = () => {
    if (!pendingCommand.trim()) return;
    submitCommand(pendingCommand);
  };

  const cancelPending = () => {
    setPendingCommand('');
    ptt.cancel();
  };

  const orbCls = (() => {
    if (mode === 'thinking') return 'bg-amber-500 border-amber-300 text-slate-950';
    if (mode === 'speaking') return 'bg-emerald-500 border-emerald-300 text-slate-950';
    if (ptt.recording) return 'bg-red-500 border-red-300 text-white animate-pulse';
    if (wakeEnabled && wakeWord.armed) return 'bg-red-500 border-red-300 text-white animate-pulse';
    if (wakeEnabled && wakeWord.listening) return 'bg-sky-500 border-sky-300 text-slate-950';
    if (unlocked) return 'bg-sky-600 border-sky-400 text-white';
    return 'bg-slate-900 border-amber-500/70 text-amber-300';
  })();

  const statusLabel = (() => {
    if (mode === 'thinking') return 'Thinking…';
    if (mode === 'speaking') return 'Speaking…';
    if (ptt.recording) return 'Listening — tap to stop';
    if (wakeEnabled && wakeWord.armed) return 'Heard you — say command';
    if (wakeEnabled && wakeWord.listening) return 'Wake word: Say "Hey Co-Pilot…"';
    if (unlocked) return 'Tap to talk';
    return 'Tap to enable Co-Pilot';
  })();

  return (
    <>
      {/* Orb (always present) */}
      <div className={`fixed ${fabPositionCls} z-[2147483500]`} data-testid="global-copilot-fab-wrapper">
        <button
          onClick={handleOrbTap}
          className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 shadow-xl shadow-black/40 flex items-center justify-center transition-all active:scale-95 ${orbCls}`}
          data-testid="global-copilot-fab"
          aria-label={statusLabel}
          title={statusLabel}
        >
          {mode === 'thinking' ? <Loader2 className="w-7 h-7 animate-spin" />
            : mode === 'speaking' ? <Volume2 className="w-7 h-7" />
            : ptt.recording ? <Square className="w-6 h-6 fill-current" />
            : <Mic className="w-7 h-7" />}
          {/* Status indicator dot */}
          <span
            className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
              !unlocked ? 'bg-amber-400 animate-pulse'
                : ptt.recording ? 'bg-red-400 animate-pulse'
                : wakeEnabled && wakeWord.armed ? 'bg-red-400 animate-pulse'
                : wakeEnabled && wakeWord.listening ? 'bg-emerald-400'
                : 'bg-slate-500'
            }`}
            data-testid="global-copilot-fab-status"
          />
          <Sparkles className="absolute -bottom-1 -left-1 w-3 h-3 text-sky-300/60" />
        </button>
      </div>

      {/* Popover panel */}
      {open && (
        <div
          className={`fixed ${popoverBottomCls} z-[2147483501] w-[300px] sm:w-[340px] rounded-2xl bg-slate-950/97 border border-slate-800 backdrop-blur shadow-2xl shadow-black/50`}
          data-testid="global-copilot-popover"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] uppercase tracking-widest text-sky-300/90 font-bold">Co-Pilot</span>
              {unlocked && (
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  ptt.recording ? 'bg-red-500/20 text-red-200'
                    : wakeEnabled && wakeWord.armed ? 'bg-red-500/20 text-red-200'
                    : wakeEnabled && wakeWord.listening ? 'bg-emerald-500/20 text-emerald-200'
                    : 'bg-slate-800 text-slate-400'
                }`}>{statusLabel}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSettings((s) => !s)}
                className={`p-1 rounded hover:bg-slate-800 ${showSettings ? 'text-sky-300' : 'text-slate-500 hover:text-white'}`}
                data-testid="global-copilot-settings-btn"
                aria-label="Co-Pilot settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setOpen(false); setShowSettings(false); }}
                className="text-slate-500 hover:text-white p-1"
                data-testid="global-copilot-close"
                aria-label="Close Co-Pilot panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-3 space-y-2.5 text-sm text-slate-200 max-h-[55vh] overflow-y-auto">
            {!unlocked && (
              <div className="text-xs text-amber-300 leading-relaxed">
                Tap the orb once to enable voice. iOS needs that single gesture before the mic can listen.
              </div>
            )}

            {unlocked && inIframe && (
              <div className="rounded-lg p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold">Mic blocked in this preview iframe.</div>
                  <button
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="mt-1 inline-flex items-center gap-1 text-amber-300 hover:text-amber-100 text-xs font-semibold"
                  >
                    <ExternalLink className="w-3 h-3" /> Open in real tab
                  </button>
                </div>
              </div>
            )}

            {/* Settings drawer (opt-in wake word) */}
            {showSettings && unlocked && (
              <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-2.5" data-testid="global-copilot-settings">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Voice settings</div>
                <label className="flex items-start justify-between gap-3 cursor-pointer">
                  <div className="flex-1">
                    <div className="text-sm text-slate-100 font-semibold">Hands-free wake word</div>
                    <div className="text-[11px] text-slate-400 leading-snug">
                      Listen continuously for "Hey Co-Pilot." May misfire in noisy areas — leave OFF for demos and customer-facing runs.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={wakeEnabled}
                    onChange={(e) => setWakeEnabled(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-sky-500"
                    data-testid="global-copilot-wakeword-toggle"
                  />
                </label>
                {wakeEnabled && (
                  <div className="text-[11px] text-emerald-300 leading-snug bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
                    ✓ Wake word ON. Say <span className="font-semibold">"Hey Co-Pilot"</span>, pause, then your command.
                  </div>
                )}
              </div>
            )}

            {/* Live interim transcript while recording */}
            {ptt.recording && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-slate-100 text-sm">
                <div className="text-[10px] uppercase tracking-wider text-red-300 font-bold mb-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Recording…
                </div>
                <div className="text-slate-200 italic min-h-[1.2em]">
                  {ptt.interim || 'Speak now…'}
                </div>
                <button
                  onClick={() => ptt.stop()}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100"
                  data-testid="global-copilot-stop-recording"
                >
                  <Square className="w-3 h-3" /> Stop
                </button>
              </div>
            )}

            {/* Captured transcript awaiting confirmation */}
            {pendingCommand && !ptt.recording && mode !== 'thinking' && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 space-y-2" data-testid="global-copilot-pending">
                <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">I heard:</div>
                <div className="text-slate-100 text-sm leading-relaxed">"{pendingCommand}"</div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={sendPending}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold"
                    data-testid="global-copilot-confirm-send"
                  >
                    <Check className="w-3.5 h-3.5" /> Send
                  </button>
                  <button
                    onClick={cancelPending}
                    className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm"
                    data-testid="global-copilot-confirm-cancel"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              </div>
            )}

            {mode === 'thinking' && (
              <div className="text-amber-300 inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</div>
            )}

            {reply && !pendingCommand && (
              <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 text-sm leading-relaxed" data-testid="global-copilot-reply">
                {reply}
              </div>
            )}

            {/* Always-available text fallback */}
            {!ptt.recording && (
              <form onSubmit={onTypedSubmit} className="flex items-center gap-2">
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Type a command instead…"
                  className="flex-1 bg-slate-900 border border-slate-800 text-white text-sm rounded-md h-9 px-2.5 focus:outline-none focus:border-sky-500/50"
                  data-testid="global-copilot-input"
                />
                <button
                  type="submit"
                  disabled={!typed.trim() || mode === 'thinking'}
                  className="h-9 px-3 rounded-md bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-semibold flex items-center gap-1 text-sm"
                  data-testid="global-copilot-send"
                >
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              </form>
            )}

            {/* Quick-prompt chips so first-timers know what to say */}
            {!ptt.recording && !pendingCommand && mode === 'idle' && (
              <>
                {/* Hands-Free Job Wizard launcher — Mike's signature flow */}
                {(() => {
                  const role = (me?.role || '').toLowerCase();
                  const wreckerRoles = ['wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'dispatcher', 'super_admin'];
                  if (!wreckerRoles.includes(role)) return null;
                  return (
                    <button
                      onClick={() => { setOpen(false); navigate('/wrecker/jobs/new?voice=1'); }}
                      className="w-full mt-1 inline-flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500/20 to-sky-500/20 border border-emerald-500/40 hover:border-emerald-400 transition group"
                      data-testid="global-copilot-launch-wizard"
                    >
                      <div className="flex items-center gap-2 text-left">
                        <div className="w-7 h-7 rounded-md bg-emerald-500/30 flex items-center justify-center">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                        </div>
                        <div>
                          <div className="text-[12px] font-semibold text-white leading-tight">Hands-Free Voice Fill</div>
                          <div className="text-[10px] text-emerald-200/80">Watch Co-Pilot fill every field</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-emerald-300 group-hover:translate-x-0.5 transition" />
                    </button>
                  );
                })()}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    "What's my next call",
                    'Start pre-trip',
                    'I am en route',
                    'Job complete',
                  ].map((p) => (
                    <button
                      key={p}
                      onClick={() => submitCommand(p)}
                      className="text-[11px] px-2 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:border-sky-500/40 hover:text-sky-300"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
