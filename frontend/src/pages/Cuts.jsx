import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Mic, Camera, Truck, MapPin, ShieldCheck, ArrowRight,
  Play, RefreshCw, ChevronLeft, Smartphone, Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';

/**
 * RoadBoss — TikTok Cut Studio (`/cuts`).
 *
 * Three pre-staged, 12-15 second vertical scenes Mike can screen-record
 * on his phone (iOS Control Center → Screen Record) and post directly to
 * TikTok / Reels / Shorts. Each cut is a self-contained "hook → reveal →
 * payoff → CTA" sequence with bold text, motion, and brand-locked color.
 *
 *  CUT 1 — "11'8 BRIDGE"   The fear: low-bridge strikes
 *  CUT 2 — "HEY PILOT"     The magic: hands-free voice command
 *  CUT 3 — "CRASH DETECTED" The trust: instant safety + dashcam upload
 *
 * Each scene auto-advances on a fixed timeline. The same content also
 * loops every 17 seconds so creators have a chance to nail the take.
 */

const CUTS = [
  {
    id: 'bridge',
    title: '11\u20198 Bridge',
    hook: 'POV: You\u2019re a 13\u20196 rig.',
    accent: 'amber',
    bg: 'from-amber-600 to-amber-900',
    icon: AlertTriangle,
  },
  {
    id: 'voice',
    title: 'Hey Pilot',
    hook: 'Log a pre-trip without your hands.',
    accent: 'cyan',
    bg: 'from-cyan-600 to-blue-900',
    icon: Mic,
  },
  {
    id: 'crash',
    title: 'Crash Detected',
    hook: 'When seconds matter.',
    accent: 'red',
    bg: 'from-red-600 to-red-900',
    icon: Camera,
  },
];

export default function Cuts() {
  const [active, setActive] = useState('bridge');
  const [showHelp, setShowHelp] = useState(true);

  return (
    <div className="min-h-screen bg-black text-white" data-testid="cuts-page">
      {/* ============================ HEADER ============================ */}
      <header className="sticky top-0 z-30 backdrop-blur bg-black/70 border-b border-slate-900">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 text-slate-300 hover:text-white" data-testid="cuts-back">
            <ChevronLeft className="w-5 h-5" />
            <Logo size={26} withWordmark={false} />
            <span className="text-sm hidden sm:inline">Cuts Studio</span>
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowHelp((v) => !v)}
            className="border-slate-700 text-slate-200 hover:bg-slate-900"
            data-testid="cuts-toggle-help"
          >
            <Smartphone className="w-4 h-4 mr-2" />
            How to record
          </Button>
        </div>
      </header>

      {/* ============================ TAB SELECTOR ============================ */}
      <div className="max-w-3xl mx-auto px-4 pt-5 pb-3">
        <div className="text-xs uppercase tracking-[0.3em] text-amber-400/80 font-semibold mb-3">
          THREE CUTS · 15 SECONDS EACH · READY TO POST
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CUTS.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              data-testid={`cuts-tab-${c.id}`}
              className={`shrink-0 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors border ${
                active === c.id
                  ? 'bg-white text-slate-900 border-white'
                  : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:border-slate-600'
              }`}
            >
              <c.icon className="w-4 h-4 inline-block mr-2 -mt-0.5" />
              Cut {CUTS.indexOf(c) + 1}: {c.title}
            </button>
          ))}
        </div>
      </div>

      {/* ============================ HELP TOAST ============================ */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-3xl mx-auto px-4 mb-3"
          >
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs text-cyan-200 flex items-start gap-2">
              <Smartphone className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <strong className="text-cyan-100">iOS:</strong> Swipe down → tap the red Screen Record button → open this page → press <em>Replay</em>.
                After the loop completes, stop recording. Trim in TikTok if needed.
                <strong className="text-cyan-100 ml-2">Tip:</strong> hold phone vertical, brightness up, silent mode.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================ STAGE ============================ */}
      <main className="max-w-3xl mx-auto px-4 pb-16">
        <Stage cutId={active} />
      </main>

      <footer className="text-center text-[10px] uppercase tracking-[0.3em] text-slate-700 pb-6">
        BUILT BY TRUCKERS · FOR TRUCKERS
      </footer>
    </div>
  );
}

