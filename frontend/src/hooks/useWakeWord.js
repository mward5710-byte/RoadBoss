// useWakeWord — Continuous browser-based wake-word detection for hands-free voice control.
//
// Limitations (be honest):
// - Requires the page to be open and unlocked. iOS suspends mic ~30s after screen lock.
// - Works in HTTPS Safari/Chrome. Will NOT work inside cross-origin iframes
//   (Emergent preview wrapper) — open the app in a real browser tab.
// - This is a "poor-man's" wake word — uses the SpeechRecognition API to watch
//   transcripts for a trigger phrase. True always-on wake word needs the iOS native shell.

import { useEffect, useRef, useState, useCallback } from 'react';

const DEFAULT_PHRASES = ['hey co-pilot', 'hey copilot', 'hey boss', 'hey roadboss', 'roadboss'];

export function useWakeWord({ enabled, wakePhrases = DEFAULT_PHRASES, onCommand, cooldownMs = 1500 }) {
  const [listening, setListening] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [lastHeard, setLastHeard] = useState('');
  const [armed, setArmed] = useState(false); // true after wake word fires, until command captured
  const recogRef = useRef(null);
  const enabledRef = useRef(enabled);
  const armedRef = useRef(false);
  const cooldownRef = useRef(0);
  const onCommandRef = useRef(onCommand);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { armedRef.current = armed; }, [armed]);

  const stop = useCallback(() => {
    try { recogRef.current?.stop?.(); } catch {}
    recogRef.current = null;
    setListening(false);
    setArmed(false);
    armedRef.current = false;
  }, []);

  const lower = (s) => (s || '').toLowerCase().replace(/[^\w\s'-]/g, ' ').replace(/\s+/g, ' ').trim();

  const start = useCallback(() => {
    const Recog = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Recog) {
      setLastError('not_supported');
      return;
    }
    try {
      const r = new Recog();
      r.lang = 'en-US';
      r.interimResults = true;
      r.continuous = true;
      r.maxAlternatives = 1;

      r.onstart = () => { setListening(true); setLastError(null); };
      r.onerror = (ev) => {
        const err = ev?.error || 'unknown';
        if (err !== 'no-speech' && err !== 'aborted') {
          setLastError(err);
        }
        // Errors like 'no-speech' are normal during silence — restart will happen onend
      };
      r.onend = () => {
        setListening(false);
        // Auto-restart while still enabled
        if (enabledRef.current) {
          setTimeout(() => {
            try { r.start(); } catch (e) { /* might still be running */ }
          }, 250);
        }
      };
      r.onresult = (ev) => {
        let interim = '';
        let final = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const txt = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) final += ' ' + txt;
          else interim += ' ' + txt;
        }
        const combined = lower(final + ' ' + interim);
        if (combined) setLastHeard(combined.slice(-120));

        // Cooldown to avoid double-fire
        if (Date.now() < cooldownRef.current) return;

        // If already armed, capture the next final utterance as the command
        if (armedRef.current && final.trim()) {
          const cmd = lower(final).trim();
          if (cmd && cmd.length >= 2) {
            armedRef.current = false;
            setArmed(false);
            cooldownRef.current = Date.now() + cooldownMs;
            try { onCommandRef.current?.(cmd); } catch {}
            return;
          }
        }

        // Look for wake phrase in the combined transcript
        for (const phrase of wakePhrases) {
          const p = lower(phrase);
          if (!p) continue;
          const idx = combined.lastIndexOf(p);
          if (idx >= 0) {
            const afterRaw = combined.slice(idx + p.length).trim();
            // strip leading punctuation/connectors
            const after = afterRaw.replace(/^[,.\s]+(?:please\s+)?/i, '').trim();
            if (after && after.length >= 2) {
              // wake + command in one breath
              cooldownRef.current = Date.now() + cooldownMs;
              try { onCommandRef.current?.(after); } catch {}
              armedRef.current = false;
              setArmed(false);
            } else {
              // wake word alone — arm for next utterance
              armedRef.current = true;
              setArmed(true);
              cooldownRef.current = Date.now() + 600;
            }
            return;
          }
        }
      };

      recogRef.current = r;
      try { r.start(); } catch (e) {
        // Already running or permission issue
        setLastError(String(e?.message || e || 'start_failed'));
      }
    } catch (e) {
      setLastError(String(e?.message || e || 'init_failed'));
    }
  }, [wakePhrases, cooldownMs]);

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return () => stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { listening, armed, lastError, lastHeard, restart: () => { stop(); setTimeout(start, 200); } };
}

export const isInIframe = () => {
  try { return window.self !== window.top; } catch { return true; }
};

export const supportsSTT = () => {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
};
