// WakeWordBar — a thin floating bar that lets the driver enable always-on wake word listening.
// Mounted at the DriverShell level so it persists across pages (HOS, Trips, Truck, Settings, etc).
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, MicOff, Sparkles, ExternalLink, AlertTriangle } from 'lucide-react';
import { useWakeWord, isInIframe, supportsSTT } from '@/hooks/useWakeWord';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const WAKE_PRESETS = {
  'hey-copilot': ['hey co-pilot', 'hey copilot', 'a copilot', 'a co-pilot'],
  'highway-pilot': ['highway pilot', 'high pilot'],
  'hey-boss': ['hey boss', 'a boss'],
  'hey-roadboss': ['hey roadboss', 'hey road boss', 'roadboss', 'road boss'],
};

const PRESET_LABELS = {
  'hey-copilot': 'Hey Co-Pilot',
  'highway-pilot': 'Highway Pilot',
  'hey-boss': 'Hey Boss',
  'hey-roadboss': 'Hey RoadBoss',
};

const STORAGE_KEY = 'roadboss.wakeword.v1';

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, preset: 'hey-copilot' };
}

function savePrefs(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 1; u.volume = 1; u.lang = 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}

function chime() {
  // Short ascending two-note chime via WebAudio so user knows the wake word fired
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.01 + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 + i * 0.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + 0.22 + i * 0.08);
    });
    setTimeout(() => { try { ctx.close(); } catch {} }, 600);
  } catch {}
}

