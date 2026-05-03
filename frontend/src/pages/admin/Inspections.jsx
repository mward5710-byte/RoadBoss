import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { ClipboardCheck, AlertTriangle, ShieldCheck, Truck, Clock, Filter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const typeMeta = {
  pre_trip: { label: 'Pre-Trip', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  post_trip: { label: 'Post-Trip', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
};

const statusMeta = {
  in_progress: { label: 'In Progress', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  certified: { label: 'Certified', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

function fmt(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function Inspections() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/inspections', { params: { limit: 200 } })
      .then((r) => setRows(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return (rows || []).filter((r) => {
      if (typeFilter !== 'all' && r.inspection_type !== typeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (![r.driver_name, r.vehicle_name, r.signature].some((v) => (v || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [rows, typeFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const certified = rows.filter((r) => r.status === 'certified').length;
    const defects = rows.reduce((acc, r) => acc + (r.defect_count || 0), 0);
    return { total, certified, defects };
  }, [rows]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-5" data-testid="admin-inspections">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-sky-400/80">Compliance</div>
          <h1 className="text-3xl font-bold text-white mt-1">DVIR Inspections</h1>
          <div className="text-xs text-slate-500 mt-1">FMCSA 49 CFR § 396.11 / 396.13 — Driver vehicle inspection reports</div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="hp-panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-slate-400">Total inspections</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.total}</div>
          <div className="text-xs text-slate-500 mt-0.5">All time</div>
        </div>
        <div className="hp-panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-emerald-400/80 flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Certified</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.certified}</div>
          <div className="text-xs text-slate-500 mt-0.5">Signed off</div>
        </div>
        <div className="hp-panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-red-400/80 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Defects logged</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.defects}</div>
          <div className="text-xs text-slate-500 mt-0.5">Across all reports</div>
        </div>
      </div>

      {/* Filters */}
      <div className="hp-panel rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search driver, truck, signature..."
            className="bg-transparent border-white/10 text-slate-100"
            data-testid="inspection-search"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
            data-testid="filter-type"
          >
            <option value="all">All types</option>
            <option value="pre_trip">Pre-Trip</option>
            <option value="post_trip">Post-Trip</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
            data-testid="filter-status"
          >
            <option value="all">All statuses</option>
            <option value="in_progress">In Progress</option>
            <option value="certified">Certified</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="hp-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500" data-testid="inspections-loading">Loading inspections...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center" data-testid="inspections-empty">
            <ClipboardCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <div className="text-base text-white font-semibold">No inspections yet</div>
            <div className="text-sm text-slate-500 mt-1">DVIRs will appear here as drivers complete pre-trip and post-trip inspections.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Driver</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Defects</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Certified</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => {
                  const tm = typeMeta[r.inspection_type] || { label: r.inspection_type, cls: '' };
                  const sm = statusMeta[r.status] || { label: r.status, cls: '' };
                  const defects = r.defect_count || (r.items || []).filter((i) => i.status === 'defect').length;
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.02]" data-testid={`inspection-row-${r.id}`}>
                      <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${tm.cls}`}>{tm.label}</span></td>
                      <td className="px-4 py-3 text-slate-200">{r.driver_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-300"><span className="inline-flex items-center gap-1.5"><Truck className="w-3 h-3 text-slate-500" /> {r.vehicle_name || '—'}</span></td>
                      <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${sm.cls}`}>{sm.label}</span></td>
                      <td className="px-4 py-3">
                        {defects > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-300 font-semibold"><AlertTriangle className="w-3.5 h-3.5" /> {defects}</span>
                        ) : (
                          <span className="text-emerald-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs"><Clock className="w-3 h-3 inline mr-1 text-slate-600" />{fmt(r.created_at)}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{r.status === 'certified' ? fmt(r.certified_at) : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/app/inspections/${r.id}`} className="text-sky-400 hover:text-sky-300 text-xs" data-testid={`view-inspection-${r.id}`}>View →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
