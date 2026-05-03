import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { CheckCircle2, CreditCard, ArrowUpRight, Sparkles, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const statusBadge = {
  active: { label: 'Active', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  trialing: { label: 'Trial', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  past_due: { label: 'Past due', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  canceled: { label: 'Canceled', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  incomplete: { label: 'Incomplete', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  none: { label: 'No subscription', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

function fmtDate(unix) {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleDateString();
}

export default function Billing() {
  const [params] = useSearchParams();
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (params.get('status') === 'success') toast.success('Subscription started! Welcome aboard.');
    api.get('/stripe/subscription').then((r) => setSub(r.data)).finally(() => setLoading(false));
  }, [params]);

  const portal = async () => {
    setOpening(true);
    try {
      const r = await api.post('/stripe/portal', {});
      window.location.href = r.data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not open billing portal');
    } finally { setOpening(false); }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading billing...</div>;
  const s = sub?.subscription;
  const badge = statusBadge[sub?.status] || statusBadge.none;

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-sky-400/80">Account</div>
        <h1 className="text-3xl font-bold text-white mt-1">Billing</h1>
      </div>

      {!s ? (
        <div className="hp-panel rounded-2xl p-8 text-center">
          <Sparkles className="w-10 h-10 text-sky-400 mx-auto mb-3" />
          <div className="text-xl text-white font-semibold">No active subscription</div>
          <div className="text-sm text-slate-400 mt-1">Pick a plan and start your 14-day free trial.</div>
          <Link to="/pricing"><Button data-testid="go-pricing-btn" className="mt-5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">View pricing</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="hp-panel-bordered rounded-2xl p-6 hp-glow">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-sky-400/80">Current plan</div>
                <div className="text-2xl font-bold text-white mt-1">{s.plan_name}</div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full border uppercase tracking-wider ${badge.cls}`}>{badge.label}</span>
            </div>
            <div className="hp-divider my-4" />
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div><div className="text-xs text-slate-500">Renews / ends</div><div className="text-white">{fmtDate(s.current_period_end)}</div></div>
              <div><div className="text-xs text-slate-500">Trial ends</div><div className="text-white">{fmtDate(s.trial_end)}</div></div>
              <div><div className="text-xs text-slate-500">Auto-renew</div><div className="text-white">{s.cancel_at_period_end ? 'Cancels at period end' : 'Yes'}</div></div>
            </div>
          </div>

          <div className="hp-panel rounded-2xl p-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-sm font-semibold text-white flex items-center gap-2"><CreditCard className="w-4 h-4 text-sky-400" /> Manage billing</div>
                <div className="text-xs text-slate-500 mt-1">Update payment method, view invoices, cancel.</div>
              </div>
              <Button data-testid="open-portal-btn" onClick={portal} disabled={opening} className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">
                {opening ? 'Opening...' : <>Open Stripe portal <ExternalLink className="w-4 h-4 ml-1" /></>}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="hp-panel rounded-2xl p-6">
        <div className="text-sm font-semibold text-white mb-2">Want to switch plans?</div>
        <Link to="/pricing" className="text-sm text-sky-400 hover:text-sky-300 inline-flex items-center gap-1">View all pricing <ArrowUpRight className="w-3 h-3" /></Link>
      </div>
    </div>
  );
}
