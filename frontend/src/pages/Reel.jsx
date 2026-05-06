/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck, Mic, Camera, Navigation as NavIcon, Briefcase, ShieldCheck,
  TrendingUp, Lock, ArrowRight, Phone, Mail, Sparkles, Zap, MapPin,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { api } from '@/lib/api';

// =============================================================================
// 30-SECOND TIKTOK DEMO REEL
// Portrait-optimized (9:16). Loops forever. Mike screen-records on his phone.
// =============================================================================

const SCENES = [
  { id: 'opener',     duration: 3000 },
  { id: 'dispatch',   duration: 5000 },
  { id: 'navigation', duration: 8000 },
  { id: 'copilot',    duration: 5000 },
  { id: 'vault',      duration: 4000 },
  { id: 'closing',    duration: 5000 },
];
const TOTAL_MS = SCENES.reduce((s, x) => s + x.duration, 0);

function useSceneClock() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = (now - start) % TOTAL_MS;
      setT(elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Find current scene
  let acc = 0;
  let active = SCENES[0];
  let local = 0;
  for (const s of SCENES) {
    if (t < acc + s.duration) {
      active = s;
      local = (t - acc) / s.duration; // 0..1
      break;
    }
    acc += s.duration;
  }
  return { t, scene: active.id, local, sceneIndex: SCENES.findIndex((s) => s.id === active.id) };
}

export default function Reel() {
  const { scene, local, sceneIndex } = useSceneClock();
  const [contact, setContact] = useState({ owner_name: 'Michael Ward', phone: '', email: '', city: 'Kokomo', state: 'IN' });

  useEffect(() => {
    api.get('/business-profile/public').then((r) => setContact((c) => ({ ...c, ...r.data }))).catch(() => {});
  }, []);

  return (
    <div className="bg-black min-h-screen flex items-center justify-center overflow-hidden">
      {/* TikTok 9:16 frame — auto-fits screen, perfect for phone screen recording */}
      <div className="relative bg-[#07090d] overflow-hidden shadow-2xl"
           style={{ width: 'min(100vw, 56.25vh)', height: 'min(177.78vw, 100vh)', maxWidth: '450px', maxHeight: '800px' }}
           data-testid="reel-frame">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-30 pointer-events-none"
             style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)', backgroundSize: '32px 32px' }} />

        {/* Progress dots */}
        <div className="absolute top-3 left-3 right-3 flex gap-1 z-30">
          {SCENES.map((s, i) => (
            <div key={s.id} className="flex-1 h-0.5 rounded-full bg-white/15 overflow-hidden">
              <motion.div className="h-full bg-amber-400"
                animate={{ width: i < sceneIndex ? '100%' : i === sceneIndex ? `${local * 100}%` : '0%' }}
                transition={{ duration: 0.1, ease: 'linear' }} />
            </div>
          ))}
        </div>

        {/* Scenes */}
        <AnimatePresence mode="wait">
          {scene === 'opener'     && <SceneOpener     key="opener"     local={local} />}
          {scene === 'dispatch'   && <SceneDispatch   key="dispatch"   local={local} />}
          {scene === 'navigation' && <SceneNavigation key="navigation" local={local} />}
          {scene === 'copilot'    && <SceneCopilot    key="copilot"    local={local} />}
          {scene === 'vault'      && <SceneVault      key="vault"      local={local} />}
          {scene === 'closing'    && <SceneClosing    key="closing"    local={local} contact={contact} />}
        </AnimatePresence>

        {/* Persistent watermark — bottom-right */}
        <div className="absolute bottom-3 right-3 z-30 text-[9px] uppercase tracking-widest text-white/40 font-semibold">
          @wrecker-logix
        </div>
      </div>
    </div>
  );
}

// -------------------- Scene primitives --------------------

const sceneShell = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.45 },
};

