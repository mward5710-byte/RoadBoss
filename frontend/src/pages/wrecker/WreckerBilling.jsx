import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { CreditCard, DollarSign, TrendingUp, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { setCopilotScreenContext, clearCopilotScreenContext } from '@/lib/copilotContext';

export default function WreckerBilling() {
  const [overview, setOverview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/wrecker/overview'),
      api.get('/wrecker/jobs'),
    ]).then(([ov, jb]) => {
      setOverview(ov.data);
      setJobs(jb.data);
    }).catch(() => toast.error('Failed to load billing'))
      .finally(() => setLoading(false));
  }, []);

  const completed = useMemo(() => jobs.filter((j) => j.status === 'completed'), [jobs]);
  const totalRevenue = useMemo(
    () => completed.reduce((sum, j) => sum + (j.final_price ?? j.quoted_price ?? 0), 0),
    [completed]
  );
  const outstanding = useMemo(
    () => jobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled')
      .reduce((sum, j) => sum + (j.quoted_price ?? 0), 0),
    [jobs]
  );
  const byClub = useMemo(() => {
    const map = {};
    completed.forEach((j) => {
      const k = j.motor_club_name || 'Direct';
      map[k] = (map[k] || 0) + (j.final_price ?? j.quoted_price ?? 0);
    });
    return map;
  }, [completed]);

  useEffect(() => {
    setCopilotScreenContext({
      screen_key: 'wrecker_billing',
      screen_state: {
        completed_jobs: completed.length,
        total_revenue: totalRevenue,
        outstanding,
        today_revenue: overview?.today_revenue || 0,
      },
      draft_values: {},
    });
    return () => clearCopilotScreenContext('wrecker_billing');
  }, [completed.length, totalRevenue, outstanding, overview?.today_revenue]);

  if (loading) return <div className="p-8 text-slate-400">Loading billing...</div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-amber-400/80">Wrecker Mode</div>
        <h1 className="text-3xl font-bold text-white mt-1">Billing & Revenue</h1>
        <p className="text-sm text-slate-400 mt-1">Track money in, money owed, and revenue per motor club. Subscription billing managed via RoadBoss.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 bg-[#0a0e14] border-white/5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400"><DollarSign className="w-3 h-3" /> Total Revenue</div>
          <div className="text-3xl font-bold text-emerald-300 mt-2">${totalRevenue.toFixed(0)}</div>
          <div className="text-xs text-slate-500 mt-1">{completed.length} completed jobs</div>
        </Card>
        <Card className="p-4 bg-[#0a0e14] border-white/5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400"><TrendingUp className="w-3 h-3" /> Today</div>
          <div className="text-3xl font-bold text-white mt-2">${(overview?.today_revenue || 0).toFixed(0)}</div>
          <div className="text-xs text-slate-500 mt-1">{overview?.today_completed || 0} jobs today</div>
        </Card>
        <Card className="p-4 bg-[#0a0e14] border-white/5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400"><Calendar className="w-3 h-3" /> Outstanding</div>
          <div className="text-3xl font-bold text-amber-300 mt-2">${outstanding.toFixed(0)}</div>
          <div className="text-xs text-slate-500 mt-1">in flight</div>
        </Card>
        <Card className="p-4 bg-[#0a0e14] border-white/5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400"><CreditCard className="w-3 h-3" /> RoadBoss Plan</div>
          <div className="text-3xl font-bold text-sky-300 mt-2">Pro</div>
          <Link to="/app/billing"><Button size="sm" variant="outline" className="mt-2 border-white/10 w-full">Manage</Button></Link>
        </Card>
      </div>

      <Card className="p-5 bg-[#0a0e14] border-white/5">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Revenue by Source</div>
        <div className="space-y-2">
          {Object.entries(byClub).sort((a, b) => b[1] - a[1]).map(([name, val]) => {
            const pct = totalRevenue ? (val / totalRevenue) * 100 : 0;
            return (
              <div key={name} className="flex items-center gap-3">
                <div className="w-32 text-sm text-slate-300 truncate">{name}</div>
                <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-20 text-right text-sm text-white">${val.toFixed(0)}</div>
              </div>
            );
          })}
          {Object.keys(byClub).length === 0 && <div className="text-sm text-slate-500">No completed jobs yet.</div>}
        </div>
      </Card>

      <Card className="p-5 bg-[#0a0e14] border-white/5">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Recent Completed Jobs</div>
        <div className="divide-y divide-white/5">
          {completed.slice(0, 10).map((j) => (
            <Link to={`/wrecker/jobs/${j.id}`} key={j.id} className="flex items-center justify-between py-3 hover:bg-white/[0.02] -mx-2 px-2 rounded">
              <div>
                <div className="text-sm text-white">{j.customer?.name}</div>
                <div className="text-xs text-slate-500">{(j.service_type || '').replace(/_/g, ' ')} · {j.motor_club_name || 'Direct'}</div>
              </div>
              <div className="text-emerald-300 font-semibold">${(j.final_price ?? j.quoted_price ?? 0).toFixed(2)}</div>
            </Link>
          ))}
          {completed.length === 0 && <div className="text-sm text-slate-500 py-3">No completed jobs yet. Get rolling!</div>}
        </div>
      </Card>
    </div>
  );
}