/* ============================================================
 *  STAGE — renders a 9:16 vertical canvas with the active cut
 * ============================================================ */
function Stage({ cutId }) {
  const cut = CUTS.find((c) => c.id === cutId);
  const [playKey, setPlayKey] = useState(0); // bumping this restarts the sequence

  // Auto-loop: every 17s, restart so creators always catch a clean take.
  useEffect(() => {
    const t = setInterval(() => setPlayKey((k) => k + 1), 17000);
    return () => clearInterval(t);
  }, [cutId]);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-[28px] shadow-2xl"
        style={{
          maxWidth: 380,
          aspectRatio: '9 / 16',
          background: '#000',
        }}
        data-testid={`cuts-stage-${cutId}`}
      >
        <AnimatePresence mode="wait">
          {cut.id === 'bridge' && <BridgeScene key={`bridge-${playKey}`} />}
          {cut.id === 'voice'  && <VoiceScene  key={`voice-${playKey}`} />}
          {cut.id === 'crash'  && <CrashScene  key={`crash-${playKey}`} />}
        </AnimatePresence>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button
          size="lg"
          onClick={() => setPlayKey((k) => k + 1)}
          className="bg-white text-slate-900 hover:bg-slate-200 font-bold"
          data-testid={`cuts-replay-${cutId}`}
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Replay Cut
        </Button>
        <Link to="/investors?ref=tiktok&utm_source=tiktok&utm_medium=cuts">
          <Button size="lg" variant="outline" className="border-slate-700 text-slate-200 hover:bg-slate-900" data-testid={`cuts-cta-${cutId}`}>
            <ArrowRight className="w-5 h-5 mr-2" />
            Investor CTA link
          </Button>
        </Link>
      </div>

      <p className="mt-3 text-xs text-slate-500 max-w-sm text-center">
        Hook · {cut.hook}
      </p>
    </div>
  );
}

/* ============================================================
 *  CUT 1 — 11'8" BRIDGE
 *  0.0s  : Black, headlights blink on
 *  0.5s  : Map view fades up, dotted route line
 *  2.0s  : "11'8" CLEARANCE" red warning slams in
 *  4.0s  : Truck icon "BLOCKED" — shake animation
 *  5.5s  : RoadBoss alert pops: "REROUTE FOUND"
 *  8.0s  : New green path snaps in
 *  10.0s : Big text "$50,000 SAVED"
 *  13.0s : Brand lockup + "RoadBoss · Truck-Aware GPS"
 * ============================================================ */
function BridgeScene() {
  return (
    <motion.div
      className="absolute inset-0 bg-gradient-to-b from-slate-950 via-amber-950/40 to-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Faint map grid backdrop */}
      <div className="absolute inset-0 opacity-30"
           style={{ backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />

      {/* Headlights blink */}
      <motion.div
        className="absolute top-12 left-1/2 -translate-x-1/2 flex gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.6, 1] }}
        transition={{ duration: 0.8, times: [0, 0.3, 0.6, 1] }}
      >
        <div className="w-3 h-3 rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(253,224,71,0.8)]" />
        <div className="w-3 h-3 rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(253,224,71,0.8)]" />
      </motion.div>

      {/* Dotted route */}
      <motion.div
        className="absolute top-[20%] left-1/2 -translate-x-1/2 w-px"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: '40%', opacity: 0.6 }}
        transition={{ duration: 1.5, delay: 0.5 }}
        style={{
          backgroundImage: 'linear-gradient(180deg, #fbbf24 50%, transparent 50%)',
          backgroundSize: '2px 12px',
        }}
      />

      {/* "POV" hook */}
      <motion.div
        className="absolute top-6 inset-x-0 text-center"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <div className="inline-block px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[10px] font-bold tracking-[0.3em] uppercase">
          POV · 13&#8242;6&#8243; rig
        </div>
      </motion.div>

      {/* WARNING SLAM */}
      <motion.div
        className="absolute top-[38%] inset-x-4 text-center"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.15, 1], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 3, times: [0, 0.1, 0.2, 1], delay: 2 }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-red-600 border-4 border-red-400 shadow-[0_0_40px_rgba(239,68,68,0.6)]">
          <AlertTriangle className="w-7 h-7 text-white" />
          <div>
            <div className="text-[10px] tracking-[0.2em] text-red-200">CLEARANCE</div>
            <div className="text-3xl font-black text-white leading-none">11&#8242;8&#8243;</div>
          </div>
        </div>
      </motion.div>

      {/* RoadBoss reroute callout */}
      <motion.div
        className="absolute top-[40%] inset-x-6"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 5.5 }}
      >
        <div className="bg-slate-900/95 backdrop-blur border border-amber-400/40 rounded-2xl p-4 shadow-2xl">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">RoadBoss · Truck-Aware</div>
          </div>
          <div className="text-base font-bold text-white">REROUTE FOUND</div>
          <div className="text-xs text-slate-400">+2.3 mi · safer · keeps your roof on the rig</div>
        </div>
      </motion.div>

      {/* Big payoff */}
      <motion.div
        className="absolute bottom-[18%] inset-x-4 text-center"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 10 }}
      >
        <div className="text-[10px] tracking-[0.3em] text-emerald-300 font-bold mb-1">YOU JUST SAVED</div>
        <div className="text-5xl font-black text-emerald-400 leading-none drop-shadow-[0_0_20px_rgba(52,211,153,0.6)]">
          $50,000
        </div>
        <div className="text-xs text-slate-300 mt-2">in bridge-strike damage &amp; downtime</div>
      </motion.div>

      {/* Brand lockup */}
      <motion.div
        className="absolute bottom-5 inset-x-0 flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 13 }}
      >
        <Logo size={28} withWordmark tagline="Truck-Aware GPS" />
      </motion.div>
    </motion.div>
  );
}

