// TryPage — "Try it free" landing page optimized for TikTok / Facebook / Reddit traffic.
// Self-playing animated phone demo (no filming needed, no founder on camera).
// One button → /api/auth/demo → logs visitor straight into the driver app.
// UTM tracking via ?src= for attribution.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  Shield,
  MapPin,
  MessageSquare,
  Phone,
  ChevronRight,
  PlayCircle,
  Check,
  Bot,
  Sparkles,
  Gauge,
  AlertTriangle,
  ArrowRight,
  Truck,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, setSession } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';

// Animated "conversation" shown on the phone mockup — cycles forever.
const PHONE_SCENES = [
  {
    id: 'wake',
    accent: '#38bdf8',
    icon: Mic,
    title: 'Wake word armed',
    user: '"Hey Co-Pilot..."',
    bot: '👂 Listening',
    meta: 'Hands on the wheel. Eyes on the road.',
  },
  {
    id: 'pretrip',
    accent: '#34d399',
    icon: Check,
    title: 'Pre-Trip Inspection',
    user: '"Start my pre-trip"',
    bot: '✅ 27-item DVIR started · hands-free',
    meta: 'FMCSA-compliant. Signed. Logged.',
  },
  {
    id: 'drive',
    accent: '#f59e0b',
    icon: MapPin,
    title: 'Truck-Aware Routing',
    user: '"Route me to Memphis terminal"',
    bot: '🗺 Rerouting — avoiding 12\'6" bridge on I-40',
    meta: 'Weight · height · hazmat aware',
  },
  {
    id: 'dispatch',
    accent: '#a78bfa',
    icon: MessageSquare,
    title: 'Voice-to-SMS Dispatch',
    user: '"Tell dispatch I\'m 20 minutes out"',
    bot: '📱 SMS sent to Night Dispatch',
    meta: 'Real Twilio SMS · never pick up the phone',
  },
  {
    id: 'crash',
    accent: '#f43f5e',
    icon: Shield,
    title: 'Crash Guardian',
    user: '⚠ Impact detected · 3.2g',
    bot: '🚨 Auto-dispatching + notifying emergency contact in 00:15',
    meta: 'OnStar for every truck. For free.',
  },
  {
    id: 'hos',
    accent: '#22d3ee',
    icon: Gauge,
    title: 'Hours of Service',
    user: '"How much drive time do I have left?"',
    bot: '🕐 4h 12m on 11-hour clock · 70-hr: 23h 40m',
    meta: 'FMCSA-compliant · never another violation',
  },
];

