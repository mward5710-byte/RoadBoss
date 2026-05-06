import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic, MapPin, Shield, Truck, Wrench, Camera, Radio, Activity, ArrowRight, CheckCircle2, Sparkles, Zap, Lock, Phone, Bot, Briefcase } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, getUser } from '@/lib/api';
import { toast } from 'sonner';
import { WreckerLogixLogo } from '@/components/WreckerLogixLogo';

function Section({ children, className = '' }) {
  return <section className={`max-w-6xl mx-auto px-5 ${className}`}>{children}</section>;
}

/**
 * Smart "Open App" button — detects whether the visitor is already logged in
 * and routes them straight to the right landing page for their role. If they
 * aren't logged in, sends them to /login. Either way: ONE tap, no hunting.
 */
function OpenAppButton({ size = 'sm', fullLabel = false, dataTestId = 'nav-open-app' }) {
  const u = typeof window !== 'undefined' ? getUser() : null;
  const target = !u ? '/login'
    : u.role === 'driver' ? '/driver'
    : u.role === 'wrecker_operator' ? '/wrecker/me'
    : ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin'].includes(u.role) ? '/wrecker'
    : u.role === 'super_admin' ? '/super'
    : '/app';
  const label = u ? (fullLabel ? `Open RoadBoss · ${u.name?.split(' ')[0] || ''}` : 'Open App') : 'Open the App';
  return (
    <Link to={target} data-testid={dataTestId}>
      <Button size={size} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">
        <Truck className="w-3.5 h-3.5 mr-1.5" /> {label} <ArrowRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    </Link>
  );
}

/**
 * Dedicated "Open WreckerLogix" entry — Mike asked for a clearly-labeled
 * way for towing companies (Kenny etc.) to slide straight into the wrecker
 * side. Uses the WreckerLogix brand (NOT RoadBoss).
 */
function OpenWreckerButton({ size = 'sm', dataTestId = 'nav-open-wrecker' }) {
  const u = typeof window !== 'undefined' ? getUser() : null;
  const target = !u ? '/login?next=/wrecker' : '/wrecker';
  return (
    <Link to={target} data-testid={dataTestId}>
      <Button size={size} variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 font-semibold">
        <Wrench className="w-3.5 h-3.5 mr-1.5" /> Towing &amp; Recovery <ArrowRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    </Link>
  );
}

const features = [
  { icon: Mic, title: 'Hands-Free Voice OS', desc: "Drive, dispatch, log, reply — all by voice. Built for the cab, not the cubicle." },
  { icon: MapPin, title: 'Truck-Aware GPS', desc: 'Mapbox + truck restrictions, low bridges, weigh stations, and fuel optimization on every route.' },
  { icon: Shield, title: 'ELD & HOS Compliance', desc: 'FMCSA-grade Hours of Service tracking, DVIR by voice, IFTA-ready exports.' },
  { icon: Camera, title: 'Dashcam Integrations', desc: 'Samsara, Lytx, Verizon Connect — events, clips, and coaching in one feed.' },
  { icon: Activity, title: 'Crash Detection + Auto-Alert', desc: 'Sensor-driven collision detection with a 15-second confirm window before 911 + dispatch.' },
  { icon: Wrench, title: 'Maintenance & Mileage', desc: 'Per-driver mile tracking, service schedules, voice-logged repairs, fleet cost analytics.' },
  { icon: Radio, title: 'CB Talker Network', desc: 'Geo-aware voice rooms keyed to highway corridors. Hands-free push-to-talk — modern CB.' },
  { icon: Bot, title: 'AI Copilot', desc: 'Natural-language commands, smart reply suggestions, and a copilot that knows your truck.' },
];