/* ============================================================
 *  CUT 2 — HEY PILOT (voice command)
 *  0.0s  : Wheel-grip POV color tint
 *  0.5s  : "🎙️ Hey Pilot, log my pre-trip"
 *  2.5s  : Voice waveform pulses
 *  4.0s  : Form auto-fills (lines populate)
 *  8.0s  : "DONE · 3 SECONDS · EYES ON ROAD"
 *  11.0s : Stat: 47 forms / 0 hands
 *  13.0s : Brand lockup
 * ============================================================ */
function VoiceScene() {
  return (
    <motion.div
      className="absolute inset-0 bg-gradient-to-b from-slate-950 via-cyan-950/40 to-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Steering wheel hint */}
      <div className="absolute inset-0 opacity-20"
           style={{ background: 'radial-gradient(circle at 50% 110%, #0e7490 0%, transparent 50%)' }} />

      {/* Voice command bubble */}
      <motion.div
        className="absolute top-[14%] inset-x-5"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <div className="bg-cyan-500/15 backdrop-blur border border-cyan-400/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Mic className="w-4 h-4 text-cyan-300" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300 font-bold">DRIVER VOICE</span>
          </div>
          <div className="text-lg font-bold text-white leading-tight">
            &ldquo;Hey Pilot, log my <span className="text-cyan-300">pre-trip</span>.&rdquo;
          </div>
        </div>
      </motion.div>

      {/* Waveform */}
      <motion.div
        className="absolute top-[34%] inset-x-0 flex justify-center items-center gap-1 h-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 5, times: [0, 0.1, 0.7, 1], delay: 2 }}
      >
        {Array.from({ length: 18 }).map((_, i) => (
          <motion.div
            key={i}
            className="w-1.5 rounded-full bg-cyan-400"
            animate={{ height: ['12%', '88%', '24%', '64%', '16%'] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.05, ease: 'easeInOut' }}
            style={{ minHeight: 4 }}
          />
        ))}
      </motion.div>

      {/* Auto-filling form */}
      <motion.div
        className="absolute top-[44%] inset-x-5"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 4 }}
      >
        <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">DVIR · PRE-TRIP</div>
          {[
            'Brakes · OK',
            'Lights · OK',
            'Tires · OK',
            'Coupling · OK',
            'Mirrors · OK',
          ].map((row, i) => (
            <motion.div
              key={row}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 4.5 + i * 0.4 }}
              className="flex items-center justify-between text-sm border-b border-slate-800 pb-1"
            >
              <span className="text-slate-300">{row.split(' · ')[0]}</span>
              <span className="text-emerald-400 font-bold text-xs">{row.split(' · ')[1]} ✓</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* DONE payoff */}
      <motion.div
        className="absolute bottom-[18%] inset-x-4 text-center"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 8 }}
      >
        <div className="text-[10px] tracking-[0.3em] text-cyan-300 font-bold mb-1">FILED · SIGNED · GONE</div>
        <div className="text-5xl font-black text-white leading-none">
          3<span className="text-cyan-400">.0</span>s
        </div>
        <div className="text-xs text-slate-300 mt-2">eyes never left the road</div>
      </motion.div>

      <motion.div
        className="absolute bottom-5 inset-x-0 flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 13 }}
      >
        <Logo size={28} withWordmark tagline="Voice-First · Always On" />
      </motion.div>
    </motion.div>
  );
}

