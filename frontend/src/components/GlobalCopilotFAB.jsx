// GlobalCopilotFAB — the always-on floating Co-Pilot mic that lives on
// every authenticated page in RoadBoss / WreckerLogix.
//
// Mike's spec (verbatim): "Co-Pilot should be a quick action on every page."
//
// Behavior:
//   - Bottom-right corner, fixed position, above all content (z-2147483500).
//   - Hidden on auth / marketing / public pages and on screens that already
//     own a full-screen voice UI (the Co-Pilot screen itself, the DVIR voice
//     walkthrough, the wrecker voice page, public pay-link).
//   - First tap: unlocks iOS audio (silent utterance), enables wake-word
//     listening, and pops a quick "say Hey Co-Pilot" hint. iOS Safari REQUIRES
//     a user gesture before any audio API will work — that's why the orb
//     glows amber until tapped, then green when armed.
//   - Once unlocked, wake word stays armed across page navigations (state
//     held inside this single mounted component at the App.js level).
//   - When wake word fires → captures command → POST /copilot/chat → speaks
//     the reply → executes any returned action (navigate, status change, etc).
//   - Long-press / second-tap-while-unlocked = open quick command popover so
//     Mike can type if he's in a noisy bay or doesn't want to wake Kenny up.
//
// What we explicitly DON'T promise:
//   - Wake word does NOT work on a locked iPhone screen. Apple suspends mic.
//   - Wake word does NOT work in the Emergent preview iframe (cross-origin
//     mic block). The component shows an "Open in tab" hint when iframed.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Mic, X, Sparkles, Send, AlertTriangle, ExternalLink,
  Loader2, Volume2,
} from 'lucide-react';
import { useWakeWord, isInIframe, supportsSTT } from '@/hooks/useWakeWord';
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

const STORAGE_KEY = 'roadboss.globalfab.unlocked.v1';

