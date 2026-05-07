// usePushToTalk — Single-shot voice capture. The opposite of the wake-word
// hot-mic: nothing is listening until you call `start()`. It captures one
// utterance, auto-stops on silence or when you call `stop()`, and hands you
// back the final transcript via `onTranscript`.
//
// This is the "demo-grade reliable" path — zero false triggers because the
// mic is OFF until the user explicitly taps the orb.

import { useCallback, useEffect, useRef, useState } from 'react';

export function usePushToTalk({ onTranscript, silenceMs = 1500, lang = 'en-US' }) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const recogRef = useRef(null);
  const finalRef = useRef('');
  const silenceTimerRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    clearSilenceTimer();
    try { recogRef.current?.stop?.(); } catch {}
  }, []);

  const cancel = useCallback(() => {
    clearSilenceTimer();
    finalRef.current = '';
    setInterim('');
    try { recogRef.current?.abort?.(); } catch {}
    setRecording(false);
  }, []);

  const start = useCallback(() => {
    const Recog = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Recog) {
      setError('not_supported');
      return false;
    }
    // Already running? bail.
    if (recogRef.current) return true;

    try {
      const r = new Recog();
      r.lang = lang;
      r.interimResults = true;
      r.continuous = false; // single-shot — Web Speech will close after the user stops talking
      r.maxAlternatives = 1;

      finalRef.current = '';
      setInterim('');
      setError(null);

      r.onstart = () => setRecording(true);
      r.onerror = (ev) => {
        const err = ev?.error || 'unknown';
        if (err !== 'no-speech' && err !== 'aborted') setError(err);
      };
      r.onend = () => {
        clearSilenceTimer();
        setRecording(false);
        recogRef.current = null;
        const finalText = (finalRef.current || '').trim();
        setInterim('');
        if (finalText) {
          try { onTranscriptRef.current?.(finalText); } catch {}
        }
      };
      r.onresult = (ev) => {
        let liveInterim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const txt = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalRef.current += (finalRef.current ? ' ' : '') + txt.trim();
          else liveInterim += ' ' + txt;
        }
        setInterim(liveInterim.trim());
        // Reset silence timer on any speech activity
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          try { recogRef.current?.stop?.(); } catch {}
        }, silenceMs);
      };

      recogRef.current = r;
      try { r.start(); } catch (e) { setError(String(e?.message || e || 'start_failed')); }
      return true;
    } catch (e) {
      setError(String(e?.message || e || 'init_failed'));
      return false;
    }
  }, [lang, silenceMs]);

  // Cleanup
  useEffect(() => () => { clearSilenceTimer(); try { recogRef.current?.abort?.(); } catch {} }, []);

  return { start, stop, cancel, recording, interim, error };
}