/* ============================================================
 *  CUT 3 — CRASH DETECTED
 *  0.0s  : Calm dashcam framing
 *  1.0s  : Sudden impact flash (red strobe)
 *  2.0s  : "CRASH DETECTED" text slams in
 *  4.0s  : Dashcam upload progress
 *  7.0s  : Dispatch notified
 *  9.5s  : "EVIDENCE LOCKED" with chain-of-custody UUID
 *  12.0s : Brand lockup
 * ============================================================ */
function CrashScene() {
  return (
    <motion.div
      className="absolute inset-0 bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Dashcam frame */}
      <motion.div
        className="absolute inset-4 rounded-2xl border border-slate-800"
        style={{ background: 'linear-gradient(180deg, #1e293b 0%, #020617 70%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="absolute top-2 left-3 text-[9px] tracking-[0.3em] text-red-400/80 font-bold">● REC · DASHCAM 01</div>
        <div className="absolute top-2 right-3 text-[9px] text-slate-400 font-mono">75 MPH</div>

        {/* Road horizon */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-slate-700/50" />
        <div className="absolute left-1/2 top-1/2 bottom-0 w-px bg-yellow-400/40 -translate-x-1/2"
             style={{ backgroundImage: 'linear-gradient(180deg, rgba(250,204,21,0.5) 50%, transparent 50%)', backgroundSize: '2px 16px' }}
        />
      </motion.div>

      {/* Impact flash */}
      <motion.div
        className="absolute inset-0 bg-red-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.8, 0, 0.5, 0] }}
        transition={{ duration: 0.8, times: [0, 0.2, 0.4, 0.6, 1], delay: 1 }}
      />

      {/* CRASH DETECTED slam */}
      <motion.div
        className="absolute top-[28%] inset-x-4 text-center"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.1, 1], opacity: 1 }}
        transition={{ duration: 0.4, delay: 2 }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-red-600/95 border-4 border-red-300 shadow-[0_0_50px_rgba(239,68,68,0.7)]">
          <Camera className="w-7 h-7 text-white" />
          <div className="text-2xl font-black tracking-tight text-white">CRASH DETECTED</div>
        </div>
        <div className="mt-2 text-xs text-red-200/80 tracking-wider">G-FORCE · 4.2g</div>
      </motion.div>

      {/* Upload progress */}
      <motion.div
        className="absolute top-[50%] inset-x-6"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 4 }}
      >
        <div className="bg-slate-900/95 backdrop-blur border border-cyan-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">SECURING EVIDENCE</div>
          </div>
          <div className="text-sm font-semibold text-white mb-2">Dashcam clip · uploading</div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <motion.div
              className="h-full bg-cyan-400"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 3, delay: 4.4 }}
            />
          </div>
        </div>
      </motion.div>

      {/* Dispatch notified */}
      <motion.div
        className="absolute top-[68%] inset-x-6"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 7 }}
      >
        <div className="bg-emerald-500/15 backdrop-blur border border-emerald-400/40 rounded-xl p-3 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0" />
          <div>
            <div className="text-xs uppercase tracking-wider text-emerald-300 font-bold">DISPATCH NOTIFIED · 911 OFFERED</div>
            <div className="text-[10px] text-emerald-200/70 font-mono">EVIDENCE-ID · A4F3-7B2C-9E1D</div>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-5 inset-x-0 flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 12 }}
      >
        <Logo size={28} withWordmark tagline="Always Protecting" />
      </motion.div>
    </motion.div>
  );
}
