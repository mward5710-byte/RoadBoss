import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ArrowRight, Sparkles, ShieldCheck, Mic, Truck, Building2, Minus, Plus } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { api, getUser } from '@/lib/api';
import { toast } from 'sonner';

// Static UI-only tiers (Free & Enterprise are not Stripe-billed)
const FREE_FEATURES = [
  'TTS hands-free messaging',
  'Basic truck-aware GPS',
  'Voice command demo',
  'Driver PWA — install on phone',
];
const ENTERPRISE_FEATURES = [
  'Everything in Fleet',
  'White-label branding',
  'API access + webhooks',
  'Custom integrations',
  'Dedicated success manager',
];

function priceText(amountCents) {
  const dollars = Math.floor(amountCents / 100);
  const cents = amountCents % 100;
  return { dollars, cents: cents.toString().padStart(2, '0') };
}

export default function Pricing() {
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState('');
  const [trucks, setTrucks] = useState(5);
  const user = getUser();

  useEffect(() => {
    api.get('/stripe/config').then((r) => setConfig(r.data)).catch(() => setConfig({ configured: false, plans: [] }));
  }, []);

  const proPlan = useMemo(() => (config?.plans || []).find((p) => p.key === 'pro'), [config]);
  const fleetPlan = useMemo(() => (config?.plans || []).find((p) => p.key === 'fleet'), [config]);

  const subscribe = async (planKey, quantity = 1) => {
    if (!user) {
      toast.info('Please sign in to subscribe.');
      window.location.href = `/login?next=/pricing`;
      return;
    }
    if (user.role === 'driver') {
      toast.error('Subscriptions are managed by your fleet admin.');
      return;
    }
    setBusy(planKey);
    try {
      const r = await api.post('/stripe/checkout', { plan_key: planKey, quantity });
      window.location.href = r.data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not start checkout');
    } finally { setBusy(''); }
  };

  const fleetMonthly = fleetPlan ? (fleetPlan.amount_cents * trucks) / 100 : 0;

  return (
    <div className="min-h-screen text-slate-200 hp-grid-bg">
      <header className="sticky top-0 z-40 backdrop-blur bg-[#07090d]/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 flex items-center justify-between py-3.5">
          <Link to="/"><Logo /></Link>
          <div className="flex items-center gap-2">
            {user
              ? <Link to={user.role === 'driver' ? '/driver' : '/app'}><Button size="sm" variant="ghost" className="text-slate-300" data-testid="pricing-dashboard-btn">Dashboard</Button></Link>
              : <Link to="/login"><Button size="sm" variant="ghost" className="text-slate-300" data-testid="pricing-signin-btn">Sign in</Button></Link>}
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 pt-20 pb-10 text-center">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs uppercase tracking-widest mb-6">
            <Mic className="w-3.5 h-3.5" /> One app · Every mile · Hands free
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            <span className="hp-chrome-text">Fair pricing.</span> <span className="text-white">Built for the road.</span>
          </h1>
          <p className="mt-4 text-slate-400 max-w-2xl mx-auto">
            Replace $800–$1,500/year of fragmented trucker apps with one voice-first command center. 14-day free trial — no card charged today.
          </p>
        </motion.div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-16">
        {!config && <div className="text-center text-slate-500 py-12" data-testid="pricing-loading">Loading plans...</div>}

        {config && (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* FREE TIER */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-6 hp-panel relative flex flex-col" data-testid="plan-free">
              <div className="text-xs uppercase tracking-widest text-sky-400/80">Free</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-sm text-slate-500">/mo</span>
              </div>
              <p className="text-sm text-slate-400 mt-2">Get the safety win — no credit card.</p>
              <ul className="mt-5 space-y-2 flex-1">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="text-sm text-slate-300 flex items-start gap-2">
                    <Check className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Link to={user ? (user.role === 'driver' ? '/driver' : '/app') : '/login'}>
                <Button data-testid="subscribe-free" variant="outline" className="mt-6 w-full border-white/15 text-slate-200 hover:bg-white/5">
                  {user ? 'Open dashboard' : 'Get started free'} <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </motion.div>

            {/* PRO TIER */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="rounded-2xl p-6 hp-panel-bordered hp-glow relative flex flex-col" data-testid="plan-pro">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-sky-500 text-slate-950 font-semibold">Most popular</div>
              <div className="text-xs uppercase tracking-widest text-sky-400/80 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Pro</div>
              <div className="mt-2 flex items-baseline gap-1">
                {proPlan ? (
                  <>
                    <span className="text-4xl font-bold text-white">${priceText(proPlan.amount_cents).dollars}</span>
                    <span className="text-xl font-semibold text-white">.{priceText(proPlan.amount_cents).cents}</span>
                    <span className="text-sm text-slate-500 ml-1">/mo</span>
                  </>
                ) : (
                  <><span className="text-4xl font-bold text-white">$29</span><span className="text-xl font-semibold text-white">.99</span><span className="text-sm text-slate-500 ml-1">/mo</span></>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-2">Solo owner-operator. Everything you need on one screen.</p>
              <ul className="mt-5 space-y-2 flex-1">
                {(proPlan?.features || []).map((f) => (
                  <li key={f} className="text-sm text-slate-300 flex items-start gap-2">
                    <Check className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                data-testid="subscribe-pro"
                onClick={() => subscribe('pro', 1)}
                disabled={busy === 'pro' || !config.configured || !proPlan}
                className="mt-6 w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">
                {busy === 'pro' ? 'Loading...' : <>Start 14-day trial <ArrowRight className="w-4 h-4 ml-1" /></>}
              </Button>
            </motion.div>

            {/* FLEET TIER */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="rounded-2xl p-6 hp-panel relative flex flex-col" data-testid="plan-fleet">
              <div className="text-xs uppercase tracking-widest text-sky-400/80 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Fleet</div>
              <div className="mt-2 flex items-baseline gap-1">
                {fleetPlan ? (
                  <>
                    <span className="text-4xl font-bold text-white">${priceText(fleetPlan.amount_cents).dollars}</span>
                    <span className="text-xl font-semibold text-white">.{priceText(fleetPlan.amount_cents).cents}</span>
                    <span className="text-sm text-slate-500 ml-1">/truck/mo</span>
                  </>
                ) : (
                  <><span className="text-4xl font-bold text-white">$19</span><span className="text-xl font-semibold text-white">.99</span><span className="text-sm text-slate-500 ml-1">/truck/mo</span></>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-2">Pro features for every driver + fleet command center.</p>

              {/* Truck count selector */}
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-slate-400 mb-2">Trucks in your fleet</div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setTrucks((t) => Math.max(1, t - 1))}
                    disabled={trucks <= 1}
                    className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center disabled:opacity-40 transition-colors"
                    data-testid="fleet-trucks-decrement"
                    aria-label="Decrease trucks"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={trucks}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) setTrucks(Math.min(500, Math.max(1, v)));
                    }}
                    className="flex-1 bg-transparent text-center text-2xl font-bold text-white focus:outline-none"
                    data-testid="fleet-trucks-input"
                    aria-label="Number of trucks"
                  />
                  <button
                    type="button"
                    onClick={() => setTrucks((t) => Math.min(500, t + 1))}
                    className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center transition-colors"
                    data-testid="fleet-trucks-increment"
                    aria-label="Increase trucks"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">Estimated monthly</span>
                  <span className="text-lg font-semibold text-white" data-testid="fleet-monthly-total">
                    ${fleetMonthly.toFixed(2)}<span className="text-xs text-slate-500 ml-1">/mo</span>
                  </span>
                </div>
              </div>

              <ul className="mt-5 space-y-2 flex-1">
                {(fleetPlan?.features || []).map((f) => (
                  <li key={f} className="text-sm text-slate-300 flex items-start gap-2">
                    <Check className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                data-testid="subscribe-fleet"
                onClick={() => subscribe('fleet', trucks)}
                disabled={busy === 'fleet' || !config.configured || !fleetPlan}
                className="mt-6 w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">
                {busy === 'fleet' ? 'Loading...' : <>Start 14-day trial <ArrowRight className="w-4 h-4 ml-1" /></>}
              </Button>
            </motion.div>

            {/* ENTERPRISE TIER */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="rounded-2xl p-6 hp-panel relative flex flex-col" data-testid="plan-enterprise">
              <div className="text-xs uppercase tracking-widest text-sky-400/80">Enterprise</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">Custom</span>
              </div>
              <p className="text-sm text-slate-400 mt-2">For 50+ trucks. Built around your operation.</p>
              <ul className="mt-5 space-y-2 flex-1">
                {ENTERPRISE_FEATURES.map((f) => (
                  <li key={f} className="text-sm text-slate-300 flex items-start gap-2">
                    <Check className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <a href="mailto:hello@highwaypilot.io?subject=RoadBoss%20Enterprise%20Inquiry">
                <Button data-testid="subscribe-enterprise" variant="outline" className="mt-6 w-full border-white/15 text-slate-200 hover:bg-white/5">
                  Contact sales <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </a>
            </motion.div>
          </div>
        )}

        {config && !config.configured && (
          <div className="mt-6 max-w-md mx-auto text-center bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-200 text-sm" data-testid="stripe-not-configured-banner">
            Stripe is not configured yet. Self-serve checkout will activate once keys are added.
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-400" /> Cancel anytime</div>
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-400" /> Secure payments by Stripe</div>
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-400" /> 14-day free trial</div>
          <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-sky-400" /> Founder pricing — first 500 customers</div>
        </div>
      </section>
    </div>
  );
}
