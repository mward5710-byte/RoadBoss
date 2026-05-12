// GlobalCopilotFAB — persistent hands-free live assistant for RoadBoss / WreckerLogix.
//
// ALWAYS-ON WAKE WORD. Listening for "Copilot", "Hey Copilot", "Hey Co-Pilot".
// Push-to-talk still works (tap the orb).
//
// Flow:
//   1. Say "Copilot" (or variant) → mic arms → say command → auto-submits.
//   2. Or: tap orb → speak → auto-submits on silence (~1.5 s).
//   3. Reply is spoken aloud and shown briefly above the orb, then dismissed.
//   4. Actions (status toasts, nav redirects) run after TTS completes.
//
// Limitations:
//   - Wake word does NOT work on a locked iPhone screen. iOS suspends mic.
//   - Wake word does NOT work in the Emergent preview iframe (cross-origin
//     mic block). The component shows an "Open in tab" hint when iframed.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Mic, X, Sparkles, Send, AlertTriangle, ExternalLink,
  Loader2, Volume2, Square, Keyboard,
} from 'lucide-react';
import { useWakeWord, isInIframe, supportsSTT } from '@/hooks/useWakeWord';
import { usePushToTalk } from '@/hooks/usePushToTalk';
import { getUser } from '@/lib/api';
import {
  assessRiskLevel,
  flushOfflineCommands,
  getOfflineQueueSize,
  parseVoiceDirective,
  queueOfflineCommand,
  sendCopilotMessage,
  shouldBlockForDrivingSafety,
} from '@/lib/voiceControlLayer';
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
const REPLY_DISMISS_DELAY_MS = 4000;
const VOICE_PROFILE_KEY = 'roadboss.voice.profile.v1';

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
  const [mode, setMode] = useState('idle'); // idle | thinking | speaking
  const [reply, setReply] = useState('');
  const [typed, setTyped] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [speedMph, setSpeedMph] = useState(null);
  const [queueSize, setQueueSize] = useState(() => getOfflineQueueSize());
  const [voiceProfile] = useState(() => {
    try { return localStorage.getItem(VOICE_PROFILE_KEY) || 'truck_noise'; } catch { return 'truck_noise'; }
  });
  const lastActionRef = useRef(null);
  const inIframe = isInIframe();
  const sttSupported = supportsSTT();

  // Visibility decision — computed BEFORE hooks so render bails early but
  // hook order is preserved (we still call all hooks regardless).
  const hidden = !me || pathHidden(location.pathname);

  // Persist unlock so next navigation doesn't ask again
  useEffect(() => {
    try { if (unlocked) localStorage.setItem(STORAGE_UNLOCK, '1'); } catch {}
  }, [unlocked]);

  // Auto-clear reply after TTS finishes and assistant returns to idle
  useEffect(() => {
    if (mode === 'idle' && reply) {
      const t = setTimeout(() => setReply(''), REPLY_DISMISS_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [mode, reply]);

  useEffect(() => {
    if (!navigator?.geolocation) return;
    let watchId = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const mps = pos?.coords?.speed;
          if (typeof mps === 'number' && !Number.isNaN(mps)) setSpeedMph(Math.max(0, mps * 2.23694));
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 10000, timeout: 15000 }
      );
    } catch {}
    return () => { if (watchId != null) navigator.geolocation.clearWatch(watchId); };
  }, []);

  useEffect(() => {
    const flushQueued = async () => {
      const flushed = await flushOfflineCommands({
        buildMeta: () => ({
          channel: 'voice',
          source: 'global_fab',
          profile: voiceProfile,
          replayed_from_offline_queue: true,
        }),
        onItemSuccess: (_item, data) => {
          if (data?.action?.executed) lastActionRef.current = data.action;
        },
      });
      if (flushed > 0) toast.success(`Synced ${flushed} queued voice command${flushed > 1 ? 's' : ''}.`);
      setQueueSize(getOfflineQueueSize());
    };
    const onOnline = () => { flushQueued(); };
    window.addEventListener('online', onOnline);
    if (navigator.onLine) flushQueued();
    return () => window.removeEventListener('online', onOnline);
  }, [voiceProfile]);

  const submitCommand = useCallback(async (command, { source = 'voice' } = {}) => {
    const t = (command || '').trim();
    if (!t) return;

    // ⚡ LOCAL ROUTING — Detect phrases that should launch a dedicated page
    // BEFORE hitting the LLM. Saves $$$ and is more reliable.
    const lower = t.toLowerCase();
    const wantsNewJob = (
      /(start|create|new|log|open|begin)\b.*\b(tow\s*job|new\s*job|job)\b/.test(lower) ||
      /\b(tow\s*job|new\s*tow|new\s*job)\b/.test(lower)
    ) && lower.length < 60; // long sentences = likely actual data, not a launcher
    if (wantsNewJob) {
      const role = (me?.role || '').toLowerCase();
      const wreckerRoles = ['wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'dispatcher', 'super_admin'];
      if (wreckerRoles.includes(role)) {
        toast.success('Opening New Tow Job…', { duration: 2000 });
        navigate('/wrecker/jobs/new');
        return;
      }
    }
    const wantsDashboard = /\b(open|show|go to|take me to|pull up)\b.*\b(dashboard|board|home|cab)\b/.test(lower)
      || /^(dashboard|home|board|cab)$/.test(lower);
    if (wantsDashboard) {
      const role = (me?.role || '').toLowerCase();
      if (role === 'driver') navigate('/driver');
      else if (['wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor'].includes(role)) navigate('/wrecker');
      else navigate('/app');
      toast.success('Opening dashboard…', { duration: 1800 });
      return;
    }

    setMode('thinking');
    setReply('');
    try {
      const data = await sendCopilotMessage(t, {
        channel: 'voice',
        source,
        profile: voiceProfile,
        speed_mph: typeof speedMph === 'number' ? Number(speedMph.toFixed(1)) : null,
        risk_level: assessRiskLevel(t),
      });
      const text = data?.reply || '';
      setReply(text);
      const action = data?.action;
      if (action?.executed) lastActionRef.current = action;

      // Action-specific toasts so the driver sees confirmation
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
      const offline = !navigator.onLine || !e?.response;
      if (offline) {
        const total = queueOfflineCommand(t, { channel: 'voice', source, profile: voiceProfile });
        setQueueSize(total);
        setReply('No signal right now. I queued that command and will sync when connection returns.');
        setMode('idle');
        toast.info('Voice command queued for sync when online.');
        return;
      }
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
  }, [navigate, me, speedMph, voiceProfile]);

  const processVoiceCommand = useCallback((rawText, source = 'voice') => {
    const directive = parseVoiceDirective(rawText);
    const spokenText = directive.type === 'correction' ? directive.text : (rawText || '').trim();

    if (directive.type === 'interrupt') {
      try { window.speechSynthesis.cancel(); } catch {}
      setMode('idle');
      setReply('Stopped. Ready when you are.');
      setPendingConfirm(null);
      return;
    }
    if (directive.type === 'undo') {
      setReply('Undo requested. Say what you want me to fix and I’ll do it now.');
      setMode('idle');
      return;
    }
    if (directive.type === 'negative') {
      if (pendingConfirm) {
        setPendingConfirm(null);
        setReply('Canceled.');
      }
      setMode('idle');
      return;
    }
    if (directive.type === 'affirmative' && pendingConfirm) {
      const pending = pendingConfirm;
      setPendingConfirm(null);
      submitCommand(pending.command, { source: `${source}_confirmed` });
      return;
    }

    if (!spokenText) return;
    if (shouldBlockForDrivingSafety(spokenText, speedMph)) {
      setMode('idle');
      setReply('That task needs eyes on screen or touch input. I can queue it for your next safe stop.');
      speak('That task needs eyes on screen. Ask again when safely stopped.');
      return;
    }

    const risk = assessRiskLevel(spokenText);
    if (risk !== 'low' && directive.type !== 'affirmative') {
      setPendingConfirm({ command: spokenText, risk });
      setMode('idle');
      const ask = risk === 'critical'
        ? `Critical action: ${spokenText}. Say "confirm" to execute, or "cancel".`
        : `Confirm this action: ${spokenText}. Say "confirm" or "cancel".`;
      setReply(ask);
      speak(ask);
      return;
    }

    submitCommand(spokenText, { source });
  }, [pendingConfirm, speedMph, submitCommand]);

  // ---- Push-to-Talk ----
  const onTranscript = useCallback((text) => {
    if (text?.trim()) processVoiceCommand(text, 'ptt');
  }, [processVoiceCommand]);
  const ptt = usePushToTalk({ onTranscript, silenceMs: voiceProfile === 'truck_noise' ? 1800 : 1500 });

  // ---- Wake Word (always-on once unlocked) ----
  // Auto-submit command — no confirmation gate.
  const onWake = useCallback((command) => {
    chime();
    if (command?.trim()) processVoiceCommand(command, 'wake_word');
  }, [processVoiceCommand]);

  // Wake word is always enabled once the user has tapped to unlock.
  // Phrases: single word "copilot" plus common variants.
  const wakeEnabled = unlocked && !inIframe && sttSupported;
  const wakeWord = useWakeWord({
    enabled: wakeEnabled && !hidden,
    wakePhrases: ['copilot', 'hey co-pilot', 'hey copilot', 'hey roadboss', 'roadboss'],
    onCommand: onWake,
  });

  // Auto-disable + warn on persistent permission errors (wake-word path)
  useEffect(() => {
    if (wakeWord.lastError === 'not-allowed' || wakeWord.lastError === 'service-not-allowed') {
      toast.error('Mic permission denied. Tap the address-bar lock → Microphone → Allow, then reload.', { duration: 8000 });
      setUnlocked(false);
      try { localStorage.removeItem(STORAGE_UNLOCK); } catch {}
    }
  }, [wakeWord.lastError]);

  // Show ptt errors
  useEffect(() => {
    if (ptt.error === 'not-allowed' || ptt.error === 'service-not-allowed') {
      toast.error('Mic permission denied. Tap the address-bar lock → Microphone → Allow, then reload.', { duration: 8000 });
    } else if (ptt.error === 'not_supported') {
      toast.error('Voice not supported on this browser. Use the type box instead.', { duration: 5000 });
      setShowInput(true);
    }
  }, [ptt.error]);

  // ALL hooks above this line. Now we can safely bail on hidden routes.
  if (hidden) return null;

  // Lift the orb up over the bottom nav on driver/wrecker pages.
  const hasBottomNav = location.pathname.startsWith('/driver') || location.pathname.startsWith('/wrecker');
  const fabPositionCls = hasBottomNav ? 'bottom-24 right-4 sm:bottom-24 sm:right-5' : 'bottom-4 right-4 sm:bottom-5 sm:right-5';

  const handleOrbTap = () => {
    // First-time: unlock iOS audio
    if (!unlocked) {
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0.01;
        window.speechSynthesis.speak(u);
      } catch {}
      setUnlocked(true);
      if (inIframe) {
        toast.error('Microphone is blocked inside the preview iframe. Open in a real Safari tab for full voice.', { duration: 7000 });
        setShowInput(true);
      } else if (!sttSupported) {
        toast.error('Voice not supported on this browser. Use the type box instead.', { duration: 5000 });
        setShowInput(true);
      } else {
        toast.success('Co-Pilot active. Say "Copilot" or tap to talk.', { duration: 3000 });
      }
      return;
    }

    // If currently recording → stop and let onTranscript fire
    if (ptt.recording) {
      ptt.stop();
      return;
    }

    // If thinking/speaking → don't interrupt
    if (mode === 'thinking' || mode === 'speaking') return;

    // Cannot record in iframe or unsupported browser — toggle text input instead
    if (inIframe || !sttSupported) {
      setShowInput((s) => !s);
      return;
    }

    // Start a fresh push-to-talk capture (no confirmation gate — auto-submits)
    setReply('');
    chime();
    ptt.start();
  };

  const onTypedSubmit = (e) => {
    e.preventDefault();
    if (!typed.trim()) return;
    processVoiceCommand(typed, 'typed');
    setTyped('');
    setShowInput(false);
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
    if (ptt.recording) return ptt.interim || 'Listening…';
    if (wakeEnabled && wakeWord.armed) return 'Go ahead…';
    if (wakeEnabled && wakeWord.listening) return 'Say "Copilot…"';
    if (queueSize > 0) return `${queueSize} queued for sync`;
    if (unlocked) return 'Tap to talk';
    return 'Tap to activate';
  })();

  // Status pill is only visible while something is actively happening
  const isActive = ptt.recording || mode !== 'idle' || (wakeEnabled && wakeWord.armed);

  const statusPillCls = (() => {
    const base = 'rounded-full px-3 py-1 text-xs font-semibold shadow-lg border max-w-[200px] truncate';
    if (mode === 'thinking') return `${base} bg-amber-500/20 border-amber-500/40 text-amber-200`;
    if (mode === 'speaking') return `${base} bg-emerald-500/20 border-emerald-500/40 text-emerald-200`;
    if (ptt.recording) return `${base} bg-red-500/20 border-red-500/40 text-red-200`;
    if (wakeWord.armed) return `${base} bg-red-500/20 border-red-500/40 text-red-200`;
    return `${base} bg-sky-500/20 border-sky-500/40 text-sky-200`;
  })();

  return (
    <div
      className={`fixed ${fabPositionCls} z-[2147483500] flex flex-col items-end gap-2`}
      data-testid="global-copilot-fab-wrapper"
    >
      {/* Iframe warning */}
      {unlocked && inIframe && (
        <div className="max-w-[220px] rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-amber-200 text-xs flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Mic blocked in preview.{' '}
            <button
              onClick={() => window.open(window.location.href, '_blank')}
              className="font-semibold inline-flex items-center gap-0.5 underline"
            >
              Open in tab <ExternalLink className="w-2.5 h-2.5" />
            </button>
          </span>
        </div>
      )}

      {/* Reply bubble — auto-dismisses 4 s after speaking ends */}
      {reply && (
        <div
          className="max-w-[240px] rounded-xl bg-slate-950/97 border border-slate-700 shadow-xl px-3 py-2 text-sm text-slate-100 leading-snug"
          data-testid="global-copilot-reply"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3 h-3 text-sky-400 flex-shrink-0" />
            <span className="text-[10px] uppercase tracking-widest text-sky-300/80 font-bold">Co-Pilot</span>
          </div>
          {reply}
        </div>
      )}

      {/* Status pill — only when actively recording / thinking / speaking / armed */}
      {isActive && (
        <div className={statusPillCls}>
          {statusLabel}
        </div>
      )}

      {/* Text input fallback — hidden unless voice is unavailable or user toggles it */}
      {showInput && (
        <form
          onSubmit={onTypedSubmit}
          className="flex items-center gap-2 rounded-xl bg-slate-950/97 border border-slate-700 shadow-xl px-2 py-2 w-[220px]"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-white text-sm focus:outline-none min-w-0"
            data-testid="global-copilot-input"
          />
          <button
            type="submit"
            disabled={!typed.trim() || mode === 'thinking'}
            className="flex-shrink-0 p-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950"
            data-testid="global-copilot-send"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Orb row — main tap target; optional close-input button */}
      <div className="flex items-center gap-2">
        {showInput && (
          <button
            onClick={() => setShowInput(false)}
            className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center"
            aria-label="Close keyboard input"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {/* Show keyboard toggle when voice is unavailable and input is hidden */}
        {!showInput && unlocked && (inIframe || !sttSupported) && (
          <button
            onClick={() => setShowInput(true)}
            className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center"
            aria-label="Open keyboard input"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
        )}
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
    </div>
  );
}
