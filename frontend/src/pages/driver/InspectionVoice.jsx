import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Volume2, VolumeX, Loader2, ArrowLeft, Check, AlertTriangle,
  MinusCircle, Pause, Play, ChevronLeft, ChevronRight, ClipboardCheck, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { isInIframe } from '@/hooks/useWakeWord';

// ============================================================================
// HANDS-FREE DVIR VOICE WALKTHROUGH
// ----------------------------------------------------------------------------
// This is the money-shot feature Mike asked for. The driver taps ONE button,
// locks their phone to the windshield, and Co-Pilot reads every inspection
// item out loud: "Item 7 of 58 — Headlights. Say pass, fail, or skip."
// They answer "pass" / "fail" / "skip" without ever touching the screen.
//
// Voice commands we understand:
//   pass / good / all good / clear / ok / okay / green      -> pass
//   fail / bad / broken / defect / problem / no good / red   -> defect (fail)
//   skip / n a / not applicable / na / none                   -> na
//   repeat / again / say that again / what                    -> speak the current item
//   back / previous / go back / one back                      -> jump to previous item
//   next / move on / skip it                                  -> (treats as NA and advances)
//   pause / hold on / wait / stop                             -> pause loop
//   resume / continue / go / keep going                       -> resume loop
//   exit / done / finish / i'm done / all done                -> finish → go to sign page
//
// iOS quirks handled:
//   - TTS gesture unlock (silent utterance on mount after user taps "Start")
//   - speechSynthesis.resume() after pause
//   - Auto-reset if recognizer hangs for 20s (no speech / network flake)
// ============================================================================

let __ttsUnlocked = false;
function unlockTTS() {
  if (__ttsUnlocked) return;
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0.01;
    window.speechSynthesis.speak(u);
    __ttsUnlocked = true;
  } catch (_) {}
}

function pickPreferredVoice() {
  try {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    if (!voices.length) return null;
    const en = voices.filter((v) => /en[-_]US/i.test(v.lang) || v.lang.startsWith('en'));
    const preferred = [/Daniel/i, /Aaron/i, /Fred/i, /Alex/i, /Google US English/i, /Microsoft.*David/i];
    for (const re of preferred) {
      const m = en.find((v) => re.test(v.name));
      if (m) return m;
    }
    return en[0] || voices[0];
  } catch (_) { return null; }
}

function speak(text, onEnd) {
  try {
    if (!('speechSynthesis' in window)) { onEnd?.(); return; }
    unlockTTS();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 1; u.volume = 1; u.lang = 'en-US';
    const v = pickPreferredVoice();
    if (v) u.voice = v;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.cancel();
    try { window.speechSynthesis.resume(); } catch (_) {}
    window.speechSynthesis.speak(u);
  } catch (e) { console.error('TTS failed', e); onEnd?.(); }
}

