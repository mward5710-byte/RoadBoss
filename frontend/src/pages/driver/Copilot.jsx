import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, Loader2, RotateCcw, ArrowLeft, Sparkles, Radio, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, getUser } from '@/lib/api';
import { toast } from 'sonner';
import { isInIframe } from '@/hooks/useWakeWord';

// Modes: idle | listening | thinking | speaking
//
// iOS Safari quirks:
//  - The silent switch on iPhone MUTES Web Audio / SpeechSynthesis even at
//    full volume. We can't detect that programmatically, so we expose a
//    "Test Voice" button so Mike can verify in 1 second.
//  - TTS won't fire until the user has performed at least one gesture in
//    the page. We unlock TTS by speaking a brief silent utterance the
//    first time the user taps anything in the cockpit.
//  - Some iOS versions need `speechSynthesis.resume()` after pause.
let __ttsUnlocked = false;
function unlockTTS() {
  if (__ttsUnlocked) return;
  try {
    if (!('speechSynthesis' in window)) return;
    // A near-silent utterance that primes the TTS engine on iOS Safari.
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0.01; u.rate = 1; u.pitch = 1;
    window.speechSynthesis.speak(u);
    __ttsUnlocked = true;
  } catch (_) {}
}

function pickPreferredVoice() {
  try {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    if (!voices.length) return null;
    // Prefer en-US, prefer male/clear voices for trucker vibe
    const en = voices.filter((v) => /en[-_]US/i.test(v.lang) || v.lang.startsWith('en'));
    const preferredNames = [/Daniel/i, /Aaron/i, /Fred/i, /Alex/i, /Google US English/i, /Microsoft.*David/i];
    for (const re of preferredNames) {
      const m = en.find((v) => re.test(v.name));
      if (m) return m;
    }
    return en[0] || voices[0];
  } catch (_) { return null; }
}

function speak(text, onEnd) {
  try {
    if (!('speechSynthesis' in window)) { onEnd && onEnd(); return null; }
    unlockTTS();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 1; u.volume = 1; u.lang = 'en-US';
    const voice = pickPreferredVoice();
    if (voice) u.voice = voice;
    u.onend = () => onEnd && onEnd();
    u.onerror = () => onEnd && onEnd();
    window.speechSynthesis.cancel();
    // Some iOS versions get stuck "paused" — resume to be safe
    try { window.speechSynthesis.resume(); } catch (_) {}
    window.speechSynthesis.speak(u);
    return u;
  } catch (e) { console.error('TTS failed', e); onEnd && onEnd(); return null; }
}

