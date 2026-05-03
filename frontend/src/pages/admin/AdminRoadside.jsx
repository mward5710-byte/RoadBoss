import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Wrench, Clock, AlertCircle, MapPin, Filter, Search, Truck, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

const STATUS_META = {
  requested: { label: 'Requested', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  confirmed: { label: 'Confirmed', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  en_route:  { label: 'En route',  cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  arrived:   { label: 'Arrived',   cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  completed: { label: 'Completed', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

function fmt(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso || '—'; } }

export default function AdminRoadside() {
  const [rows, setRows] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/roadside/dispatch', { params: { limit: 200 } }),
      api.get('/roadside/providers'),
    ]).then(([d, p]) => {
      setRows(d.data || []);
      setProviders(p.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![r.driver_name, r.provider_name, r.service_type, r.description].some((v) => (v || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }), [rows, statusFilter, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    open: rows.filter((r) => !['completed', 'cancelled'].includes(r.status)).length,
    completed: rows.filter((r) => r.status === 'completed').length,
  }), [rows]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-5" data-testid="admin-roadside">
      <div>
        <div className="text-xs uppercase tracking-widest text-sky-400/80">Driver Support</div>
        <h1 className="text-3xl font-bold text-white mt-1">Roadside Assistance</h1>
        <div className="text-xs text-slate-500 mt-1">Live dispatches and the vetted provider network.</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="hp-panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-slate-400">Total dispatches</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.total}</div>
        </div>
        <div className="hp-panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-amber-400/80 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> Open</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.open}</div>
        </div>
        <div className="hp-panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-emerald-400/80 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Completed</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.completed}</div>
        </div>
      </div>

      <div className="hp-panel rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search driver, provider, service..." className="bg-transparent border-white/10 text-slate-100" data-testid="roadside-search" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200" data-testid="roadside-status-filter">
            <option value="all">All statuses</option>
            {Object.keys(STATUS_META).map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
          </select>
        </div>
      </div>

      <div className="hp-panel rounded-2xl overflow-hidden">
        {loading ? <div className="p-8 text-center text-slate-500">Loading dispatches...</div>
        : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <div className="text-base text-white font-semibold">No dispatches yet</div>
            <div className="text-sm text-slate-500 mt-1">When drivers request roadside help, they'll appear here.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                <th className="px-4 py-3">Service</th><th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Provider</th><th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">ETA</th><th className="px-4 py-3">Requested</th>
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => {
                  const sm = STATUS_META[r.status] || { label: r.status, cls: '' };
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.02]" data-testid={`disp-row-${r.id}`}>
                      <td className="px-4 py-3 capitalize text-slate-200">{r.service_type}</td>
                      <td className="px-4 py-3 text-slate-200">{r.driver_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{r.provider_name || <span className="text-amber-400">Pending</span>}</td>
                      <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${sm.cls}`}>{sm.label}</span></td>
                      <td className="px-4 py-3 text-slate-300">{r.eta_minutes ? `${r.eta_minutes}m` : '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{fmt(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="hp-panel rounded-2xl p-5">
        <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">Provider Network ({providers.length})</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {providers.map((p) => (
            <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">{p.logo_url ? <img src={p.logo_url} alt="" className="w-5 h-5 opacity-80" /> : <Truck className="w-4 h-4 text-slate-400" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-500"><MapPin className="w-2.5 h-2.5 inline mr-1" />{p.region} · <Clock className="w-2.5 h-2.5 inline mx-1" />{p.eta_avg_minutes}min</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(p.services || []).map((s) => <span key={s} className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 capitalize">{s}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