function SceneOpener() {
  return (
    <motion.div {...sceneShell} className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
      {/* Animated shield with the real Logo SVG inside */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6 relative"
      >
        <motion.div
          animate={{ scale: [1, 1.22, 1], opacity: [0.55, 0.15, 0.55] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-3xl bg-amber-500/30 blur-3xl scale-125"
        />
        <Logo size={120} withWordmark={false} />
      </motion.div>
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.55 }}
        className="text-5xl font-extrabold leading-[1.05] tracking-tight"
      >
        <span className="text-white">Road</span><span className="text-amber-300">Boss</span>
      </motion.div>
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.55 }}
        className="mt-2 text-xs uppercase tracking-[0.32em] text-amber-400/80 font-semibold"
      >
        Wreckerlogix
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="mt-7 text-base text-slate-300 max-w-xs leading-snug"
      >
        Built by truckers.<br />For truckers.
      </motion.p>
    </motion.div>
  );
}

function CountUp({ to, prefix = '', suffix = '', duration = 1.4 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.floor(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <span className="tabular-nums">{prefix}{n.toLocaleString()}{suffix}</span>;
}

function SceneDispatch() {
  return (
    <motion.div {...sceneShell} className="absolute inset-0 flex flex-col px-5 pt-12">
      <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4 }}
        className="text-[10px] uppercase tracking-[0.3em] text-amber-400/80 font-semibold mb-1">
        Live · Dispatch Board
      </motion.div>
      <motion.h2 initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.4 }}
        className="text-2xl font-bold text-white leading-tight mb-5">
        Real numbers from real jobs.
      </motion.h2>
      <div className="grid grid-cols-2 gap-3">
        <KpiAnim label="Today's Revenue" value={<CountUp to={15847} prefix="$" />}    color="emerald" delay={0.4} />
        <KpiAnim label="Jobs Dispatched" value={<CountUp to={47}    suffix="" />}      color="amber"   delay={0.6} />
        <KpiAnim label="Active Impounds" value={<CountUp to={12}    suffix="" />}      color="rose"    delay={0.8} />
        <KpiAnim label="Drivers Online"  value={<CountUp to={8}     suffix="" />}      color="sky"     delay={1.0} />
      </div>
      <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.6, duration: 0.5 }}
        className="mt-5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5" />
        <span>+18% vs. last week. Auto-tracked.</span>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 }}
        className="mt-auto mb-12 text-center text-[11px] uppercase tracking-widest text-slate-500">
        $0 spreadsheets. Zero double-entry.
      </motion.div>
    </motion.div>
  );
}

function KpiAnim({ label, value, color, delay }) {
  const accents = {
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    amber:   'border-amber-500/30 bg-amber-500/10 text-amber-300',
    rose:    'border-rose-500/30 bg-rose-500/10 text-rose-300',
    sky:     'border-sky-500/30 bg-sky-500/10 text-sky-300',
  };
  return (
    <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      className={`rounded-xl border ${accents[color]} p-3.5`}>
      <div className="text-[9px] uppercase tracking-widest opacity-70">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
    </motion.div>
  );
}

// -------------------- NAVIGATION SCENE (the showstopper) --------------------