export function WakeWordBar() {
  const navigate = useNavigate();
  const [{ enabled, preset }, setPrefs] = useState(loadPrefs);
  const [showSettings, setShowSettings] = useState(false);
  const [executing, setExecuting] = useState(false);
  const inIframe = isInIframe();
  const sttOk = supportsSTT();

  const updatePrefs = (patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  };

  const onCommand = useCallback(async (command) => {
    if (!command || executing) return;
    setExecuting(true);
    chime();
    toast.success(`Heard: "${command}"`);
    try {
      const r = await api.post('/copilot/chat', { message: command });
      const reply = r.data?.reply || '';
      if (reply) speak(reply);
      const action = r.data?.action;
      if (action?.executed) {
        const t = action.type;
        if (t === 'duty_change') toast.success(`Status: ${action.new_status?.replace('_', ' ')}`);
        if (t === 'start_trip') toast.success(`Trip started: ${action.origin} → ${action.destination}`);
        if (t === 'end_trip') toast.success('Trip completed');
        if (t === 'log_fuel') toast.success('Fuel stop logged');
        if (t === 'start_inspection' && action.redirect) {
          toast.success(`${action.inspection_type === 'pre_trip' ? 'Pre' : 'Post'}-trip inspection started`);
          setTimeout(() => navigate(action.redirect), 1500);
        }
      } else if (action?.error) {
        toast.info(action.error);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Co-Pilot is unavailable.');
    } finally { setExecuting(false); }
  }, [executing, navigate]);

  const phrases = WAKE_PRESETS[preset] || WAKE_PRESETS['hey-copilot'];
  const { listening, armed, lastError, lastHeard } = useWakeWord({
    enabled: enabled && !inIframe && sttOk,
    wakePhrases: phrases,
    onCommand,
  });

  // Auto-disable + warn if it persistently fails (e.g., permission denied)
  useEffect(() => {
    if (lastError === 'not-allowed' || lastError === 'service-not-allowed') {
      toast.error('Microphone permission denied. Tap the lock icon → Microphone → Allow, then reload.');
      updatePrefs({ enabled: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastError]);

  const cannotEnable = inIframe || !sttOk;

  const openInTab = () => {
    try { window.open(window.location.href, '_blank'); } catch {}
  };

  // Compact bar UI
  return (
    <>
      <div
        className={`fixed bottom-[88px] left-1/2 -translate-x-1/2 z-[2147483600] transition-all duration-200`}
        data-testid="wake-word-bar"
      >
        <button
          onClick={() => {
            if (cannotEnable) { setShowSettings(true); return; }
            updatePrefs({ enabled: !enabled });
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded-full border backdrop-blur transition-colors text-xs font-medium shadow-lg
            ${enabled && listening
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
              : enabled
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                : 'bg-slate-900/80 border-white/10 text-slate-300 hover:bg-white/5'}
          `}
          data-testid="wake-word-toggle"
          aria-label={enabled ? 'Wake word listening — tap to turn off' : 'Turn on wake word listening'}
        >
          {enabled
            ? <Radio className={`w-3.5 h-3.5 ${listening ? 'animate-pulse' : ''}`} />
            : <MicOff className="w-3.5 h-3.5" />}
          <span>
            {enabled
              ? (armed ? `Listening: speak now…`
                  : listening ? `Say "${PRESET_LABELS[preset]}…"`
                  : 'Wake mic starting…')
              : 'Wake word: off'}
          </span>
          <Sparkles className="w-3 h-3 opacity-60" />
        </button>
        {enabled && lastHeard && (
          <div className="mt-1 mx-auto max-w-[300px] text-[10px] text-slate-500 truncate text-center" data-testid="wake-last-heard">
            heard: "{lastHeard}"
          </div>
        )}
      </div>

      {/* Settings popover */}
      {showSettings && (
        <div className="fixed inset-0 z-[2147483601] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowSettings(false)} data-testid="wake-settings-modal">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-2xl sm:rounded-2xl hp-panel-bordered p-5 m-0 sm:m-4">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-sky-400" />
              <div className="text-base font-semibold text-white">Hands-Free Wake Word</div>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Once enabled, you can say a wake phrase out loud and Co-Pilot will respond — no tapping the screen.
            </div>

            {inIframe && (
              <div className="mt-4 rounded-lg p-3 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2" data-testid="iframe-warning">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Microphone is blocked in the preview window.</div>
                  <div className="mt-1">iOS Safari blocks the mic inside embedded previews. Open the app in a real browser tab to use voice features.</div>
                  <button onClick={openInTab} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 text-slate-950 font-semibold" data-testid="open-in-tab-btn">
                    <ExternalLink className="w-3.5 h-3.5" /> Open in a new tab
                  </button>
                </div>
              </div>
            )}

            {!sttOk && !inIframe && (
              <div className="mt-4 rounded-lg p-3 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                Voice recognition isn't supported on this browser. Try Safari (iOS) or Chrome (Android/desktop).
              </div>
            )}

            {lastError && lastError !== 'not-allowed' && lastError !== 'aborted' && lastError !== 'no-speech' && (
              <div className="mt-3 rounded-lg p-3 bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
                Mic error: <span className="font-mono">{lastError}</span>. Check microphone permissions.
              </div>
            )}

            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-widest text-sky-400/80">Wake phrase</label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {Object.keys(PRESET_LABELS).map((key) => (
                  <button
                    key={key}
                    onClick={() => updatePrefs({ preset: key })}
                    className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${preset === key ? 'bg-sky-500/15 border-sky-500/40 text-sky-200' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
                    data-testid={`wake-preset-${key}`}
                  >
                    "{PRESET_LABELS[key]}"
                    {preset === key && <span className="ml-2 text-[10px] text-sky-400 uppercase tracking-wider">active</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={() => { updatePrefs({ enabled: !enabled }); }}
                disabled={cannotEnable}
                className={`flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ${enabled ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-sky-500 hover:bg-sky-400 text-slate-950'}`}
                data-testid="wake-enable-btn"
              >
                {enabled ? 'Turn OFF wake word' : 'Turn ON wake word'}
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-3 py-2.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 text-sm"
                data-testid="wake-close-btn"
              >
                Close
              </button>
            </div>
            <div className="mt-3 text-[10px] text-slate-500">
              First time you turn this on, your browser will ask for mic permission. Allow it.
              The wake word stays on across all driver pages until you turn it off.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
