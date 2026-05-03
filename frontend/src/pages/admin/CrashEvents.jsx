import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { AlertTriangle, MapPin, Clock, Truck, Search, Filter, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const SEV_META = {
  low:      { cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  medium:   { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  high:     { cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  critical: { cls: 'bg-red-500/15 text-red-300 border-red-500/30 animate-pulse' },
};

function fmt(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso || '—'; } }

export default function CrashEvents() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const refresh = () => {
    setLoading(true);
    api.get('/crash-events', { params: { limit: 200 } }).then((r) => setRows(r.data || [])).finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); /* poll for new criticals */ const t = setInterval(refresh, 12000); return () => clearInterval(t); }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![r.driver_name, r.notes, r.severity].some((v) => (v || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }), [rows, statusFilter, search]);

  const stats = useMemo(() => ({
    unack: rows.filter((r) => r.status === 'unacknowledged' && r.confirmed).length,
    confirmed: rows.filter((r) => r.confirmed).length,
    falseAlarms: rows.filter((r) => !r.confirmed).length,
  }), [rows]);

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/crash-events/${id}/status`, { status });
      toast.success(`Marked ${status}`);
      refresh();
    } catch (e) { toast.error('Could not update'); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-5" data-testid="admin-crash-events">
      <div>
        <div className="text-xs uppercase tracking-widest text-red-400/80">Critical Safety</div>
        <h1 className="text-3xl font-bold text-white mt-1">Crash Events</h1>
        <div className="text-xs text-slate-500 mt-1">Auto-detected impacts and SOS alerts. Polls every 12 seconds.</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="hp-panel-bordered rounded-2xl p-5 hp-glow">
          <div className="text-xs uppercase tracking-widest text-red-400/80 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Unacknowledged</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.unack}</div>
          <div className="text-xs text-slate-500 mt-0.5">Need response</div>
        </div>
        <div className="hp-panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-orange-400/80">Confirmed crashes</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.confirmed}</div>
        </div>
        <div className="hp-panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-emerald-400/80 flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> False alarms</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.falseAlarms}</div>
        </div>
      </div>

      <div className="hp-panel rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search driver, severity..." className="bg-transparent border-white/10 text-slate-100" data-testid="crash-search" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200" data-testid="crash-status-filter">
            <option value="all">All statuses</option>
            <option value="unacknowledged">Unacknowledged</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      </div>

      <div className="hp-panel rounded-2xl overflow-hidden">
        {loading ? <div className="p-8 text-center text-slate-500">Loading...</div>
        : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheck className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
            <div className="text-base text-white font-semibold">No crash events</div>
            <div className="text-sm text-slate-500 mt-1">All drivers safe. Crash detection runs continuously while drivers are on duty.</div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((r) => {
              const sm = SEV_META[r.severity] || SEV_META.low;
              return (
                <div key={r.id} className="p-4" data-testid={`crash-row-${r.id}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{r.driver_name || 'Unknown driver'}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${sm.cls}`}>{r.severity}</span>
                        {r.confirmed ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 uppercase tracking-wider">Confirmed</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 uppercase tracking-wider">False alarm</span>}
                        <span className="text-[11px] text-slate-500 ml-auto">{fmt(r.created_at)}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400 flex flex-wrap gap-x-3">
                        {r.g_force && <span><Truck className="w-3 h-3 inline mr-1" />{r.g_force.toFixed(1)}g</span>}
                        {r.speed_mph && <span><Clock className="w-3 h-3 inline mr-1" />{r.speed_mph} mph</span>}
                        {r.latitude && r.longitude && <a href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300"><MapPin className="w-3 h-3 inline mr-1" />{r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}</a>}
                      </div>
                      {r.notes && <div className="mt-1 text-xs text-slate-300">"{r.notes}"</div>}
                      {r.status === 'unacknowledged' && r.confirmed && (
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" onClick={() => updateStatus(r.id, 'acknowledged')} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold" data-testid={`ack-${r.id}`}>Acknowledge</Button>
                          <Button size="sm" onClick={() => updateStatus(r.id, 'resolved')} variant="outline" className="border-emerald-500/40 text-emerald-300" data-testid={`resolve-${r.id}`}>Mark Resolved</Button>
                          <Button size="sm" onClick={() => updateStatus(r.id, 'dismissed')} variant="outline" className="border-white/10 text-slate-400" data-testid={`dismiss-${r.id}`}>Dismiss</Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