const phases = [
  { tag: 'Phase 1', title: 'Foundation', months: 'Months 1–4', items: ['Voice OS + TTS/STT', 'Messaging readout', 'Background audio', 'Alpha testers'] },
  { tag: 'Phase 2', title: 'Trucker Core', months: 'Months 5–9', items: ['ELD / HOS', 'Truck GPS', 'Mileage / IFTA', 'Maintenance', 'Beta launch'] },
  { tag: 'Phase 3', title: 'Safety & Fleet', months: 'Months 10–15', items: ['Crash detect', 'Dashcam APIs', 'Roadside assist', 'Fleet dashboard', 'Public launch'] },
  { tag: 'Phase 4', title: 'Scale & Enterprise', months: 'Months 16–24', items: ['Trade shows', 'Insurance partners', 'Fleet contracts', 'Series A'] },
];

export default function Marketing() {
  const [form, setForm] = useState({ name: '', email: '', role: 'owner-operator', fleet_size: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email) { toast.error('Name and email are required.'); return; }
    setSubmitting(true);
    try {
      const r = await api.post('/waitlist', form);
      toast.success(r.data.message || "You're in.");
      setSubmitted(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Something went wrong.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen text-slate-200 hp-grid-bg overflow-x-hidden">
      {/* Top nav */}
      <header className="sticky top-0 z-40 backdrop-blur bg-[#07090d]/70 border-b border-white/5">
        <Section className="flex items-center justify-between py-3.5 gap-2">
          {/* Logo + inline "Open App" — Mike asked for this so Kenny sees
              an impossible-to-miss entry point right next to the brand. */}
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="shrink-0" data-testid="marketing-home-link"><Logo /></Link>
            <span className="hidden sm:inline-block h-6 w-px bg-white/10" />
            <div className="hidden sm:flex items-center">
              <OpenAppButton size="sm" dataTestId="nav-open-app-inline" />
            </div>
          </div>
          <nav className="hidden lg:flex items-center gap-7 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#roadmap" className="hover:text-white transition">Roadmap</a>
            <Link to="/pricing" className="hover:text-white transition">Pricing</Link>
            <Link to="/try" className="hover:text-white transition">Try it</Link>
            <Link to="/roi" className="hover:text-white transition">Fleet ROI</Link>
            <Link to="/guide" className="hover:text-white transition">Manual</Link>
          </nav>
          <div className="flex items-center gap-2">
            {/* Mobile-only: the big "Open App" tile goes here since the header gets too tight */}
            <div className="sm:hidden">
              <OpenAppButton size="sm" dataTestId="nav-open-app-mobile" />
            </div>
            <Link to="/investors" data-testid="nav-investor-cta" className="hidden sm:inline-block">
              <Button size="sm" variant="outline" className="border-amber-500/40 bg-amber-500/5 text-amber-300 hover:bg-amber-500/10 font-semibold">
                <Briefcase className="w-3.5 h-3.5 mr-1.5" /> Investors
              </Button>
            </Link>
            <Link to="/login" className="hidden sm:inline-block">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">Sign in</Button>
            </Link>
          </div>
        </Section>
      </header>

      {/* Hero */}
      <Section className="pt-20 pb-24 relative">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs uppercase tracking-widest mb-6">
            <Sparkles className="w-3.5 h-3.5" /> Stealth — invitation only
          </div>
          <h1 className="text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
            <span className="hp-chrome-text">The command center</span><br />
            <span className="text-white">for the open road.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-400 max-w-2xl">
            Built by truckers. Run by truckers. RoadBoss is the first all-in-one operating system for fleets — hands-free voice, truck-aware GPS that routes around low bridges and weight limits, ELD compliance, dashcam, crash detection, and an AI co-pilot that rides shotgun.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            {/* TWO labeled entry points, per Mike's request:
                - "Open the App" = RoadBoss (umbrella / fleet)
                - "Towing & Recovery" = WreckerLogix (the wrecker side)
                Crystal clear which door to walk through. */}
            <OpenAppButton size="lg" fullLabel dataTestId="hero-open-app" />
            <OpenWreckerButton size="lg" dataTestId="hero-open-wrecker" />
            <Link to="/investors" data-testid="hero-investor-cta">
              <Button size="lg" variant="ghost" className="text-amber-200/80 hover:text-amber-200 hover:bg-amber-500/5 font-semibold">
                <Briefcase className="w-4 h-4 mr-1.5" /> Investors
              </Button>
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-sky-400" /> Built for owner-operators &amp; fleets</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-sky-400" /> FMCSA ELD pathway</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-sky-400" /> 10+ integrations on day one</div>
          </div>
        </motion.div>

        {/* Hero showcase card */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }} className="mt-16 hp-panel-bordered rounded-2xl p-1 hp-glow">
          <div className="rounded-xl bg-[#0a0e14] p-6 md:p-10 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-2">Driver cockpit</div>
              <div className="text-3xl md:text-4xl font-semibold text-white">"Hey Pilot, check H-O-S."</div>
              <div className="mt-3 text-slate-400">A single voice command. Hours of service spoken back. Dispatch alerted. Eyes never leave the road.</div>
              <div className="mt-6 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-sky-500/15 border border-sky-500/40 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-sky-300" />
                </div>
                <div>
                  <div className="text-sm text-white">Voice intent recognized</div>
                  <div className="text-xs text-slate-500">3 hours, 55 minutes remaining today.</div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-[4/3] rounded-xl border border-white/10 bg-gradient-to-br from-[#0e131a] to-[#07090d] p-5 hp-scan-line">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">FLEET COMMAND</div>
                  <div className="text-xs text-sky-400/80">LIVE</div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Drivers', value: '5', sub: 'on shift' },
                    { label: 'Miles', value: '1,927', sub: 'this week' },
                    { label: 'Alerts', value: '3', sub: 'last 24h' },
                  ].map((k) => (
                    <div key={k.label} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">{k.label}</div>
                      <div className="text-2xl font-semibold text-white mt-0.5">{k.value}</div>
                      <div className="text-[10px] text-slate-500">{k.sub}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-sky-200 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" /> Truck 103 hard brake near I-75 mile 245
                </div>
                <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" /> Aaliyah J. — 75 min HOS remaining
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </Section>

      {/* Features */}
      <Section id="features" className="py-24">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">One platform</div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white">Everything the cab needs. Nothing it doesn't.</h2>
          <p className="mt-4 text-slate-400">Until now, drivers juggled five apps and a CB. RoadBoss fuses them into a single voice-driven OS — with a fleet command center on the back end.</p>
        </div>
        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }} className="hp-panel rounded-xl p-5 hover:border-sky-500/30 transition">
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-sky-300" />
              </div>
              <div className="text-white font-semibold">{f.title}</div>
              <div className="text-sm text-slate-400 mt-1.5 leading-relaxed">{f.desc}</div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Roadmap */}
      <Section id="roadmap" className="py-24">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">24-month roadmap</div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white">From hands-free core to enterprise scale.</h2>
        </div>
        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {phases.map((p, i) => (
            <motion.div key={p.tag} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.07 }} className="hp-panel rounded-xl p-5 relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-20 h-20 rounded-full bg-sky-500/10 blur-2xl" />
              <div className="text-xs text-sky-400/80 uppercase tracking-widest">{p.tag}</div>
              <div className="text-xl font-bold text-white mt-1">{p.title}</div>
              <div className="text-xs text-slate-500">{p.months}</div>
              <ul className="mt-4 space-y-2">
                {p.items.map((it) => (
                  <li key={it} className="text-sm text-slate-300 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" /> {it}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Waitlist */}
      <Section id="waitlist" className="py-24">
        <div className="hp-panel-bordered rounded-2xl p-8 md:p-12 hp-glow grid md:grid-cols-2 gap-10">
          <div>
            <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">Get on the list</div>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Be one of the first 500 drivers.</h2>
            <p className="mt-3 text-slate-400">We're onboarding owner-operators and small fleets first. Tell us about your rig and we'll be in touch.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <li className="flex items-center gap-2"><Lock className="w-4 h-4 text-sky-400" /> Confidential — no spam, ever.</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-sky-400" /> Personal onboarding when you're in.</li>
              <li className="flex items-center gap-2"><Truck className="w-4 h-4 text-sky-400" /> Lifetime founder pricing for early users.</li>
            </ul>
          </div>
          <div>
            {submitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-sky-500/15 border border-sky-500/40 mx-auto flex items-center justify-center mb-4"><CheckCircle2 className="w-8 h-8 text-sky-300" /></div>
                <div className="text-2xl font-semibold text-white">You're in.</div>
                <div className="text-slate-400 mt-2">We'll be in touch personally. Keep an eye out.</div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input data-testid="waitlist-name" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-[#0a0e14] border-white/10" />
                  <Input data-testid="waitlist-email" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-[#0a0e14] border-white/10" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select data-testid="waitlist-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="bg-[#0a0e14] border border-white/10 rounded-md px-3 py-2 text-sm">
                    <option value="owner-operator">Owner-operator</option>
                    <option value="fleet">Fleet manager</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="investor">Investor</option>
                    <option value="other">Other</option>
                  </select>
                  <Input data-testid="waitlist-fleet" placeholder="Fleet size (optional)" value={form.fleet_size} onChange={(e) => setForm({ ...form, fleet_size: e.target.value })} className="bg-[#0a0e14] border-white/10" />
                </div>
                <Textarea data-testid="waitlist-message" placeholder="What's the one thing about your current setup that drives you crazy? (optional)" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="bg-[#0a0e14] border-white/10 min-h-[100px]" />
                <Button data-testid="waitlist-submit" type="submit" disabled={submitting} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">{submitting ? 'Sending...' : 'Reserve my spot'}</Button>
                <div className="text-[11px] text-slate-500 text-center">By joining you agree to receive RoadBoss updates. Unsubscribe anytime.</div>
              </form>
            )}
          </div>
        </div>
      </Section>

      {/* Investor banner — closing hook */}
      <Section className="pb-20" id="investors-banner">
        <Link to="/investors" className="block group" data-testid="footer-investor-banner">
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-8 md:p-10 hover:border-amber-500/50 transition-all relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-amber-500/10 blur-3xl group-hover:bg-amber-500/15 transition-colors" />
            <div className="relative grid md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] uppercase tracking-widest mb-3">
                  <Briefcase className="w-3 h-3" /> For Investors &amp; Strategic Partners
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                  Want to back a real product, in production, used today?
                </h3>
                <p className="mt-3 text-slate-300 max-w-xl">
                  RoadBoss isn't a slide deck — it's running multi-tenant SaaS with payments, dispatch, and AI built by a working trucker. Skip the gatekeepers and call Michael directly.
                </p>
              </div>
              <div className="flex md:justify-end">
                <Button size="lg" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold group-hover:translate-x-0.5 transition-transform">
                  Talk to Michael <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          </div>
        </Link>
      </Section>

      <footer className="border-t border-white/5 py-8 mt-12">
        <Section className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={22} />
            <div className="text-[11px] text-slate-500 leading-tight">
              <div className="text-slate-300 font-medium">Apex Epoxy Flooring LLC · Operating as RoadBoss</div>
              <div>Built by Michael Ward · Kokomo, Indiana</div>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 text-center">
            © {new Date().getFullYear()} Apex Epoxy Flooring LLC. All rights reserved.<br />
            <span className="text-slate-600">RoadBoss · Wreckerlogix · Co-Pilot</span>
          </div>
          <div className="flex gap-4 text-xs text-slate-500">
            <Link to="/login" className="hover:text-white">Sign in</Link>
            <a href="#waitlist" className="hover:text-white">Waitlist</a>
          </div>
        </Section>
      </footer>
    </div>
  );
}
