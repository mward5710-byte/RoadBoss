// VoiceJobWizard — Mike's "Hands-Free Vision" centerpiece.
//
// Conversational state machine that walks through creating a tow job
// purely by voice:
//
//   1. Co-Pilot greets: "Started a new tow job. What's the customer name?"
//   2. Mic auto-opens. User speaks. Auto-stops on silence.
//   3. Backend parses the field (regex-first, free).
//   4. Co-Pilot reads it back: "Got it: Transit Pro. Yes to continue,
//      no to redo, or skip."
//   5. Mic auto-reopens. Yes → next field. No → re-record. Skip → optional fields only.
//   6. Final review: "Customer Transit Pro, pickup I-65, $250. Say create
//      to submit or back to fix something."
//   7. Submit → DB insert (zero LLM) → navigate to the new job page.
//
// Cost discipline: NO LLM calls in the happy path. All prompts are local TTS.
// All parsing is server-side regex/heuristics. End-to-end voice flow runs
// for $0.00 in LLM cost.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic, Square, Check, X, ChevronLeft, ChevronRight, Loader2, Volume2,
  Sparkles, RefreshCw, ArrowLeft, Phone, MapPin, Car, DollarSign,
  Wrench, User, Home, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushToTalk } from '@/hooks/usePushToTalk';
import { isInIframe, supportsSTT } from '@/hooks/useWakeWord';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// ---------- Speech helpers ----------
function speak(text, onEnd) {
  try {
    if (!('speechSynthesis' in window) || !text) { onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.04; u.pitch = 1; u.volume = 1; u.lang = 'en-US';
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.cancel();
    try { window.speechSynthesis.resume(); } catch {}
    window.speechSynthesis.speak(u);
  } catch { onEnd?.(); }
}

function chime(freq = 880) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
    setTimeout(() => { try { ctx.close(); } catch {} }, 400);
  } catch {}
}

// ---------- Step definitions ----------
//
// Each step is a single conversational turn. `key` matches the parse-field
// endpoint's `field` arg. `optional` lets the user say "skip".

const SERVICE_LABEL = {
  tow: 'tow', jumpstart: 'jumpstart', lockout: 'lockout',
  tire_change: 'tire change', fuel_delivery: 'fuel delivery',
  winch: 'winch out', recovery: 'recovery', impound: 'impound',
};

const STEPS = [
  {
    key: 'name',
    field: 'name',
    icon: User,
    label: 'Customer name',
    prompt: "Started a new tow job. What's the customer name?",
    rePrompt: "What's the customer name?",
    confirm: (v) => `Got it. Customer name is ${v}. Say yes to continue, or no to redo.`,
    summary: (v) => v,
    optional: false,
  },
  {
    key: 'phone',
    field: 'phone',
    icon: Phone,
    label: 'Customer phone',
    prompt: "What's the customer phone number? Say the digits, or say skip.",
    rePrompt: "What's the phone number?",
    confirm: (v) => `Got it. Phone is ${v.replace(/[()\-\s]/g, '').split('').join(' ')}. Yes to continue, no to redo.`,
    summary: (v) => v,
    optional: true,
  },
  {
    key: 'pickup',
    field: 'pickup',
    icon: MapPin,
    label: 'Pickup location',
    prompt: "Where's the pickup location?",
    rePrompt: "Pickup location?",
    confirm: (v) => `Pickup at ${v}. Yes to continue, no to redo.`,
    summary: (v) => v,
    optional: false,
  },
  {
    key: 'dropoff',
    field: 'dropoff',
    icon: Home,
    label: 'Drop-off location',
    prompt: "Where's the drop-off? Or say skip.",
    rePrompt: "Drop-off location?",
    confirm: (v) => `Drop-off at ${v}. Yes to continue, no to redo.`,
    summary: (v) => v,
    optional: true,
  },
  {
    key: 'vehicle',
    field: 'vehicle',
    icon: Car,
    label: 'Vehicle description',
    prompt: "What's the vehicle? Make, model, color. Or say skip.",
    rePrompt: "What's the vehicle?",
    confirm: (v) => `Vehicle: ${v}. Yes to continue, no to redo.`,
    summary: (v) => v,
    optional: true,
  },
  {
    key: 'service',
    field: 'service',
    icon: Wrench,
    label: 'Service type',
    prompt: "What service? Tow, jumpstart, lockout, tire change, fuel, winch, or recovery?",
    rePrompt: "Service type?",
    confirm: (v) => `Service is ${SERVICE_LABEL[v] || v}. Yes to continue, no to redo.`,
    summary: (v) => SERVICE_LABEL[v] || v,
    optional: false,
  },
  {
    key: 'price',
    field: 'price',
    icon: DollarSign,
    label: 'Quoted price',
    prompt: "What are you charging? Say the amount in dollars, or say skip.",
    rePrompt: "How much are you charging?",
    confirm: (v) => `Charging ${v} dollars. Yes to continue, no to redo.`,
    summary: (v) => `$${Number(v).toFixed(2)}`,
    optional: true,
  },
];

