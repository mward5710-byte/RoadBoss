import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic, MapPin, Shield, Truck, Wrench, Camera, Radio, Activity, ArrowRight, CheckCircle2, Sparkles, Zap, Lock, Phone, Bot } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { toast } from 'sonner';

function Section({ children, className = '' }) {
  return <section className={`max-w-6xl mx-auto px-5 ${className}`}>{children}</section>;
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
        <Section className="flex items-center justify-between py-3.5">
          <Logo />
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#roadmap" className="hover:text-white transition">Roadmap</a>
            <Link to="/pricing" className="hover:text-white transition">Pricing</Link>
            <a href="#waitlist" className="hover:text-white transition">Waitlist</a>
            <Link to="/try" className="hover:text-white transition">Try it</Link>
            <Link to="/deck" className="hover:text-white transition hidden md:inline">Investors</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost" size="sm" className="text-slate-300 hover:text-white">Sign in</Button></Link>
            <a href="#waitlist"><Button size="sm" className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-medium">Get Early Access</Button></a>
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
            Highway Pilot is the first all-in-one operating system for truckers and fleets. Hands-free voice. Truck-aware GPS. ELD compliance. Dashcam, crash detection, and an AI copilot that rides shotgun.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/try"><Button size="lg" className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">Try the live demo <ArrowRight className="w-4 h-4 ml-1" /></Button></Link>
            <a href="#waitlist"><Button size="lg" variant="outline" className="border-white/15 text-slate-200 hover:bg-white/5">Join the waitlist</Button></a>
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
          <p className="mt-4 text-slate-400">Until now, drivers juggled five apps and a CB. Highway Pilot fuses them into a single voice-driven OS — with a fleet command center on the back end.</p>
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
                <div className="text-slate-400 mt-2">We'll reach out from a Highway Pilot address. Keep an eye out.</div>
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
                <div className="text-[11px] text-slate-500 text-center">By joining you agree to receive Highway Pilot updates. Unsubscribe anytime.</div>
              </form>
            )}
          </div>
        </div>
      </Section>

      <footer className="border-t border-white/5 py-8 mt-12">
        <Section className="flex flex-col md:flex-row items-center justify-between gap-3">
          <Logo size={22} />
          <div className="text-xs text-slate-500">© {new Date().getFullYear()} Highway Pilot. Stealth project. All rights reserved.</div>
          <div className="flex gap-4 text-xs text-slate-500">
            <Link to="/login" className="hover:text-white">Sign in</Link>
            <a href="#waitlist" className="hover:text-white">Waitlist</a>
          </div>
        </Section>
      </footer>
    </div>
  );
}