// Classifier: text -> intent
function classifyAnswer(raw) {
  const t = (raw || '').toLowerCase().trim();
  if (!t) return null;
  // Exit first (highest priority)
  if (/(all\s*done|i'?m\s*done|finish(ed)?|exit|stop(\s*walk)?|quit|end\s*inspection)/.test(t)) return 'exit';
  if (/(pause|hold\s*on|wait\s*a\s*(sec|minute|moment)|one\s*sec)/.test(t)) return 'pause';
  if (/(resume|continue|keep\s*going|go\s*ahead|unpause)/.test(t)) return 'resume';
  if (/(repeat|say\s*(that\s*)?again|what\s*(did\s*you\s*say|was\s*that)|come\s*again|one\s*more\s*time)/.test(t)) return 'repeat';
  if (/(go\s*back|back\s*(up|one)|previous|last\s*(one|item))/.test(t)) return 'back';
  // Status answers
  if (/(skip|n\.?\s*a\.?|not\s*applicable|none|doesn'?t\s*apply)/.test(t)) return 'na';
  if (/^(no\s*good|bad|broken|defect(ive)?|fail(ed)?|red|problem|issue|leak(ing)?|cracked?|worn)/.test(t)) return 'defect';
  if (/(fail|defect|broken|busted|damaged?|leak|crack|problem|issue|bad|red\s*flag)/.test(t)) return 'defect';
  if (/^(pass(ed)?|good|all\s*good|clear|ok(ay)?|ready|green|fine|looks?\s*good|no\s*issues?|yes)/.test(t)) return 'pass';
  if (/(pass|good|clear|ok|okay|green|fine|no\s*issues?)/.test(t)) return 'pass';
  if (/(next|move\s*on)/.test(t)) return 'next';
  return null;
}

// How we announce an item when we read it out loud
function itemLine(idx, total, item) {
  const label = item.label || item.key;
  if (item.type === 'check') {
    return `Item ${idx + 1} of ${total}. ${label}. Say pass, fail, or skip.`;
  }
  // Text-type items can't be voice-answered — we let the driver skip past them
  return `Item ${idx + 1} of ${total}. ${label}. This one needs typing — say skip to continue or pause to stop.`;
}

export default function InspectionVoice() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState('idle'); // idle | speaking | listening | saving | paused | done
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastAnswer, setLastAnswer] = useState(null); // { status, label }

  const recogRef = useRef(null);
  const runningRef = useRef(false);
  const idxRef = useRef(0);
  const mutedRef = useRef(false);
  const itemsRef = useRef([]);

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const supportsSTT = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  // Load inspection doc on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await api.get(`/inspections/${id}`);
        if (!mounted) return;
        setDoc(r.data);
        itemsRef.current = r.data?.items || [];
        // Skip to first non-pending item? No — drive through from top to bottom.
        // But if this doc is already certified, don't allow voice walkthrough.
        if (r.data?.status === 'certified') {
          toast.info('This inspection is already signed.');
          navigate(`/driver/inspection/${id}`, { replace: true });
          return;
        }
      } catch (e) {
        toast.error('Could not load inspection');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      try { window.speechSynthesis?.cancel(); } catch {}
      try { recogRef.current?.stop?.(); } catch {}
    };
  }, [id, navigate]);

  // Force voice list load on iOS
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const h = () => {};
    window.speechSynthesis.addEventListener?.('voiceschanged', h);
    try { window.speechSynthesis.getVoices(); } catch (_) {}
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', h);
  }, []);

  // Safety: if recognizer or TTS stalls for > 25s, auto-reset to idle
  useEffect(() => {
    if (mode !== 'listening' && mode !== 'speaking' && mode !== 'saving') return;
    const t = setTimeout(() => {
      console.warn('[InspectionVoice] auto-reset from stuck mode=', mode);
      try { recogRef.current?.stop?.(); } catch {}
      try { window.speechSynthesis?.cancel(); } catch {}
      setMode('paused');
      setRunning(false);
      toast.info('Voice loop reset — tap Resume to keep going.');
    }, 25000);
    return () => clearTimeout(t);
  }, [mode]);

  const items = doc?.items || [];
  const total = items.length;

  const currentItem = items[idx] || null;

  const progress = useMemo(() => {
    const done = items.filter((i) => {
      if (i.type === 'check') return i.status && i.status !== 'pending';
      return !!(i.value || i.optional);
    }).length;
    return { done, total };
  }, [items]);

  // ---- Core loop helpers ----

  const saveStatus = useCallback(async (item, status) => {
    try {
      setMode('saving');
      await api.put(`/inspections/${id}/item`, { key: item.key, status });
      // Update local doc state so UI reflects it
      setDoc((prev) => {
        if (!prev) return prev;
        const its = prev.items.map((it) => (it.key === item.key ? { ...it, status, updated_at: new Date().toISOString() } : it));
        itemsRef.current = its;
        return { ...prev, items: its };
      });
      setLastAnswer({ status, label: item.label });
    } catch (e) {
      toast.error('Save failed — try again.');
    }
  }, [id]);

  const listenForAnswer = useCallback(() => {
    if (!runningRef.current) return;
    if (!supportsSTT) {
      // Fallback: give the driver manual buttons (handled by UI below)
      setMode('idle');
      return;
    }
    if (isInIframe()) {
      toast.error('Mic is blocked inside the preview iframe. Open in a real Safari tab to use voice.', {
        action: { label: 'Open', onClick: () => window.open(window.location.href, '_blank') },
        duration: 8000,
      });
      setRunning(false);
      setMode('paused');
      return;
    }
    try {
      const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new Recog();
      r.lang = 'en-US';
      r.interimResults = true;
      r.continuous = true;
      r.maxAlternatives = 1;

      let finalText = '';
      let silenceTimer = null;
      const clearSilence = () => { if (silenceTimer) clearTimeout(silenceTimer); silenceTimer = null; };

      const flush = () => {
        clearSilence();
        const text = (finalText || '').trim();
        finalText = '';
        try { r.stop(); } catch {}
        if (text) handleAnswer(text);
        else if (runningRef.current) {
          // No speech caught — re-prompt after a short delay
          setTimeout(() => listenForAnswer(), 400);
        }
      };

      r.onstart = () => { setMode('listening'); setTranscript(''); };
      r.onerror = (ev) => {
        clearSilence();
        const err = ev?.error;
        if (err === 'no-speech' || err === 'aborted') {
          if (runningRef.current) setTimeout(() => listenForAnswer(), 500);
          return;
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          toast.error('Mic permission denied. Enable microphone for this site, then reload.', { duration: 10000 });
          setRunning(false);
          setMode('paused');
          return;
        }
        if (err === 'network') {
          if (runningRef.current) setTimeout(() => listenForAnswer(), 800);
          return;
        }
        toast.error(`Mic error: ${err}`);
        setMode('paused');
        setRunning(false);
      };
      r.onend = () => {
        clearSilence();
        const text = (finalText || '').trim();
        finalText = '';
        if (text) {
          handleAnswer(text);
        }
      };
      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const txt = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            finalText = (finalText + ' ' + txt).trim();
          } else {
            interim += txt;
          }
        }
        const show = (interim || finalText).trim();
        if (show) setTranscript(show);
        clearSilence();
        silenceTimer = setTimeout(flush, 1200);
      };

      recogRef.current = r;
      r.start();
    } catch (e) {
      console.error(e);
      toast.error('Could not start mic.');
      setMode('paused');
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsSTT]);

  const speakAndListen = useCallback((text) => {
    if (!runningRef.current) return;
    setMode('speaking');
    setTranscript('');
    if (mutedRef.current) {
      // Muted → skip TTS, go straight to listening
      setTimeout(() => listenForAnswer(), 150);
      return;
    }
    speak(text, () => {
      if (!runningRef.current) return;
      listenForAnswer();
    });
  }, [listenForAnswer]);

  const advanceTo = useCallback((nextIdx) => {
    const list = itemsRef.current;
    if (!list.length) return;
    if (nextIdx >= list.length) {
      // Done!
      setRunning(false);
      setMode('done');
      const pass = list.filter((i) => i.type === 'check' && i.status === 'pass').length;
      const fail = list.filter((i) => i.type === 'check' && i.status === 'defect').length;
      const na = list.filter((i) => i.type === 'check' && i.status === 'na').length;
      speak(`All done, boss. ${pass} passed, ${fail} failed, ${na} marked N.A. Tap sign up top to certify.`, () => {});
      return;
    }
    setIdx(Math.max(0, nextIdx));
    // Speak the new item on next tick
    setTimeout(() => {
      const it = itemsRef.current[Math.max(0, nextIdx)];
      if (!it) return;
      speakAndListen(itemLine(Math.max(0, nextIdx), list.length, it));
    }, 200);
  }, [speakAndListen]);

  const handleAnswer = useCallback((raw) => {
    const intent = classifyAnswer(raw);
    const list = itemsRef.current;
    const cur = list[idxRef.current];
    if (!cur) return;

    // Unclear — ask again
    if (!intent) {
      speakAndListen(`I didn't catch that. Say pass, fail, or skip for ${cur.label}.`);
      return;
    }

    if (intent === 'exit') {
      setRunning(false);
      setMode('done');
      speak('Copy that, wrapping up. Tap sign to certify.', () => {
        setTimeout(() => navigate(`/driver/inspection/${id}/sign`), 500);
      });
      return;
    }
    if (intent === 'pause') {
      setRunning(false);
      setMode('paused');
      try { window.speechSynthesis?.cancel(); } catch {}
      try { recogRef.current?.stop?.(); } catch {}
      if (!mutedRef.current) speak('Paused. Tap resume when you are ready.', () => {});
      return;
    }
    if (intent === 'resume') {
      // Already implicitly running — just re-read current
      speakAndListen(itemLine(idxRef.current, list.length, cur));
      return;
    }
    if (intent === 'repeat') {
      speakAndListen(itemLine(idxRef.current, list.length, cur));
      return;
    }
    if (intent === 'back') {
      const prev = Math.max(0, idxRef.current - 1);
      advanceTo(prev);
      return;
    }
    if (intent === 'next') {
      // Mark NA and advance
      if (cur.type === 'check') saveStatus(cur, 'na');
      advanceTo(idxRef.current + 1);
      return;
    }

    // Status answer
    if (cur.type !== 'check') {
      // Text-type items: "skip" treated as advance only (value stays empty). Others, ignore.
      if (intent === 'na') {
        advanceTo(idxRef.current + 1);
      } else {
        speakAndListen(`This item needs typing. Say skip to continue, pause to stop, or done to finish.`);
      }
      return;
    }

    const statusMap = { pass: 'pass', defect: 'defect', na: 'na' };
    const status = statusMap[intent];
    if (!status) {
      speakAndListen(`I didn't catch that. Say pass, fail, or skip for ${cur.label}.`);
      return;
    }

    // Save + advance
    saveStatus(cur, status).then(() => {
      const ack = status === 'pass' ? 'Pass.' : status === 'defect' ? 'Logged as fail.' : 'Skipped.';
      if (mutedRef.current) {
        advanceTo(idxRef.current + 1);
      } else {
        setMode('speaking');
        speak(ack, () => advanceTo(idxRef.current + 1));
      }
    });
  }, [advanceTo, saveStatus, speakAndListen, navigate, id]);

  // ---- User controls ----

  const startWalkthrough = () => {
    if (!currentItem) return;
    unlockTTS();
    setRunning(true);
    runningRef.current = true;
    const intro = `Starting ${doc?.inspection_type === 'post_trip' ? 'post-trip' : 'pre-trip'} inspection. ${items.length} items total. Just say pass, fail, or skip after each one. Say pause any time to stop.`;
    setMode('speaking');
    speak(intro, () => {
      if (!runningRef.current) return;
      speakAndListen(itemLine(idxRef.current, items.length, items[idxRef.current]));
    });
  };

  const pauseWalkthrough = () => {
    setRunning(false);
    runningRef.current = false;
    try { window.speechSynthesis?.cancel(); } catch {}
    try { recogRef.current?.stop?.(); } catch {}
    setMode('paused');
  };

  const resumeWalkthrough = () => {
    unlockTTS();
    setRunning(true);
    runningRef.current = true;
    const cur = items[idxRef.current];
    if (cur) {
      speakAndListen(itemLine(idxRef.current, items.length, cur));
    } else {
      setRunning(false);
      setMode('done');
    }
  };

  // Manual buttons (for users without working mic, or as backup)
  const manualAnswer = (status) => {
    const cur = items[idxRef.current];
    if (!cur || cur.type !== 'check') return;
    saveStatus(cur, status).then(() => advanceTo(idxRef.current + 1));
  };

  const manualAdvance = (delta) => {
    const next = Math.min(items.length, Math.max(0, idxRef.current + delta));
    setIdx(next);
    idxRef.current = next;
  };

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      if (next) try { window.speechSynthesis?.cancel(); } catch {}
      toast.info(next ? 'TTS muted.' : 'TTS on.');
      return next;
    });
  };

  // ---- Render ----

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090d] flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading inspection…
      </div>
    );
  }
  if (!doc) return null;

  const statusIcon = {
    pass: <Check className="w-4 h-4 text-emerald-300" />,
    defect: <AlertTriangle className="w-4 h-4 text-red-300" />,
    na: <MinusCircle className="w-4 h-4 text-slate-400" />,
    pending: null,
  };

  const orbCls = {
    idle: 'bg-sky-500/20 border-sky-500/40',
    speaking: 'bg-emerald-500/20 border-emerald-500/50',
    listening: 'bg-red-500/30 border-red-500/60 hp-voice-ring',
    saving: 'bg-amber-500/20 border-amber-500/50',
    paused: 'bg-white/5 border-white/10',
    done: 'bg-emerald-500/25 border-emerald-500/60',
  }[mode] || 'bg-sky-500/20 border-sky-500/40';

  const statusLabel = {
    idle: 'Tap Start to begin',
    speaking: 'Reading item…',
    listening: 'Listening — say pass, fail, or skip',
    saving: 'Saving…',
    paused: 'Paused',
    done: 'Walkthrough complete',
  }[mode] || '';

  return (
    <div className="min-h-screen bg-[#07090d] text-slate-200 flex flex-col" data-testid="inspection-voice-page">
      {/* Iframe warning */}
      {isInIframe() && (
        <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs flex items-center gap-2" data-testid="iframe-warning-voice">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">Microphone is blocked inside the preview iframe. Manual pass/fail buttons still work, or open in a real Safari tab for full voice.</span>
        </div>
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-[#0a0e14]/95 backdrop-blur border-b border-white/5 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto">
          <Link to={`/driver/inspection/${id}`} className="flex items-center gap-2 text-slate-400 hover:text-white" data-testid="voice-back-btn">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest">Form View</span>
          </Link>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-amber-400 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Hands-Free DVIR
            </div>
            <div className="text-sm font-semibold text-white">
              {doc.inspection_type === 'post_trip' ? 'Post-Trip' : 'Pre-Trip'} · {progress.done}/{progress.total}
            </div>
          </div>
          <button
            onClick={toggleMute}
            className={`w-9 h-9 rounded-full border flex items-center justify-center transition ${muted ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
            data-testid="voice-mute-btn"
            aria-label={muted ? 'Unmute voice' : 'Mute voice'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
        {/* Progress bar */}
        <div className="mt-2 max-w-3xl mx-auto h-1 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full flex flex-col">
        {/* Current item hero card */}
        <div className="hp-panel rounded-2xl p-6 sm:p-8 mb-6 text-center">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">
            Item {Math.min(idx + 1, total)} of {total}
          </div>
          <AnimatePresence mode="wait">
            <motion.h1
              key={currentItem?.key || 'none'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight min-h-[3.5rem]"
              data-testid="voice-current-item"
            >
              {currentItem?.label || 'Done!'}
            </motion.h1>
          </AnimatePresence>
          {currentItem?.type === 'text' && (
            <div className="mt-2 text-[11px] uppercase tracking-wider text-amber-400">Text-entry item — skip via voice</div>
          )}
          {lastAnswer && (
            <motion.div
              key={lastAnswer.label + lastAnswer.status}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-400"
              data-testid="voice-last-answer"
            >
              Last: <span className="text-slate-200 font-medium">{lastAnswer.label}</span>
              <span className="text-slate-500">·</span>
              {statusIcon[lastAnswer.status]}
              <span className="uppercase tracking-wider text-[10px]">{lastAnswer.status}</span>
            </motion.div>
          )}
        </div>

        {/* Voice orb + state */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className={`relative w-28 h-28 rounded-full flex items-center justify-center border-2 transition-all ${orbCls}`} data-testid="voice-orb">
            {mode === 'speaking' ? <Volume2 className="w-10 h-10 text-emerald-300" />
              : mode === 'listening' ? <Mic className="w-10 h-10 text-red-200" />
              : mode === 'saving' ? <Loader2 className="w-10 h-10 text-amber-300 animate-spin" />
              : mode === 'paused' ? <Pause className="w-10 h-10 text-slate-400" />
              : mode === 'done' ? <Check className="w-10 h-10 text-emerald-300" />
              : <Mic className="w-10 h-10 text-sky-300" />}
          </div>
          <div className="text-xs uppercase tracking-widest text-slate-400" data-testid="voice-status-label">{statusLabel}</div>
          {transcript && mode === 'listening' && (
            <div className="text-sm text-slate-300 italic max-w-xs text-center" data-testid="voice-transcript">"{transcript}"</div>
          )}
        </div>

        {/* Primary controls */}
        <div className="flex flex-col gap-3">
          {!running && mode !== 'done' && (
            <Button
              onClick={idx === 0 && mode === 'idle' ? startWalkthrough : resumeWalkthrough}
              className="w-full h-14 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-base"
              data-testid="voice-start-btn"
            >
              <Play className="w-5 h-5 mr-2" />
              {idx === 0 && mode === 'idle' ? 'Start Walkthrough' : 'Resume'}
            </Button>
          )}
          {running && (
            <Button
              onClick={pauseWalkthrough}
              variant="outline"
              className="w-full h-14 bg-white/5 border-white/10 text-white hover:bg-white/10 font-semibold text-base"
              data-testid="voice-pause-btn"
            >
              <Pause className="w-5 h-5 mr-2" />
              Pause
            </Button>
          )}
          {mode === 'done' && (
            <Button
              onClick={() => navigate(`/driver/inspection/${id}/sign`)}
              className="w-full h-14 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-base"
              data-testid="voice-finish-btn"
            >
              <ClipboardCheck className="w-5 h-5 mr-2" /> Review &amp; Sign
            </Button>
          )}

          {/* Manual fallback — always visible so testers/iframe users can drive it */}
          {currentItem?.type === 'check' && mode !== 'done' && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              <button
                onClick={() => manualAnswer('pass')}
                className="py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-sm font-semibold uppercase tracking-wider hover:bg-emerald-500/25 transition flex items-center justify-center gap-1.5"
                data-testid="voice-manual-pass"
              >
                <Check className="w-4 h-4" /> Pass
              </button>
              <button
                onClick={() => manualAnswer('defect')}
                className="py-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-sm font-semibold uppercase tracking-wider hover:bg-red-500/25 transition flex items-center justify-center gap-1.5"
                data-testid="voice-manual-fail"
              >
                <AlertTriangle className="w-4 h-4" /> Fail
              </button>
              <button
                onClick={() => manualAnswer('na')}
                className="py-3 rounded-xl bg-slate-500/15 border border-slate-500/40 text-slate-300 text-sm font-semibold uppercase tracking-wider hover:bg-slate-500/25 transition flex items-center justify-center gap-1.5"
                data-testid="voice-manual-na"
              >
                <MinusCircle className="w-4 h-4" /> N/A
              </button>
            </div>
          )}

          {/* Jog buttons */}
          {mode !== 'done' && (
            <div className="flex items-center justify-between gap-2 mt-2">
              <button
                onClick={() => manualAdvance(-1)}
                disabled={idx === 0}
                className="flex-1 py-2.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs uppercase tracking-wider font-semibold hover:bg-white/10 disabled:opacity-40 flex items-center justify-center gap-1"
                data-testid="voice-prev-btn"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <button
                onClick={() => manualAdvance(1)}
                disabled={idx >= items.length - 1}
                className="flex-1 py-2.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs uppercase tracking-wider font-semibold hover:bg-white/10 disabled:opacity-40 flex items-center justify-center gap-1"
                data-testid="voice-next-btn"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Cheatsheet */}
        <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-slate-500 leading-relaxed">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Voice commands</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span><span className="text-emerald-400 font-semibold">"pass"</span> — item is good</span>
            <span><span className="text-red-400 font-semibold">"fail"</span> — write it up</span>
            <span><span className="text-slate-300 font-semibold">"skip"</span> — mark N/A</span>
            <span><span className="text-sky-400 font-semibold">"repeat"</span> — say item again</span>
            <span><span className="text-sky-400 font-semibold">"back"</span> — previous item</span>
            <span><span className="text-amber-400 font-semibold">"pause"</span> / <span className="text-amber-400 font-semibold">"resume"</span></span>
            <span><span className="text-emerald-400 font-semibold">"done"</span> — finish + sign</span>
          </div>
        </div>
      </main>
    </div>
  );
}
