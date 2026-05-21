import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getUser } from '@/lib/api';
import { Users, Truck, AlertTriangle, Wrench, Activity, Gauge, ArrowUpRight, BellRing } from 'lucide-react';
import FleetMap from '@/components/FleetMap';
import { dutyColor, formatMinutes, severityColor, timeAgo } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

function Kpi({ icon: Icon, label, value, sub, accent = 'sky', to }) {
  const accents = {
    sky: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    red: 'text-red-300 bg-red-500/10 border-red-500/30',
    green: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  };
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${accents[accent]}`}><Icon className="w-4 h-4" /></div>
        <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-sky-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
      </div>
      <div className="mt-4 text-3xl font-semibold text-white">{value}</div>
      <div className="text-xs uppercase tracking-wider text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="hp-panel rounded-xl p-4 group block hover:bg-white/[0.04] hover:border-sky-500/30 transition-colors" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {inner}
      </Link>
    );
  }
  return <div className="hp-panel rounded-xl p-4 group">{inner}</div>;
}

export default function Overview() {
  const me = getUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sampleData, setSampleData] = useState(null);
  const [wipingSample, setWipingSample] = useState(false);

  const canManageSampleData = ['fleet_admin', 'super_admin'].includes(me?.role);

  const loadOverview = () => {
    setLoading(true);
    api.get('/overview').then((r) => setData(r.data)).finally(() => setLoading(false));
  };

  const loadSampleStatus = () => {
    if (!canManageSampleData) return;
    api.get('/admin/sample-data-status')
      .then((r) => setSampleData(r.data))
      .catch(() => setSampleData(null));
  };

  useEffect(() => {
    loadOverview();
    loadSampleStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wipeSampleData = async () => {
    if (wipingSample) return;
    if (!window.confirm('Wipe Fleet sample data and any leftover legacy demo rows? Real customer data will be kept.')) return;
    setWipingSample(true);
    try {
      await api.post('/admin/wipe-sample-data');
      loadOverview();
      loadSampleStatus();
    } finally {
      setWipingSample(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading command center...</div>;
  if (!data) return <div className="p-8 text-red-400">Failed to load.</div>;

  const { kpis, drivers, recent_alerts, maintenance_due_list } = data;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {canManageSampleData && sampleData?.has_sample_data && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-amber-300">Fleet sample data active</div>
            <div className="text-sm text-slate-200 mt-1">
              Drivers, vehicles, trips, and other sample records are still loaded. WreckerLogix stays clean by default.
            </div>
          </div>
          <button
            type="button"
            onClick={wipeSampleData}
            disabled={wipingSample}
            className="px-3.5 py-2 rounded-lg bg-amber-400 text-slate-950 text-sm font-semibold hover:bg-amber-300 disabled:opacity-60"
            data-testid="overview-wipe-sample-data"
          >
            {wipingSample ? 'Wiping…' : 'Wipe sample data'}
          </button>
        </div>
      )}

      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-sky-400/80">Fleet Command Center</div>
          <h1 className="text-3xl font-bold text-white mt-1">Overview</h1>
        </div>
        <div className="text-xs px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300">
          {sampleData?.has_sample_data ? 'Live · fleet sample data active' : 'Live · real data'}
        </div>
      </header>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Active drivers" value={`${kpis.drivers_active}/${kpis.drivers_total}`} sub="on shift now" accent="sky" to="/app/drivers" />
        <Kpi icon={Activity} label="HOS at risk" value={kpis.hos_at_risk} sub="<90 min remaining" accent="amber" to="/app/drivers" />
        <Kpi icon={AlertTriangle} label="Critical alerts" value={kpis.critical_alerts} sub="last 24 hours" accent="red" to="/app/alerts" />
        <Kpi icon={Wrench} label="Maintenance due" value={kpis.maintenance_due} sub="open work orders" accent="green" to="/app/maintenance" />
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="hp-panel rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div>
                <div className="text-sm font-semibold text-white">Live driver map</div>
                <div className="text-xs text-slate-500">
                  {sampleData?.has_sample_data ? 'Last positions · fleet sample data' : 'Last positions · live fleet data'}
                </div>
              </div>
              <Link to="/app/drivers" className="text-xs text-sky-400 hover:text-sky-300">View all →</Link>
            </div>
            <FleetMap drivers={drivers} height={400} />
          </div>

          <div className="hp-panel rounded-xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="text-sm font-semibold text-white flex items-center gap-2"><Gauge className="w-4 h-4 text-sky-400" /> Driver HOS</div>
              <div className="text-xs text-slate-500">Hours of Service remaining</div>
            </div>
            <div className="divide-y divide-white/5">
              {drivers.map((d) => {
                const dc = dutyColor[d.status] || dutyColor.off_duty;
                const pct = Math.min(100, Math.max(0, ((d.hos_remaining_minutes || 0) / 660) * 100));
                const barColor = pct < 15 ? 'bg-red-500' : pct < 35 ? 'bg-amber-500' : 'bg-sky-500';
                return (
                  <Link to={`/app/drivers/${d.id}`} key={d.id} className="flex items-center gap-4 p-4 hover:bg-white/[0.02] transition">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-slate-950" style={{ background: d.avatar_color || '#38bdf8' }}>
                      {d.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-white truncate">{d.name}</div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${dc.bg} ${dc.text} uppercase tracking-wider`}>{dc.label}</span>
                      </div>
                      <div className="text-xs text-slate-500">{d.home_terminal || '—'}</div>
                    </div>
                    <div className="w-48">
                      <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">{formatMinutes(d.hos_remaining_minutes)}</span><span className="text-slate-500">11h cap</span></div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden"><div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} /></div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="hp-panel rounded-xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="text-sm font-semibold text-white flex items-center gap-2"><BellRing className="w-4 h-4 text-amber-400" /> Recent alerts</div>
              <Link to="/app/alerts" className="text-xs text-sky-400">All →</Link>
            </div>
            <div className="divide-y divide-white/5">
              {recent_alerts.length === 0 && <div className="p-4 text-sm text-slate-500">No recent alerts.</div>}
              {recent_alerts.map((a) => {
                const sc = severityColor[a.severity] || severityColor.info;
                return (
                  <div key={a.id} className="p-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${sc.bg} ${sc.text} uppercase tracking-wider border ${sc.border}`}>{a.severity}</span>
                      <span className="text-[10px] text-slate-500">{timeAgo(a.created_at)}</span>
                    </div>
                    <div className="text-sm text-slate-200 mt-1.5">{a.message}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="hp-panel rounded-xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="text-sm font-semibold text-white flex items-center gap-2"><Wrench className="w-4 h-4 text-emerald-400" /> Maintenance due</div>
              <Link to="/app/maintenance" className="text-xs text-sky-400">All →</Link>
            </div>
            <div className="divide-y divide-white/5">
              {maintenance_due_list.length === 0 && <div className="p-4 text-sm text-slate-500">All caught up.</div>}
              {maintenance_due_list.slice(0, 5).map((m) => (
                <div key={m.id} className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center"><Truck className="w-4 h-4 text-emerald-300" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">{m.service_type}</div>
                    <div className="text-xs text-slate-500">{m.due_miles ? `Due @ ${m.due_miles.toLocaleString()} mi` : 'Schedule'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