// Small audible cue so user KNOWS the wake word fired
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
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('idle'); // idle | thinking | speaking
  const [reply, setReply] = useState('');
  const [typed, setTyped] = useState('');
  const inIframe = isInIframe();
  const sttSupported = supportsSTT();

  // Visibility decision — computed BEFORE hooks so render bails early but
  // hook order is preserved (we still call all hooks regardless).
  const hidden = !me || pathHidden(location.pathname);

  // Persist unlock so next navigation doesn't ask again
  useEffect(() => {
    try { if (unlocked) localStorage.setItem(STORAGE_KEY, '1'); } catch {}
  }, [unlocked]);

  const submitCommand = useCallback(async (command) => {
    const t = (command || '').trim();
    if (!t) return;
    setMode('thinking');
    setReply('');
    setOpen(true);
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
      // Credit / auth errors get a long-lived toast so the user actually reads them
      if (status === 402 || status === 401) {
        toast.error(errMsg, { duration: 12000 });
      } else if (status === 429) {
        toast.warning(errMsg, { duration: 6000 });
      } else {
        toast.error(errMsg);
      }
    }
  }, [navigate]);

  // Wake word — captures command after the trigger phrase fires
  const onWake = useCallback(async (command) => {
    chime();
    submitCommand(command);
  }, [submitCommand]);

  const { listening, armed, lastError, lastHeard } = useWakeWord({
    enabled: !hidden && unlocked && !inIframe && sttSupported,
    wakePhrases: ['hey co-pilot', 'hey copilot', 'co-pilot', 'copilot', 'hey roadboss', 'roadboss', 'hey boss', 'highway pilot'],
    onCommand: onWake,
  });

  // Auto-disable + warn on persistent permission errors
  useEffect(() => {
    if (lastError === 'not-allowed' || lastError === 'service-not-allowed') {
      toast.error('Mic permission denied. Tap the address-bar lock → Microphone → Allow, then reload.', { duration: 8000 });
      setUnlocked(false);
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }, [lastError]);

  // ALL hooks above this line. Now we can safely bail on hidden routes.
  if (hidden) return null;

  // Lift the orb up over the bottom nav on driver/wrecker pages (those layouts
  // pin a 4-tab bottom bar at h-20). Everywhere else (super-admin console,
  // marketing, etc.) it sits in the natural bottom-right corner. iOS safe-area
  // is already accounted for by the parent layouts.
  const hasBottomNav = location.pathname.startsWith('/driver') || location.pathname.startsWith('/wrecker');
  const fabPositionCls = hasBottomNav ? 'bottom-24 right-4 sm:bottom-24 sm:right-5' : 'bottom-4 right-4 sm:bottom-5 sm:right-5';
  const popoverBottomCls = hasBottomNav ? 'bottom-44 right-3 sm:bottom-44 sm:right-5' : 'bottom-[88px] right-3 sm:right-5';

  const handleOrbTap = () => {
    if (!unlocked) {
      // iOS audio gesture unlock + speechSynthesis prime
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
        toast.success('Co-Pilot armed. Just say "Hey Co-Pilot…" any time.', { duration: 5000 });
      }
      return;
    }
    setOpen((o) => !o);
  };

  const onTypedSubmit = (e) => {
    e.preventDefault();
    submitCommand(typed);
    setTyped('');
  };

  const orbCls = (() => {
    if (mode === 'thinking') return 'bg-amber-500 border-amber-300 text-slate-950';
    if (mode === 'speaking') return 'bg-emerald-500 border-emerald-300 text-slate-950';
    if (armed) return 'bg-red-500 border-red-300 text-white hp-voice-ring';
    if (unlocked && listening) return 'bg-sky-500 border-sky-300 text-slate-950';
    if (unlocked) return 'bg-sky-600 border-sky-400 text-white';
    return 'bg-slate-900 border-amber-500/70 text-amber-300';
  })();

  const statusLabel = (() => {
    if (mode === 'thinking') return 'Thinking…';
    if (mode === 'speaking') return 'Speaking…';
    if (armed) return 'Listening — speak now';
    if (unlocked && listening) return 'Say "Hey Co-Pilot…"';
    if (unlocked) return 'Wake mic starting…';
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
            : <Mic className="w-7 h-7" />}
          {/* Status indicator dot */}
          <span
            className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
              !unlocked ? 'bg-amber-400 animate-pulse'
                : armed ? 'bg-red-400 animate-pulse'
                : listening ? 'bg-emerald-400'
                : 'bg-slate-500'
            }`}
            data-testid="global-copilot-fab-status"
          />
          {/* Subtle Sparkles peek */}
          <Sparkles className="absolute -bottom-1 -left-1 w-3 h-3 text-sky-300/60" />
        </button>
      </div>

      {/* Popover panel — appears on demand or when wake word fires */}
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
                  armed ? 'bg-red-500/20 text-red-200'
                    : listening ? 'bg-emerald-500/20 text-emerald-200'
                    : 'bg-slate-800 text-slate-400'
                }`}>{statusLabel}</span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-500 hover:text-white"
              data-testid="global-copilot-close"
              aria-label="Close Co-Pilot panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-2.5 text-sm text-slate-200 max-h-[40vh] overflow-y-auto">
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

            {unlocked && lastHeard && !armed && mode === 'idle' && (
              <div className="text-[11px] text-slate-500 truncate">heard: "{lastHeard}"</div>
            )}

            {mode === 'thinking' && (
              <div className="text-amber-300 inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</div>
            )}

            {reply && (
              <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 text-sm leading-relaxed" data-testid="global-copilot-reply">
                {reply}
              </div>
            )}

            {/* Always-available text fallback so Mike can use Co-Pilot
                without speaking (noisy bay, kids asleep, etc) */}
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

            {/* Quick-prompt chips so first-timers know what to say */}
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
          </div>
        </div>
      )}
    </>
  );
}