function SceneNavigation({ local }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const tokenRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!tokenRef.current) {
          const r = await api.get('/mapbox/config');
          if (cancelled || !r.data?.token) return;
          tokenRef.current = r.data.token;
        }
        if (!containerRef.current || mapRef.current) return;
        mapboxgl.accessToken = tokenRef.current;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [-86.15, 40.13],
          zoom: 8.5,
          interactive: false,
          attributionControl: false,
        });
        map.on('load', () => {
          map.addSource('reel-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({ id: 'reel-glow', type: 'line', source: 'reel-route',
            paint: { 'line-color': '#fbbf24', 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.5 },
            layout: { 'line-cap': 'round', 'line-join': 'round' } });
          map.addLayer({ id: 'reel-line', type: 'line', source: 'reel-route',
            paint: { 'line-color': '#fbbf24', 'line-width': 6 },
            layout: { 'line-cap': 'round', 'line-join': 'round' } });
          mapRef.current = map;
          setReady(true);
          // Smoothly arc the camera across the corridor
          map.flyTo({ center: [-86.16, 40.13], zoom: 9.2, duration: 7500, essential: true });
        });
      } catch (e) { /* offline fallback */ }
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  // Animate the route line drawing in (Kokomo → Indianapolis)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const FULL = [
      [-86.1336, 40.4865], [-86.1402, 40.4523], [-86.1289, 40.4011], [-86.1112, 40.3489],
      [-86.0987, 40.3012], [-86.0834, 40.2456], [-86.0701, 40.1872], [-86.0612, 40.1234],
      [-86.0501, 40.0598], [-86.0401, 39.9876], [-86.0289, 39.9201], [-86.0167, 39.8612],
      [-86.0089, 39.8189], [-86.0034, 39.7912], [-86.0006, 39.7763], [-86.1581, 39.7684],
    ];
    // Drawing-in animation: progressively reveal coordinates
    const reveal = Math.max(0.05, Math.min(1, local * 1.2));
    const cut = Math.max(2, Math.floor(FULL.length * reveal));
    const partial = FULL.slice(0, cut);
    mapRef.current.getSource('reel-route')?.setData({
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: partial },
    });
  }, [local, ready]);

  return (
    <motion.div {...sceneShell} className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#07090d]/80 via-transparent to-[#07090d]/95 pointer-events-none" />

      {/* Top label */}
      <motion.div initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4 }}
        className="absolute top-12 left-5 right-5 z-10">
        <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400/80 font-semibold">Truck-Aware Navigation</div>
        <h2 className="text-2xl font-bold text-white mt-1 leading-tight">Routes around <span className="text-amber-300">low bridges</span>.<br />Automatically.</h2>
      </motion.div>

      {/* Hazard cards revealing in sequence */}
      <div className="absolute bottom-16 left-5 right-5 space-y-2 z-10">
        <HazardChip delay={2.0} text="LOW BRIDGE — S Washington St · 12'6&quot;" color="rose" />
        <HazardChip delay={3.5} text="LOW BRIDGE — Markland Ave RR · 13'1&quot;" color="rose" />
        <HazardChip delay={5.0} text="WEIGHT LIMIT — Wildcat Creek · 18T" color="amber" />
      </div>

      {/* Final reveal */}
      <motion.div initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: local > 0.85 ? 1 : 0, scale: local > 0.85 ? 1 : 0.9 }}
        transition={{ duration: 0.5 }}
        className="absolute inset-x-5 bottom-3 z-20 px-3.5 py-2.5 bg-amber-500 text-slate-950 rounded-lg flex items-center gap-2 shadow-2xl shadow-amber-500/30">
        <ShieldCheck className="w-4 h-4" />
        <span className="font-bold text-sm">3 RESTRICTIONS AVOIDED</span>
      </motion.div>
    </motion.div>
  );
}

