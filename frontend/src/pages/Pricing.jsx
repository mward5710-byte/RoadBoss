import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { api, getUser } from '@/lib/api';
import { toast } from 'sonner';

export default function Pricing() {
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState('');
  const user = getUser();

  useEffect(() => { api.get('/stripe/config').then((r) => setConfig(r.data)).catch(() => setConfig({ configured: false, plans: [] })); }, []);

  const subscribe = async (planKey) => {
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
      const r = await api.post('/stripe/checkout', { plan_key: planKey });
      window.location.href = r.data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not start checkout');
    } finally { setBusy(''); }
  };

  return (
    <div className="min-h-screen text-slate-200 hp-grid-bg">
      <header className="sticky top-0 z-40 backdrop-blur bg-[#07090d]/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 flex items-center justify-between py-3.5">
          <Link to="/"><Logo /></Link>
          <div className="flex items-center gap-2">
            {user ? <Link to={user.role === 'driver' ? '/driver' : '/app'}><Button size="sm" variant="ghost" className="text-slate-300">Dashboard</Button></Link> : <Link to="/login"><Button size="sm" variant="ghost" className="text-slate-300">Sign in</Button></Link>}
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 pt-20 pb-10 text-center">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs uppercase tracking-widest mb-6"><Sparkles className="w-3.5 h-3.5" /> 14-day free trial · No card charged today</div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight"><span className="hp-chrome-text">Fair pricing.</span> <span className="text-white">Built for the road.</span></h1>
          <p className="mt-4 text-slate-400 max-w-2xl mx-auto">No setup fees. Cancel anytime from your billing portal. Founder pricing locked for our first 500 customers.</p>
        </motion.div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-16">
        {!config && <div className="text-center text-slate-500 py-12">Loading plans...</div>}
        {config && !config.configured && <div className="max-w-md mx-auto text-center bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-amber-200">Stripe is not configured yet. Check back soon.</div>}
        {config && config.configured && (
          <div className="grid md:grid-cols-3 gap-4">
            {config.plans.map((p, i) => {
              const featured = p.key === 'small_fleet';
              return (
                <motion.div key={p.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className={`rounded-2xl p-6 ${featured ? 'hp-panel-bordered hp-glow' : 'hp-panel'} relative`}>
                  {featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-sky-500 text-slate-950 font-semibold">Most popular</div>}
                  <div className="text-xs uppercase tracking-widest text-sky-400/80">{p.name}</div>
                  <div className="mt-2 flex items-baseline gap-1"><span className="text-4xl font-bold text-white">${p.price_dollars}</span><span className="text-sm text-slate-500">/mo</span></div>
                  <p className="text-sm text-slate-400 mt-2">{p.description}</p>
                  <ul className="mt-5 space-y-2">
                    {p.features.map((f) => (<li key={f} className="text-sm text-slate-300 flex items-start gap-2"><Check className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" /> {f}</li>))}
                  </ul>
                  <Button data-testid={`subscribe-${p.key}`} onClick={() => subscribe(p.key)} disabled={busy === p.key} className="mt-6 w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">
                    {busy === p.key ? 'Loading...' : <>Start 14-day trial <ArrowRight className="w-4 h-4 ml-1" /></>}
                  </Button>
                </motion.div>
              );
            })}
            <div className="md:col-span-3 rounded-2xl p-6 hp-panel flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-sky-400/80">Large Fleet (50+)</div>
                <div className="text-lg text-white font-semibold mt-1">Custom pricing, white-label, dedicated success manager.</div>
              </div>
              <a href="mailto:hello@highwaypilot.io"><Button variant="outline" className="border-white/15 text-slate-200">Contact sales</Button></a>
            </div>
          </div>
        )}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-400" /> Cancel anytime</div>
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-400" /> Secure payments by Stripe</div>
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-400" /> 14-day free trial</div>
        </div>
      </section>
    </div>
  );
}
