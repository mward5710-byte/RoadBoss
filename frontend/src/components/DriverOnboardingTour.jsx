// DriverOnboardingTour — first-run walkthrough that teaches a new driver the 6 core concepts fast.
// Mounted inside DriverShell so it overlays every driver page. Auto-shows on first visit and can
// be replayed from Settings. Voice-first tone, zero manual-reading required.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Bot,
  Radio,
  Compass,
  ShieldAlert,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'roadboss.driver_tour_seen.v1';
const REPLAY_EVENT = 'roadboss:driver-tour:replay';

export const triggerDriverTour = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(REPLAY_EVENT));
  } catch {}
};

const STEPS = [
  {
    key: 'welcome',
    icon: Sparkles,
    iconTint: 'text-sky-300',
    glow: 'from-sky-500/25 via-sky-400/10 to-transparent',
    eyebrow: 'Welcome aboard',
    title: 'RoadBoss is your hands-free command center.',
    body: 'One app for HOS, trips, inspections, messaging, and safety. Eyes on the road — RoadBoss does the rest.',
    hint: '60-second tour. You can replay any time from Settings.',
  },
  {
    key: 'copilot',
    icon: Bot,
    iconTint: 'text-emerald-300',
    glow: 'from-emerald-500/25 via-emerald-400/10 to-transparent',
    eyebrow: 'Meet your Co-Pilot',
    title: 'Talk naturally. Co-Pilot takes action.',
    body: 'Say “Start my pre-trip,” “I’m driving now,” or “Tell dispatch I’m running late.” Co-Pilot runs the command and talks back.',
    hint: 'Hit the mic on the Home screen or open the Co-Pilot tab.',
  },
  {
    key: 'wakeword',
    icon: Radio,
    iconTint: 'text-cyan-300',
    glow: 'from-cyan-500/25 via-cyan-400/10 to-transparent',
    eyebrow: 'Wake word',
    title: 'Say "Hey Co-Pilot" — hands never leave the wheel.',
    body: 'Arm the wake word from the bar at the bottom. Presets include Hey Co-Pilot, Hey Boss, and Hey RoadBoss.',
    hint: 'Browsers may need a mic-permission prompt the first time.',
  },
  {
    key: 'shift',
    icon: Compass,
    iconTint: 'text-amber-300',
    glow: 'from-amber-500/25 via-amber-400/10 to-transparent',
    eyebrow: 'Shift flow',
    title: 'One card tells you what to do next.',
    body: 'Your Home screen is a state machine: pre-trip → drive → rest → post-trip. Focus on the one primary action. No menus to dig through.',
    hint: 'HOS minutes and alerts are always visible at the top.',
  },
  {
    key: 'crash',
    icon: ShieldAlert,
    iconTint: 'text-rose-300',
    glow: 'from-rose-500/25 via-rose-400/10 to-transparent',
    eyebrow: 'Crash shield',
    title: 'If something happens, we have you.',
    body: 'CrashGuardian uses the phone’s motion sensors. If a crash is detected and you don’t cancel in 20 seconds, we alert dispatch and your emergency contact automatically.',
    hint: 'Tap SOS on the Home screen any time to force-dispatch help.',
  },
  {
    key: 'ready',
    icon: CheckCircle2,
    iconTint: 'text-sky-300',
    glow: 'from-sky-500/30 via-sky-400/10 to-transparent',
    eyebrow: 'You’re ready',
    title: 'Roll safe. Drive smart. We’ve got the paperwork.',
    body: 'Try: “Start my pre-trip,” “I’m on duty,” or “What’s my HOS?” Co-Pilot will take it from there.',
    hint: 'Replay this tour any time from Driver → Settings.',
  },
];

export default function DriverOnboardingTour() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  // Auto-open is intentionally disabled so driving dashboards stay touch-free.
  // The tour can still be launched manually from Settings via REPLAY_EVENT.

  // Listen for replay requests (from Settings button).
  useEffect(() => {
    const handler = () => {
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_EVENT, handler);
    return () => window.removeEventListener(REPLAY_EVENT, handler);
  }, []);

  // Lock background scroll while overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes with "seen" persisted (so we don't re-nag).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  const step = useMemo(() => STEPS[index], [index]);
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;

  const persistSeen = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
  };

  const finish = () => {
    persistSeen();
    setOpen(false);
  };

  const next = () => {
    if (isLast) {
      finish();
    } else {
      setIndex((i) => Math.min(STEPS.length - 1, i + 1));
    }
  };

  const back = () => {
    setIndex((i) => Math.max(0, i - 1));
  };

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const Icon = step.icon;

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="roadboss-driver-tour"
        data-testid="driver-onboarding-tour"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[2147483600] flex items-center justify-center px-4 py-6"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 20%, rgba(7,9,13,0.92), rgba(7,9,13,0.98))',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="RoadBoss driver onboarding tour"
      >
        <motion.div
          key={step.key}
          initial={{ y: 14, opacity: 0, scale: 0.985 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e14]/95 shadow-[0_40px_120px_-20px_rgba(56,189,248,0.25)]"
        >
          {/* Ambient glow */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 -top-20 h-56 bg-gradient-to-b ${step.glow}`}
          />

          {/* Skip */}
          <button
            type="button"
            onClick={finish}
            data-testid="driver-tour-skip"
            aria-label="Skip tour"
            className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative px-6 pt-8 pb-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] shadow-inner">
                <Icon className={`h-8 w-8 ${step.iconTint}`} />
              </div>
              <div
                data-testid={`driver-tour-eyebrow-${step.key}`}
                className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400"
              >
                Step {index + 1} of {STEPS.length} · {step.eyebrow}
              </div>
              <h2
                data-testid={`driver-tour-title-${step.key}`}
                className="mt-3 text-xl font-semibold leading-snug text-white"
              >
                {step.title}
              </h2>
              <p
                data-testid={`driver-tour-body-${step.key}`}
                className="mt-3 text-sm leading-relaxed text-slate-300"
              >
                {step.body}
              </p>
              {step.hint ? (
                <p className="mt-4 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                  {step.hint}
                </p>
              ) : null}
            </div>

            {/* Progress dots */}
            <div
              className="mt-6 flex items-center justify-center gap-1.5"
              aria-hidden
            >
              {STEPS.map((s, i) => (
                <span
                  key={s.key}
                  data-testid={`driver-tour-dot-${i}`}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === index
                      ? 'w-6 bg-sky-300'
                      : i < index
                      ? 'w-1.5 bg-sky-300/60'
                      : 'w-1.5 bg-white/15'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-white/5 bg-white/[0.02] px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              onClick={back}
              disabled={isFirst}
              data-testid="driver-tour-back"
              className="text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>

            {!isLast ? (
              <button
                type="button"
                onClick={finish}
                data-testid="driver-tour-skip-text"
                className="text-xs font-medium uppercase tracking-widest text-slate-500 transition hover:text-slate-200"
              >
                Skip
              </button>
            ) : (
              <span />
            )}

            <Button
              type="button"
              onClick={next}
              data-testid="driver-tour-next"
              className="bg-sky-500 text-slate-950 hover:bg-sky-400 focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              {isLast ? 'Start driving' : 'Next'}
              {!isLast ? <ChevronRight className="ml-1 h-4 w-4" /> : null}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(overlay, document.body);
}