// ---------- Wizard component ----------

const PHASES = {
  IDLE: 'idle',           // before first user gesture
  PROMPTING: 'prompting',  // TTS speaking the question
  LISTENING: 'listening',  // mic open, capturing field value
  PARSING: 'parsing',      // backend parse in flight
  CONFIRMING: 'confirming',// TTS speaking captured value back
  AWAITING_YN: 'awaiting_yn', // mic open for yes/no
  REVIEW: 'review',        // all fields done, final readback + create
  CREATING: 'creating',    // submit in flight
  DONE: 'done',
};

export default function VoiceJobWizard() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(false);
  const [phase, setPhase] = useState(PHASES.IDLE);
  const [stepIdx, setStepIdx] = useState(0);
  const [values, setValues] = useState({}); // { name: 'Transit Pro', phone: '(555) ...' }
  const [pendingValue, setPendingValue] = useState(null); // captured but not yet confirmed
  const [pendingError, setPendingError] = useState(null);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const inIframe = isInIframe();
  const sttSupported = supportsSTT();
  const step = STEPS[stepIdx];
  const totalSteps = STEPS.length;

  // ---- Voice transcript routing ----
  const handleTranscript = useCallback(async (text) => {
    const t = (text || '').trim();
    if (!t) return;
    const ph = phaseRef.current;

    if (ph === PHASES.LISTENING) {
      // Parse the captured field
      setPhase(PHASES.PARSING);
      try {
        const r = await api.post('/copilot/wizard/parse-field', {
          field: STEPS[stepIdx].field,
          transcript: t,
        });
        const data = r.data || {};
        if (data.skipped) {
          // skipped → record null, advance
          setValues((v) => ({ ...v, [STEPS[stepIdx].key]: null }));
          chime(660);
          advanceFromStep(stepIdx);
          return;
        }
        if (!data.value || data.confidence === 'low') {
          // Couldn't parse — re-prompt
          setPendingError(`Sorry, I didn't catch that. ${STEPS[stepIdx].rePrompt}`);
          setPendingValue(null);
          startPrompt(`Sorry, I didn't catch that. ${STEPS[stepIdx].rePrompt}`, () => {
            beginListening();
          });
          return;
        }
        // Got a value — speak it back for confirmation
        setPendingValue(data.value);
        setPendingError(null);
        const confirmText = STEPS[stepIdx].confirm(data.value);
        setPhase(PHASES.CONFIRMING);
        speak(confirmText, () => {
          // Auto-open mic for yes/no after confirmation TTS finishes
          setPhase(PHASES.AWAITING_YN);
          setTimeout(() => {
            chime(880);
            ptt.start();
          }, 200);
        });
      } catch (e) {
        const msg = e?.response?.data?.detail || 'Parse failed';
        toast.error(msg);
        setPendingError(msg);
        setPhase(PHASES.IDLE);
      }
      return;
    }

    if (ph === PHASES.AWAITING_YN) {
      // Parse yes/no
      try {
        const r = await api.post('/copilot/wizard/parse-field', {
          field: 'yesno',
          transcript: t,
        });
        const v = r.data?.value;
        if (v === 'yes') {
          chime(1320);
          // Commit pending value
          setValues((vv) => ({ ...vv, [STEPS[stepIdx].key]: pendingValue }));
          setPendingValue(null);
          advanceFromStep(stepIdx);
        } else if (v === 'no') {
          chime(440);
          setPendingValue(null);
          startPrompt(STEPS[stepIdx].rePrompt, () => beginListening());
        } else if (v === 'back') {
          chime(440);
          setPendingValue(null);
          goBackFromStep(stepIdx);
        } else if (v === 'skip' && STEPS[stepIdx].optional) {
          chime(660);
          setValues((vv) => ({ ...vv, [STEPS[stepIdx].key]: null }));
          setPendingValue(null);
          advanceFromStep(stepIdx);
        } else {
          // ambiguous → re-prompt yes/no
          startPrompt('Say yes to continue, no to redo, or skip.', () => {
            setPhase(PHASES.AWAITING_YN);
            setTimeout(() => { chime(880); ptt.start(); }, 200);
          });
        }
      } catch {
        toast.error('Could not parse confirmation. Try again.');
      }
      return;
    }

    if (ph === PHASES.REVIEW) {
      // Listen for "create" / "submit" / "back" / "cancel"
      const lc = t.toLowerCase();
      if (/(create|submit|send it|go|confirm|do it|good)/.test(lc)) {
        submitJob();
      } else if (/(back|fix|change|edit)/.test(lc)) {
        chime(440);
        setStepIdx(0);
        startPrompt(STEPS[0].rePrompt, () => beginListening());
      } else if (/(cancel|abort|stop)/.test(lc)) {
        chime(440);
        navigate('/wrecker');
      } else {
        startPrompt('Say create to submit, back to edit, or cancel to exit.', () => {
          setPhase(PHASES.REVIEW);
          setTimeout(() => { chime(880); ptt.start(); }, 200);
        });
      }
      return;
    }
  }, [stepIdx, pendingValue]);

  const ptt = usePushToTalk({ onTranscript: handleTranscript, silenceMs: 1500 });

  const startPrompt = useCallback((text, after) => {
    setPhase(PHASES.PROMPTING);
    setPendingError(null);
    speak(text, () => {
      after?.();
    });
  }, []);

  const beginListening = useCallback(() => {
    setPhase(PHASES.LISTENING);
    setTimeout(() => {
      chime(880);
      ptt.start();
    }, 250);
  }, [ptt]);

  const advanceFromStep = useCallback((idx) => {
    const next = idx + 1;
    if (next >= totalSteps) {
      // All fields collected — go to review
      goToReview();
    } else {
      setStepIdx(next);
      // Speak next prompt → listen
      setTimeout(() => {
        startPrompt(STEPS[next].prompt, () => beginListening());
      }, 200);
    }
  }, [totalSteps, startPrompt, beginListening]);

  const goBackFromStep = useCallback((idx) => {
    const prev = Math.max(0, idx - 1);
    setStepIdx(prev);
    setValues((v) => {
      const copy = { ...v };
      delete copy[STEPS[prev].key];
      return copy;
    });
    setTimeout(() => {
      startPrompt(STEPS[prev].rePrompt, () => beginListening());
    }, 200);
  }, [startPrompt, beginListening]);

  const goToReview = useCallback(() => {
    setPhase(PHASES.PROMPTING);
    const lines = STEPS
      .filter((s) => values[s.key] != null && values[s.key] !== '')
      .map((s) => `${s.label}: ${s.summary(values[s.key])}`);
    // Note: values for current step may not be in state yet during the same tick;
    // include pendingValue commit by reading committed values + last step.
    // (advanceFromStep commits before calling this, so values is current.)
    const summary = lines.length
      ? `Here's the job. ${lines.join('. ')}. Say create to submit, back to edit, or cancel to exit.`
      : `Nothing captured yet. Say back to start over, or cancel to exit.`;
    speak(summary, () => {
      setPhase(PHASES.REVIEW);
      setTimeout(() => { chime(880); ptt.start(); }, 200);
    });
  }, [values, ptt]);

  const submitJob = useCallback(async () => {
    setPhase(PHASES.CREATING);
    try {
      const payload = {
        customer_name: values.name || 'Walk-up',
        customer_phone: values.phone || null,
        pickup_location: values.pickup || 'Unknown location',
        drop_location: values.dropoff || null,
        vehicle_description: values.vehicle || null,
        service_type: values.service || 'tow',
        quoted_price: values.price ? Number(values.price) : null,
      };
      const r = await api.post('/copilot/wizard/create-job', payload);
      chime(1320);
      setPhase(PHASES.DONE);
      const customer = r.data?.customer_name || 'the job';
      speak(`Job created for ${customer}. Opening it now.`, () => {
        toast.success(`Job created for ${customer}`);
        navigate(r.data?.redirect || '/wrecker');
      });
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Could not create the job.';
      toast.error(msg);
      setPhase(PHASES.REVIEW);
      speak(msg, () => {
        setPhase(PHASES.REVIEW);
        setTimeout(() => { chime(440); ptt.start(); }, 200);
      });
    }
  }, [values, navigate, ptt]);

  // ---- First-tap unlock + start ----
  const beginWizard = useCallback(() => {
    if (inIframe) {
      toast.error('Voice wizard needs a real browser tab. Open the app outside the preview.', { duration: 7000 });
      return;
    }
    if (!sttSupported) {
      toast.error('Voice not supported on this browser. Use the form view instead.', { duration: 5000 });
      return;
    }
    // iOS audio gesture unlock
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0.01;
      window.speechSynthesis.speak(u);
    } catch {}
    setUnlocked(true);
    setStepIdx(0);
    setValues({});
    setPendingValue(null);
    setPendingError(null);
    setTimeout(() => {
      startPrompt(STEPS[0].prompt, () => beginListening());
    }, 250);
  }, [inIframe, sttSupported, startPrompt, beginListening]);

  // Cleanup TTS on unmount
  useEffect(() => () => {
    try { window.speechSynthesis.cancel(); } catch {}
    try { ptt.cancel(); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Manual controls (corner buttons) ----
  const cancelWizard = () => {
    try { window.speechSynthesis.cancel(); } catch {}
    try { ptt.cancel(); } catch {}
    navigate('/wrecker');
  };

  const skipCurrent = () => {
    if (!step.optional) {
      toast.warning('This field is required.');
      return;
    }
    try { ptt.cancel(); } catch {}
    setValues((v) => ({ ...v, [step.key]: null }));
    advanceFromStep(stepIdx);
  };

  const redoCurrent = () => {
    try { ptt.cancel(); } catch {}
    setPendingValue(null);
    startPrompt(step.rePrompt, () => beginListening());
  };

  const goPrev = () => {
    if (stepIdx === 0) return;
    try { ptt.cancel(); } catch {}
    goBackFromStep(stepIdx);
  };

  // ---- Visual ----
  const phaseLabel = useMemo(() => {
    switch (phase) {
      case PHASES.IDLE: return 'Tap to start';
      case PHASES.PROMPTING: return 'Co-Pilot speaking…';
      case PHASES.LISTENING: return 'Listening — speak now';
      case PHASES.PARSING: return 'Processing…';
      case PHASES.CONFIRMING: return 'Confirming…';
      case PHASES.AWAITING_YN: return 'Say yes or no';
      case PHASES.REVIEW: return 'Say create to submit';
      case PHASES.CREATING: return 'Creating job…';
      case PHASES.DONE: return 'Done!';
      default: return '';
    }
  }, [phase]);

  const StepIcon = step?.icon || User;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <button
          onClick={cancelWizard}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm"
          data-testid="voice-wizard-exit"
        >
          <ArrowLeft className="w-4 h-4" /> Exit
        </button>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-sky-300/90 font-bold">
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          Hands-Free Job Entry
        </div>
        <div className="text-xs text-slate-400 font-mono" data-testid="voice-wizard-progress">
          {phase === PHASES.REVIEW || phase === PHASES.DONE ? `${totalSteps}/${totalSteps}` : `${Math.min(stepIdx + 1, totalSteps)}/${totalSteps}`}
        </div>
      </div>

      {/* Pre-start screen */}
      {!unlocked && (
        <div className="px-6 py-12 max-w-md mx-auto text-center space-y-6">
          <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center shadow-2xl shadow-sky-500/30">
            <Mic className="w-12 h-12 text-slate-950" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Hands-Free Tow Job</h1>
            <p className="text-slate-400 mt-2 leading-relaxed">
              Co-Pilot will walk you through every field. Just speak naturally — it'll repeat back each answer for you to confirm before moving on.
            </p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-left text-sm space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-emerald-300 font-bold">How it works</div>
            <div className="text-slate-300 text-xs leading-relaxed">
              <span className="text-emerald-300 font-semibold">1.</span> Co-Pilot asks a question →
              <span className="text-emerald-300 font-semibold"> 2.</span> You answer →
              <span className="text-emerald-300 font-semibold"> 3.</span> It reads it back →
              <span className="text-emerald-300 font-semibold"> 4.</span> You say "yes" or "no".
            </div>
            <div className="text-slate-400 text-xs pt-1">
              Say <span className="text-amber-300 font-semibold">"skip"</span> on optional fields,
              <span className="text-amber-300 font-semibold"> "back"</span> to fix the previous one,
              or <span className="text-amber-300 font-semibold">"cancel"</span> any time.
            </div>
          </div>
          {inIframe && (
            <div className="rounded-lg p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                Mic is blocked inside the preview iframe. Open the app in a real Safari/Chrome tab to use voice.
              </div>
            </div>
          )}
          <Button
            onClick={beginWizard}
            disabled={inIframe || !sttSupported}
            className="w-full h-14 text-lg font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950"
            data-testid="voice-wizard-start"
          >
            <Mic className="w-5 h-5 mr-2" /> Start Talking
          </Button>
          <button
            onClick={() => navigate('/wrecker/jobs/new')}
            className="text-xs text-slate-500 hover:text-slate-300"
            data-testid="voice-wizard-form-fallback"
          >
            …or type it the old way
          </button>
        </div>
      )}

      {/* Active wizard */}
      {unlocked && (
        <div className="max-w-md mx-auto px-4 py-6 space-y-5">
          {/* Phase label */}
          <div className={`text-center text-[11px] uppercase tracking-widest font-bold ${
            phase === PHASES.LISTENING || phase === PHASES.AWAITING_YN ? 'text-red-300'
              : phase === PHASES.PROMPTING || phase === PHASES.CONFIRMING ? 'text-emerald-300'
              : phase === PHASES.PARSING || phase === PHASES.CREATING ? 'text-amber-300'
              : 'text-slate-500'
          }`}
          data-testid="voice-wizard-phase">
            {phaseLabel}
          </div>

          {/* Big mic / state orb */}
          <div className="flex justify-center py-2">
            <div className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
              phase === PHASES.LISTENING || phase === PHASES.AWAITING_YN || phase === PHASES.REVIEW
                ? 'bg-red-500/20 ring-4 ring-red-500/50 ring-offset-2 ring-offset-slate-950 animate-pulse'
                : phase === PHASES.PROMPTING || phase === PHASES.CONFIRMING
                ? 'bg-emerald-500/20 ring-4 ring-emerald-500/50'
                : phase === PHASES.PARSING || phase === PHASES.CREATING
                ? 'bg-amber-500/20 ring-4 ring-amber-500/50'
                : 'bg-slate-800/40 ring-2 ring-slate-700'
            }`}>
              {phase === PHASES.PARSING || phase === PHASES.CREATING ? (
                <Loader2 className="w-14 h-14 text-amber-300 animate-spin" />
              ) : phase === PHASES.PROMPTING || phase === PHASES.CONFIRMING ? (
                <Volume2 className="w-14 h-14 text-emerald-300" />
              ) : phase === PHASES.LISTENING || phase === PHASES.AWAITING_YN || phase === PHASES.REVIEW ? (
                <Mic className="w-14 h-14 text-red-300" />
              ) : (
                <StepIcon className="w-14 h-14 text-slate-400" />
              )}
            </div>
          </div>

          {/* Current step + interim transcript */}
          {phase !== PHASES.REVIEW && phase !== PHASES.DONE && phase !== PHASES.CREATING && (
            <div className="text-center space-y-1.5">
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest text-sky-300/80 font-semibold">
                <StepIcon className="w-3.5 h-3.5" />
                Step {Math.min(stepIdx + 1, totalSteps)} · {step.label}
              </div>
              <div className="text-lg font-semibold text-white leading-snug px-2" data-testid="voice-wizard-prompt">
                {pendingError || step.prompt}
              </div>
              {ptt.recording && ptt.interim && (
                <div className="text-sm text-amber-300 italic mt-2 px-2" data-testid="voice-wizard-interim">
                  "{ptt.interim}"
                </div>
              )}
              {pendingValue && (phase === PHASES.CONFIRMING || phase === PHASES.AWAITING_YN) && (
                <div className="mt-3 mx-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm font-semibold" data-testid="voice-wizard-pending">
                  <Check className="w-3.5 h-3.5" /> {String(pendingValue)}
                </div>
              )}
            </div>
          )}

          {/* Review summary */}
          {(phase === PHASES.REVIEW || phase === PHASES.CREATING || phase === PHASES.DONE) && (
            <div className="space-y-2">
              <div className="text-center text-lg font-semibold text-white">
                {phase === PHASES.CREATING ? 'Creating your job…' : phase === PHASES.DONE ? 'All set, partner.' : 'Review & confirm'}
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl divide-y divide-slate-800" data-testid="voice-wizard-review">
                {STEPS.map((s) => {
                  const v = values[s.key];
                  const Icon = s.icon;
                  return (
                    <div key={s.key} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2.5 text-slate-400 text-xs uppercase tracking-wide">
                        <Icon className="w-3.5 h-3.5" /> {s.label}
                      </div>
                      <div className={`text-sm font-medium ${v ? 'text-white' : 'text-slate-600 italic'}`}>
                        {v ? s.summary(v) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
              {phase === PHASES.REVIEW && (
                <div className="text-center text-xs text-slate-400 pt-2">
                  Say <span className="text-emerald-300 font-semibold">"create"</span>, <span className="text-amber-300 font-semibold">"back"</span>, or <span className="text-red-300 font-semibold">"cancel"</span>
                </div>
              )}
            </div>
          )}

          {/* Manual controls */}
          {phase !== PHASES.DONE && phase !== PHASES.CREATING && (
            <div className="grid grid-cols-3 gap-2 pt-3">
              <Button
                variant="outline"
                onClick={goPrev}
                disabled={stepIdx === 0 || phase === PHASES.PROMPTING || phase === PHASES.PARSING}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                data-testid="voice-wizard-back"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                variant="outline"
                onClick={redoCurrent}
                disabled={phase === PHASES.PROMPTING || phase === PHASES.PARSING || phase === PHASES.REVIEW}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                data-testid="voice-wizard-redo"
              >
                <RefreshCw className="w-4 h-4 mr-1" /> Redo
              </Button>
              <Button
                variant="outline"
                onClick={skipCurrent}
                disabled={!step.optional || phase === PHASES.PROMPTING || phase === PHASES.PARSING || phase === PHASES.REVIEW}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                data-testid="voice-wizard-skip"
              >
                Skip <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Manual create button on review (so Mike isn't held hostage to STT) */}
          {phase === PHASES.REVIEW && (
            <div className="pt-2 grid grid-cols-2 gap-2">
              <Button
                onClick={() => { try { ptt.cancel(); } catch {} ; submitJob(); }}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold h-12"
                data-testid="voice-wizard-create"
              >
                <Check className="w-5 h-5 mr-1.5" /> Create Job
              </Button>
              <Button
                variant="outline"
                onClick={cancelWizard}
                className="border-red-500/40 text-red-300 hover:bg-red-500/10 h-12"
                data-testid="voice-wizard-cancel"
              >
                <X className="w-5 h-5 mr-1.5" /> Cancel
              </Button>
            </div>
          )}

          {/* Stop recording shortcut */}
          {ptt.recording && (
            <div className="text-center pt-1">
              <button
                onClick={() => ptt.stop()}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
                data-testid="voice-wizard-stop"
              >
                <Square className="w-3 h-3 fill-current" /> Stop & process
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