function PhoneMockup({ sceneIndex }) {
  const scene = PHONE_SCENES[sceneIndex];
  const Icon = scene.icon;
  return (
    <div className="relative mx-auto" style={{ width: 320, maxWidth: '100%' }}>
      {/* Ambient glow that shifts to match scene accent */}
      <div
        aria-hidden
        className="absolute -inset-8 rounded-[48px] blur-2xl transition-colors duration-700"
        style={{ background: `radial-gradient(closest-side, ${scene.accent}33, transparent 70%)` }}
      />
      {/* Phone body */}
      <div className="relative rounded-[40px] border border-white/10 bg-gradient-to-b from-[#0a0e14] to-[#05070a] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
        <div className="px-5 pt-8 pb-5 relative" style={{ minHeight: 560 }}>
          {/* Status bar */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-4">
            <span className="font-medium">9:41</span>
            <div className="flex items-center gap-1.5">
              <span className="h-1 w-4 rounded bg-slate-400"></span>
              <span>5G</span>
              <span>100%</span>
            </div>
          </div>
          {/* Top bar — app chrome */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Logo size={22} withWordmark={false} />
              <div className="text-sm text-white font-semibold">RoadBoss</div>
            </div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              On duty
            </div>
          </div>
          {/* Scene card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={scene.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div
                className="rounded-2xl border p-4 mb-4"
                style={{ borderColor: `${scene.accent}33`, backgroundColor: `${scene.accent}10` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="h-8 w-8 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${scene.accent}22`, color: scene.accent }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="text-xs uppercase tracking-widest" style={{ color: scene.accent }}>
                    {scene.title}
                  </div>
                </div>
                <div className="text-white text-sm font-medium">{scene.user}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  <Bot className="h-3 w-3" /> Co-Pilot
                </div>
                <div className="text-slate-100 text-sm">{scene.bot}</div>
              </div>
              <div className="text-[11px] text-slate-500 text-center">{scene.meta}</div>
            </motion.div>
          </AnimatePresence>
          {/* Bottom nav */}
          <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/10 bg-black/40 backdrop-blur flex items-center justify-around px-3 py-2.5">
            {[Truck, Radio, Shield, Phone].map((I, i) => (
              <div key={i} className={`flex items-center justify-center h-8 w-8 rounded-lg ${i === 0 ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500'}`}>
                <I className="h-4 w-4" />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Notch */}
      <div className="absolute left-1/2 -translate-x-1/2 top-2 h-5 w-28 rounded-b-2xl bg-black/80 border border-white/5" />
    </div>
  );
}

export default function TryPage() {
  const navigate = useNavigate();
  const [sceneIdx, setSceneIdx] = useState(0);
  const [launching, setLaunching] = useState(false);

  const src = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('src') || 'direct';
    } catch {
      return 'direct';
    }
  }, []);

  // Auto-cycle the phone scenes every 3.2s
  useEffect(() => {
    const t = setInterval(() => {
      setSceneIdx((i) => (i + 1) % PHONE_SCENES.length);
    }, 3200);
    return () => clearInterval(t);
  }, []);

  const launchDemo = async (role = 'driver') => {
    setLaunching(true);
    try {
      const { data } = await api.post('/auth/demo', { role, source: src });
      setSession(data.access_token, data.user);
      toast.success('Demo mode unlocked — welcome to RoadBoss');
      const r = data.user.role;
      const dest = r === 'driver' ? '/driver'
        : r === 'wrecker_operator' ? '/wrecker/me'
        : ['wrecker_dispatcher', 'wrecker_supervisor'].includes(r) ? '/wrecker'
        : '/app';
      navigate(dest);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not start demo. Try again.');
      setLaunching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090d] text-white overflow-x-hidden" data-testid="try-page">
      {/* Ambient bg */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(60% 40% at 80% 20%, rgba(56,189,248,0.18), transparent 70%), radial-gradient(50% 40% at 20% 80%, rgba(52,211,153,0.12), transparent 70%)',
        }}
      />

      {/* Header */}
      <header className="relative border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={28} withWordmark={false} />
            <span className="text-sm font-semibold text-white">RoadBoss</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/deck" className="text-slate-300 hover:text-white transition hidden md:inline px-3">
              Investors
            </Link>
            <Link to="/pricing" className="text-slate-300 hover:text-white transition hidden md:inline px-3">
              Pricing
            </Link>
            <Link to="/login" className="text-slate-300 hover:text-white transition px-3">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-5 pt-12 pb-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-widest text-emerald-300 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Try the live app · no signup · no card
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight tracking-tight">
            The voice-first app <br className="hidden md:inline" /> every trucker deserves.
          </h1>
          <p className="text-lg text-slate-300 mt-4 max-w-xl">
            One tap below. You&apos;re in. Drive the demo fleet, fire the Co-Pilot by voice, see crash
            detection, send a real dispatch SMS. <span className="text-sky-300">It&apos;s the actual product — on your phone right now.</span>
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => launchDemo('driver')}
              disabled={launching}
              data-testid="try-demo-driver"
              className="bg-sky-500 text-slate-950 hover:bg-sky-400 text-base h-12 px-5"
            >
              <PlayCircle className="mr-2 h-5 w-5" />
              {launching ? 'Launching…' : 'Try as a driver'}
            </Button>
            <Button
              onClick={() => launchDemo('admin')}
              disabled={launching}
              variant="outline"
              data-testid="try-demo-admin"
              className="border-white/15 bg-transparent text-slate-100 hover:bg-white/5 text-base h-12 px-5"
            >
              Try as a fleet admin
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-widest text-slate-500">
            🚛 Wrecker Mode demos:
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              onClick={() => launchDemo('wrecker')}
              disabled={launching}
              variant="outline"
              data-testid="try-demo-wrecker"
              size="sm"
              className="border-sky-500/40 bg-sky-500/5 text-sky-200 hover:bg-sky-500/10 h-10 px-3 text-sm"
            >
              🚛 Tow Driver
            </Button>
            <Button
              onClick={() => launchDemo('dispatcher')}
              disabled={launching}
              variant="outline"
              data-testid="try-demo-dispatcher"
              size="sm"
              className="border-amber-500/40 bg-amber-500/5 text-amber-200 hover:bg-amber-500/10 h-10 px-3 text-sm"
            >
              📞 Dispatcher
            </Button>
            <Button
              onClick={() => launchDemo('supervisor')}
              disabled={launching}
              variant="outline"
              data-testid="try-demo-supervisor"
              size="sm"
              className="border-violet-500/40 bg-violet-500/5 text-violet-200 hover:bg-violet-500/10 h-10 px-3 text-sm"
            >
              🦺 Foreman
            </Button>
          </div>
          <div className="mt-6 flex items-center gap-4 flex-wrap text-xs text-slate-400">
            <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-400" /> No email required</span>
            <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-400" /> Real integrations</span>
            <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-400" /> Leave anytime</span>
          </div>
          {/* Social proof mini row */}
          <div className="mt-10 grid grid-cols-3 gap-3 max-w-md">
            {[
              { k: '4,000+', v: 'distracted-driving deaths/yr' },
              { k: '$800+', v: 'saved per truck/yr' },
              { k: '45 min', v: 'saved per shift' },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="text-lg font-bold text-sky-300">{s.k}</div>
                <div className="text-[10px] text-slate-400 leading-tight">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Animated phone mockup */}
        <div className="relative">
          <PhoneMockup sceneIndex={sceneIdx} />
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {PHONE_SCENES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSceneIdx(i)}
                data-testid={`scene-dot-${i}`}
                className={`h-1.5 rounded-full transition-all ${i === sceneIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/20'}`}
                aria-label={`Scene ${s.title}`}
              />
            ))}
          </div>
          <div className="mt-3 text-center text-xs text-slate-500">
            Auto-plays · tap dots to jump · everything you see is real
          </div>
        </div>
      </section>

      {/* Features band */}
      <section className="relative border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <div className="text-center mb-12">
            <div className="text-xs uppercase tracking-[0.3em] text-sky-400">Everything. One app.</div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-3">Built for the road. Priced for real people.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: Bot,       label: 'AI Co-Pilot',        desc: 'Voice-first. Context-aware. Takes real action on your behalf.' },
              { icon: Shield,    label: 'Crash Guardian',     desc: 'Auto-dispatch + text your emergency contact if you can\'t.' },
              { icon: MapPin,    label: 'Truck-Aware GPS',    desc: 'Weight · height · hazmat aware routing. Never a 12\'6" surprise.' },
              { icon: Sparkles,  label: 'FMCSA DVIR & HOS',   desc: '27-item pre/post-trip. Hands-free. Signed. Logged.' },
              { icon: AlertTriangle, label: 'Unified Dashcam', desc: 'Samsara · Lytx · Verizon · native. One feed, one app.' },
              { icon: MessageSquare, label: 'Voice-to-SMS',    desc: '"Tell dispatch I\'m late." Real SMS. Real Twilio. Real fast.' },
            ].map((f) => (
              <div key={f.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 transition">
                <f.icon className="h-5 w-5 text-sky-300" />
                <div className="text-lg font-semibold text-white mt-3">{f.label}</div>
                <div className="text-sm text-slate-400 mt-1">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative max-w-4xl mx-auto px-5 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white">Stop scrolling. Start driving.</h2>
        <p className="text-slate-300 mt-3 max-w-2xl mx-auto">
          Hit the button. You&apos;re inside the app in 3 seconds. Drive the demo fleet. See if it&apos;s real.
          Then tell us what to build next.
        </p>
        <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => launchDemo('driver')}
            disabled={launching}
            data-testid="try-demo-driver-bottom"
            className="bg-sky-500 text-slate-950 hover:bg-sky-400 h-12 px-6 text-base"
          >
            <PlayCircle className="mr-2 h-5 w-5" /> Launch demo · driver
          </Button>
          <Link to="/pricing">
            <Button
              variant="outline"
              className="border-white/15 bg-transparent text-slate-100 hover:bg-white/5 h-12 px-6 text-base"
            >
              See pricing <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="mt-10 text-xs text-slate-500">
          Operated by Apex Epoxy Flooring LLC · DBA RoadBoss / Highway Pilot · Kokomo, Indiana
        </div>
      </section>
    </div>
  );
}