function HazardChip({ delay, text, color }) {
  const colors = {
    rose: 'bg-rose-500/15 border-rose-500/40 text-rose-200',
    amber: 'bg-amber-500/15 border-amber-500/40 text-amber-200',
  };
  return (
    <motion.div
      initial={{ x: -30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className={`px-3 py-2 rounded-lg border backdrop-blur-md text-[11px] font-semibold ${colors[color]}`}
    >
      {text}
    </motion.div>
  );
}

// -------------------- COPILOT --------------------

function SceneCopilot({ local }) {
  // Fake transcript reveal
  const TARGET = 'Pull up my dispatch board.';
  const charsToShow = Math.floor(TARGET.length * Math.min(1, local * 1.4));
  return (
    <motion.div {...sceneShell} className="absolute inset-0 flex flex-col px-5 pt-12">
      <div className="text-[10px] uppercase tracking-[0.3em] text-sky-400/80 font-semibold mb-1">Hands-Free Co-Pilot</div>
      <h2 className="text-2xl font-bold text-white leading-tight mb-6">Drive. Dispatch. <span className="text-sky-300">Same time.</span></h2>

      {/* Listening waveform */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 -mt-4">
        <div className="relative w-44 h-44">
          {[1, 2, 3].map((i) => (
            <motion.div key={i}
              animate={{ scale: [1, 1.4 + i * 0.1, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.3, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full bg-sky-500/30" />
          ))}
          <div className="absolute inset-6 rounded-full bg-gradient-to-br from-sky-500/40 to-sky-500/10 border-2 border-sky-400/60 flex items-center justify-center">
            <Mic className="w-12 h-12 text-sky-200" strokeWidth={2.2} />
          </div>
        </div>

        <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 min-h-[58px] w-full max-w-xs flex items-center justify-center text-center">
          <span className="text-base text-white">
            "{TARGET.slice(0, charsToShow)}<motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>|</motion.span>"
          </span>
        </div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: local > 0.7 ? 1 : 0, y: local > 0.7 ? 0 : 6 }}
          className="px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs font-semibold">
          ✓ Dispatch board opening…
        </motion.div>
      </div>
    </motion.div>
  );
}

// -------------------- PHOTO VAULT --------------------

const VAULT_PHOTOS = [
  { driver: 'Steve Carroll',  stage: 'On Scene',     plate: 'IN-9382R' },
  { driver: 'Diego Martinez', stage: 'Pre-Hookup',   plate: 'KY-4471Q' },
  { driver: 'Mike Ward',      stage: 'Damage',       plate: 'IN-9382R' },
  { driver: 'Pam Henderson',  stage: 'Destination',  plate: 'OH-1827E' },
  { driver: 'Steve Carroll',  stage: 'Towing',       plate: 'IN-2210L' },
  { driver: 'Diego Martinez', stage: 'On Scene',     plate: 'IL-9908K' },
];

function SceneVault() {
  return (
    <motion.div {...sceneShell} className="absolute inset-0 flex flex-col px-5 pt-12">
      <div className="text-[10px] uppercase tracking-[0.3em] text-rose-400/80 font-semibold mb-1">Claims Defense Archive</div>
      <h2 className="text-2xl font-bold text-white leading-tight mb-5">Every photo. <span className="text-rose-300">Locked to the driver.</span></h2>

      <div className="grid grid-cols-3 gap-2 flex-1">
        {VAULT_PHOTOS.map((p, i) => (
          <motion.div key={i}
            initial={{ y: 16, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
            className="aspect-square rounded-md overflow-hidden bg-gradient-to-br from-amber-500/20 to-slate-700/40 border border-white/10 relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/40 via-transparent to-amber-500/10" />
            <div className="absolute top-1 left-1 bg-black/70 backdrop-blur-sm rounded px-1 py-0.5 text-[7px] font-semibold text-white max-w-[calc(100%-8px)] truncate">
              {p.driver}
            </div>
            <div className="absolute bottom-1 right-1 bg-black/60 rounded px-1 py-0.5 text-[7px] text-amber-300 font-mono">
              {p.plate}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6, duration: 0.5 }}
        className="mt-4 mb-12 text-center text-sm text-slate-300 leading-snug">
        <Lock className="inline w-3.5 h-3.5 text-rose-300 mr-1.5" />
        Chain of custody. <span className="text-rose-200 font-semibold">Forever.</span>
      </motion.div>
    </motion.div>
  );
}

// -------------------- CLOSING --------------------

function SceneClosing({ contact }) {
  return (
    <motion.div {...sceneShell} className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.55 }}
        className="text-[10px] uppercase tracking-[0.3em] text-amber-400/80 font-semibold mb-2">
        For Investors &amp; Strategic Partners
      </motion.div>
      <motion.h2 initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.55 }}
        className="text-3xl font-extrabold text-white leading-[1.1] tracking-tight">
        Real product.<br />Real founder.<br /><span className="text-amber-300">Real number.</span>
      </motion.h2>

      <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.9, duration: 0.55 }}
        className="mt-7 space-y-2 text-base text-white">
        {contact.phone && (
          <div className="flex items-center justify-center gap-2"><Phone className="w-4 h-4 text-amber-400" /><span className="font-semibold">{contact.phone}</span></div>
        )}
        {contact.email && (
          <div className="flex items-center justify-center gap-2 text-slate-200"><Mail className="w-4 h-4 text-amber-400" /><span>{contact.email}</span></div>
        )}
      </motion.div>

      <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.4, duration: 0.5 }}
        className="mt-7 px-5 py-2.5 rounded-full bg-amber-500 text-slate-950 font-bold text-sm shadow-2xl shadow-amber-500/30 flex items-center gap-2">
        wrecker-logix.com/investors <ArrowRight className="w-4 h-4" />
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.0, duration: 0.6 }}
        className="absolute bottom-8 left-0 right-0 text-center text-[10px] uppercase tracking-widest text-slate-500">
        Built solo · {contact.city || 'Kokomo'}, {contact.state || 'IN'}
      </motion.div>
    </motion.div>
  );
}