export default function Copilot() {
  const navigate = useNavigate();
  const me = getUser();
  const isWrecker = me?.role === 'wrecker_operator';
  const backTo = isWrecker ? '/wrecker' : '/driver';
  const backLabel = isWrecker ? 'Board' : 'Cab';
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState('idle'); // idle | listening | thinking | speaking
  const [handsFree, setHandsFree] = useState(false);
  const [muted, setMuted] = useState(false);
  const [partial, setPartial] = useState('');
  const recogRef = useRef(null);
  const handsFreeRef = useRef(false);
  const mutedRef = useRef(false);
  const scrollRef = useRef(null);

  const supportsSTT = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  // Keep refs in sync
  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // SAFETY NET: if the recognizer freezes (mode stuck on 'listening' or
  // 'thinking' with no progress for 30s) auto-reset so the screen never
  // appears locked. This was the bug Mike hit — no way out of a hung mic.
  useEffect(() => {
    if (mode !== 'listening' && mode !== 'thinking') return;
    const t = setTimeout(() => {
      console.warn(`[Copilot] auto-reset from stuck mode=${mode}`);
      try { recogRef.current?.stop?.(); } catch (_) {}
      try { window.speechSynthesis?.cancel(); } catch (_) {}
      setMode('idle');
      setPartial('');
      toast.info('Co-Pilot reset — tap the mic to try again.');
    }, 30000);
    return () => clearTimeout(t);
  }, [mode]);

  // iOS Safari: TTS engine sometimes needs voiceschanged before it works.
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const handle = () => { /* no-op — just triggers voice list load */ };
    window.speechSynthesis.addEventListener?.('voiceschanged', handle);
    // Force-load voices on mount
    try { window.speechSynthesis.getVoices(); } catch (_) {}
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', handle);
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, partial]);

  // Load history once
  useEffect(() => {
    api.get('/copilot/history').then((r) => {
      setMessages(r.data?.messages || []);
    }).catch(() => {});
    return () => {
      try { window.speechSynthesis?.cancel(); } catch {}
      try { recogRef.current?.stop?.(); } catch {}
    };
  }, []);

  const sendToCopilot = useCallback(async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    const userMsg = { id: `u-${Date.now()}`, role: 'user', content: trimmed, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setPartial('');
    setMode('thinking');
    try {
      const r = await api.post('/copilot/chat', { message: trimmed });
      const reply = r.data?.reply || "Sorry boss, I didn't catch that.";
      const aMsg = { id: `a-${Date.now()}`, role: 'assistant', content: reply, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, aMsg]);

      // Action feedback
      const action = r.data?.action;
      if (action?.executed) {
        const t = action.type;
        if (t === 'duty_change') toast.success(`Status: ${action.new_status?.replace('_', ' ')}`);
        if (t === 'start_trip') toast.success(`Trip started: ${action.origin} → ${action.destination}`);
        if (t === 'end_trip') toast.success('Trip completed');
        if (t === 'log_fuel') toast.success('Fuel stop logged');
        if (t === 'tow_job_status') toast.success(`${action.customer || 'Job'} → ${action.new_status?.replace('_', ' ')}`);
        if (t === 'tow_job_next' && action.customer) {
          toast.success(`Next: ${action.customer} — ${action.service_type}`);
        }
        if (t === 'fuel_check' && action.tanks?.length) {
          const main = action.tanks[0];
          toast.success(`${main.name}: ${main.current_gallons} gal (${main.percent}%)`);
        }
        if (t === 'impound_quick') toast.success('Impound record created');
        if (t === 'navigate' && action.redirect) {
          toast.success(`Opening ${action.label || action.target || 'screen'}…`);
          // Speak first, then route — keeps it truly hands-free.
          if (mutedRef.current) {
            setMode('idle');
            setTimeout(() => navigate(action.redirect), 400);
          } else {
            setMode('speaking');
            speak(reply, () => {
              setMode('idle');
              navigate(action.redirect);
            });
          }
          return;
        }
        if (t === 'start_inspection' && action.redirect) {
          toast.success(`${action.inspection_type === 'pre_trip' ? 'Pre' : 'Post'}-trip inspection started`);
          // Speak first, then navigate to the inspection page (it auto-runs voice walkthrough)
          if (mutedRef.current) {
            setMode('idle');
            setTimeout(() => navigate(action.redirect), 400);
          } else {
            setMode('speaking');
            speak(reply, () => {
              setMode('idle');
              navigate(action.redirect);
            });
          }
          return;
        }
      } else if (action?.error) {
        toast.info(action.error);
      }

      if (mutedRef.current) {
        setMode('idle');
        if (handsFreeRef.current) setTimeout(() => beginListen(), 300);
        return;
      }

      setMode('speaking');
      speak(reply, () => {
        setMode('idle');
        if (handsFreeRef.current) {
          setTimeout(() => beginListen(), 350);
        }
      });
    } catch (e) {
      const errMsg = e?.response?.data?.detail || 'Co-Pilot is offline right now.';
      toast.error(errMsg);
      const aMsg = { id: `a-${Date.now()}`, role: 'assistant', content: errMsg, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, aMsg]);
      setMode('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginListen = useCallback(() => {
    if (mode === 'listening') return;
    if (!supportsSTT) {
      const t = window.prompt('Type your message to Co-Pilot:');
      if (t) sendToCopilot(t);
      return;
    }
    if (isInIframe()) {
      toast.error('Mic blocked in preview. Open the app in a real Safari tab.', {
        action: { label: 'Open', onClick: () => window.open(window.location.href, '_blank') },
        duration: 8000,
      });
      return;
    }
    try {
      const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new Recog();
      r.lang = 'en-US';
      r.interimResults = true;
      // Continuous listening so drivers can speak full thoughts with natural pauses.
      // We use a silence timer (below) to auto-flush when they actually stop talking.
      r.continuous = true;
      r.maxAlternatives = 1;

      // Per-recognizer state (lives on the recognizer object so multiple instances don't collide)
      let finalAccum = '';
      let silenceTimer = null;
      const clearSilence = () => { if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; } };
      const flushAndStop = () => {
        clearSilence();
        const text = (finalAccum || '').trim();
        finalAccum = '';
        try { r.stop(); } catch {}
        if (text) sendToCopilot(text);
      };

      r.onstart = () => { setMode('listening'); setPartial(''); };

      r.onerror = (ev) => {
        clearSilence();
        const errCode = ev?.error || 'unknown';
        // 'no-speech' / 'aborted' aren't real errors — driver was just thinking. Auto-restart in hands-free.
        if (errCode === 'no-speech' || errCode === 'aborted') {
          setMode('idle');
          if (handsFreeRef.current) {
            setTimeout(() => beginListen(), 400);
          }
          return;
        }
        setMode('idle');
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          toast.error('Mic permission denied. Tap the address-bar lock → Microphone → Allow, then reload.', { duration: 8000 });
        } else if (errCode === 'audio-capture') {
          toast.error('Could not capture audio. If you are in the Emergent preview, open the app in a real Safari tab.', {
            action: { label: 'Open in tab', onClick: () => window.open(window.location.href, '_blank') },
            duration: 10000,
          });
        } else if (errCode === 'network') {
          // Web Speech API uses a cloud service — flaky on bad cell signal. Quietly retry in hands-free.
          if (handsFreeRef.current) {
            setTimeout(() => beginListen(), 800);
          } else {
            toast.error('Mic network hiccup. Tap the mic to try again.');
          }
        } else {
          toast.error(`Mic error: ${errCode}`);
        }
      };

      r.onend = () => {
        clearSilence();
        // If we ended without a flush (e.g., browser auto-stopped), push whatever we caught.
        const text = (finalAccum || '').trim();
        finalAccum = '';
        if (text) {
          sendToCopilot(text);
          return;
        }
        // Use functional update so we don't depend on stale `mode` from closure.
        setMode((m) => (m === 'listening' ? 'idle' : m));
      };

      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const txt = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            finalAccum = (finalAccum + ' ' + txt).trim();
          } else {
            interim += txt;
          }
        }
        if (interim || finalAccum) setPartial((interim || finalAccum).trim());
        // Reset the silence timer on every speech event. Once the driver stops for 1.4s, flush.
        clearSilence();
        silenceTimer = setTimeout(flushAndStop, 1400);
      };

      recogRef.current = r;
      r.start();
    } catch (e) {
      console.error(e);
      toast.error('Could not start mic. Check browser permissions.');
      setMode('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, supportsSTT, sendToCopilot]);

  const stopListen = () => {
    try { recogRef.current?.stop?.(); } catch {}
    setMode('idle');
  };

  const toggleHandsFree = () => {
    const next = !handsFree;
    setHandsFree(next);
    if (next) {
      toast.success('Hands-free mode on. Co-Pilot will keep listening.');
      if (mode === 'idle') beginListen();
    } else {
      toast.info('Hands-free mode off.');
      try { window.speechSynthesis?.cancel(); } catch {}
      if (mode === 'listening') stopListen();
      setMode('idle');
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (next) try { window.speechSynthesis?.cancel(); } catch {}
    toast.info(next ? 'Voice replies muted.' : 'Voice replies on.');
  };

  const resetConversation = async () => {
    try {
      await api.post('/copilot/reset', {});
      setMessages([]);
      toast.success('Conversation cleared. Fresh start.');
    } catch { toast.error('Could not reset.'); }
  };

  const replaySpoken = (text) => {
    if (mutedRef.current) return;
    setMode('speaking');
    speak(text, () => setMode('idle'));
  };

  const orbColor = {
    idle: 'bg-sky-500/20 border-sky-500/40',
    listening: 'bg-red-500/30 border-red-500/60 hp-voice-ring',
    thinking: 'bg-amber-500/20 border-amber-500/50',
    speaking: 'bg-emerald-500/20 border-emerald-500/50',
  }[mode];

  const statusLabel = {
    idle: 'Tap to talk',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking...',
  }[mode];

  const isBusy = mode !== 'idle';

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] text-slate-200" data-testid="copilot-page">
      {/* Iframe warning banner */}
      {isInIframe() && (
        <div className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs flex items-center gap-2" data-testid="iframe-warning-banner">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">Microphone is blocked in preview iframes. Open in a real tab to use voice.</span>
          <button
            onClick={() => window.open(window.location.href, '_blank')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500 text-slate-950 font-semibold text-[10px] uppercase tracking-wider"
            data-testid="copilot-open-tab-btn"
          >
            <ExternalLink className="w-3 h-3" /> Open
          </button>
        </div>
      )}

      {/* Top bar */}
      <div className="px-5 py-3 border-b border-white/5 bg-[#07090d]/80 backdrop-blur sticky top-[57px] z-20">
        <div className="flex items-center justify-between gap-3">
          <Link to={backTo} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors" data-testid="copilot-back-btn">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest">{backLabel}</span>
          </Link>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-sky-400/80 flex items-center justify-center gap-1.5"><Sparkles className="w-3 h-3" /> Co-Pilot AI</div>
            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${mode === 'idle' ? 'bg-sky-400' : mode === 'listening' ? 'bg-red-400 animate-pulse' : mode === 'thinking' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse'}`} />
              {statusLabel}
            </div>
          </div>
          <button
            onClick={resetConversation}
            disabled={isBusy}
            className="text-slate-500 hover:text-white p-1 disabled:opacity-40"
            data-testid="copilot-reset-btn"
            aria-label="Reset conversation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conversation area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3" data-testid="copilot-conversation">
        {messages.length === 0 && mode === 'idle' && (
          <div className="text-center py-10 px-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-sky-500/15 border border-sky-500/40 flex items-center justify-center mb-4">
              <Radio className="w-7 h-7 text-sky-400" />
            </div>
            <div className="text-lg font-semibold text-white">Ride with Co-Pilot</div>
            <div className="text-sm text-slate-400 mt-2 max-w-xs mx-auto">
              I'm your hands-free partner on the road. Ask about HOS, trips, dispatch, or anything else.
            </div>

            {/* TEST VOICE — Mike asked for this. One tap proves audio output is working
                so he knows the silent switch isn't the culprit. */}
            <button
              onClick={() => {
                unlockTTS();
                speak("Hey boss, your Co-Pilot is online and loud and clear. If you can't hear me, your iPhone silent switch on the side might be on, or your volume is down. Try flipping it.", () => {});
                toast.success('Speaking — listen for the reply.');
              }}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/25 transition-colors"
              data-testid="copilot-test-voice-btn"
            >
              <Volume2 className="w-4 h-4" /> Test Voice (no mic needed)
            </button>
            <div className="text-[10px] text-slate-600 mt-2 max-w-xs mx-auto leading-relaxed">
              No sound? Check your iPhone's silent switch on the side AND your volume. Web audio is muted when silent mode is on.
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 max-w-xs mx-auto text-left">
              {[
                'How much drive time do I have left?',
                "What's my next trip?",
                'Read me my latest alerts',
                'Switch me to sleeper berth',
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => sendToCopilot(s)}
                  disabled={isBusy}
                  className="text-sm text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50"
                  data-testid={`copilot-suggestion-${s.slice(0, 12).replace(/\s/g, '-').toLowerCase()}`}
                >
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id || m.created_at + m.role}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              data-testid={`copilot-msg-${m.role}`}
            >
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user'
                ? 'bg-sky-500 text-slate-950 font-medium rounded-br-sm'
                : 'bg-white/5 text-slate-100 border border-white/10 rounded-bl-sm'
                }`}>
                <div>{m.content}</div>
                {m.role === 'assistant' && (
                  <button
                    onClick={() => replaySpoken(m.content)}
                    disabled={isBusy}
                    className="mt-1.5 text-[10px] text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 disabled:opacity-50"
                    data-testid="copilot-replay-btn"
                  >
                    <Volume2 className="w-3 h-3" /> Repeat
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {partial && (
          <div className="flex justify-end" data-testid="copilot-partial">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm bg-sky-500/40 text-slate-100 italic">
              {partial}
            </div>
          </div>
        )}

        {mode === 'thinking' && (
          <div className="flex justify-start" data-testid="copilot-thinking">
            <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 bg-white/5 border border-white/10 inline-flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Co-Pilot is thinking...
            </div>
          </div>
        )}
      </div>

      {/* Mic dock */}
      <div className="border-t border-white/5 bg-[#07090d]/95 backdrop-blur px-5 pt-5 pb-6">
        <div className="flex items-center justify-around gap-3">
          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            className={`w-11 h-11 rounded-full border flex items-center justify-center transition-colors ${muted ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
            data-testid="copilot-mute-btn"
            aria-label={muted ? 'Unmute voice replies' : 'Mute voice replies'}
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          {/* Big mic */}
          <button
            onClick={mode === 'listening' ? stopListen : beginListen}
            disabled={mode === 'thinking' || mode === 'speaking'}
            className={`relative w-24 h-24 rounded-full flex items-center justify-center border-2 transition-all disabled:opacity-50 ${orbColor}`}
            data-testid="copilot-mic-btn"
            aria-label={mode === 'listening' ? 'Stop listening' : 'Start listening'}
          >
            {mode === 'thinking' ? <Loader2 className="w-9 h-9 text-amber-300 animate-spin" />
              : mode === 'speaking' ? <Volume2 className="w-9 h-9 text-emerald-300" />
              : mode === 'listening' ? <MicOff className="w-9 h-9 text-red-200" />
              : <Mic className="w-9 h-9 text-sky-300" />}
          </button>

          {/* Hands-free toggle */}
          <button
            onClick={toggleHandsFree}
            className={`w-11 h-11 rounded-full border flex items-center justify-center transition-colors ${handsFree ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
            data-testid="copilot-handsfree-btn"
            aria-label={handsFree ? 'Disable hands-free' : 'Enable hands-free'}
            title={handsFree ? 'Hands-free ON' : 'Hands-free OFF'}
          >
            <Radio className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-3 text-center text-[11px] text-slate-500">
          {handsFree
            ? 'Hands-free mode is ON — Co-Pilot will keep listening between turns.'
            : 'Tap the mic to talk. Tap the radio for continuous hands-free mode.'}
        </div>
        {!supportsSTT && (
          <div className="mt-2 text-center text-[11px] text-amber-400/80" data-testid="copilot-stt-warning">
            Voice input not supported on this browser — type prompt fallback will appear.
          </div>
        )}
      </div>
    </div>
  );
}
