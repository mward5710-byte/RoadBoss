import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Route as RouteIcon, Download } from 'lucide-react';

function download(url, filename) {
  const token = localStorage.getItem('hp_token');
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.blob()).then((b) => { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = filename; a.click(); URL.revokeObjectURL(u); });
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { timeAgo } from '@/lib/utils';

const statusStyle = {
  planned: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  active: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export default function Trips() {
  const [rows, setRows] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ driver_id: '', vehicle_id: '', origin: '', destination: '', miles: 0, status: 'planned' });

  const load = async () => {
    const [t, d, v] = await Promise.all([api.get('/trips'), api.get('/drivers'), api.get('/vehicles')]);
    setRows(t.data); setDrivers(d.data); setVehicles(v.data);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.driver_id || !form.origin || !form.destination) { toast.error('Driver, origin, destination required'); return; }
    try { await api.post('/trips', { ...form, miles: Number(form.miles) }); toast.success('Trip created'); setOpen(false); setForm({ driver_id: '', vehicle_id: '', origin: '', destination: '', miles: 0, status: 'planned' }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const driverName = (id) => drivers.find((d) => d.id === id)?.name || id;
  const vehicleName = (id) => vehicles.find((v) => v.id === id)?.name || '';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div><div className="text-xs uppercase tracking-widest text-sky-400/80">Operations</div><h1 className="text-3xl font-bold text-white mt-1">Trips</h1></div>
        <div className="flex gap-2">
        <Button data-testid="export-trips-btn" onClick={() => download(`${process.env.REACT_APP_BACKEND_URL}/api/exports/trips.csv`, 'trips.csv')} variant="outline" className="border-white/15 text-slate-200"><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-trip-btn" className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"><Plus className="w-4 h-4 mr-1" /> New trip</Button></DialogTrigger>
          <DialogContent className="bg-[#0e131a] border-white/10">
            <DialogHeader><DialogTitle className="text-white">New trip</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <select className="w-full bg-[#0a0e14] border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200" value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
                <option value="">Select driver</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select className="w-full bg-[#0a0e14] border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200" value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
                <option value="">Select vehicle (optional)</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <Input placeholder="Origin" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} className="bg-[#0a0e14] border-white/10" />
              <Input placeholder="Destination" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className="bg-[#0a0e14] border-white/10" />
              <Input placeholder="Miles" type="number" value={form.miles} onChange={(e) => setForm({ ...form, miles: e.target.value })} className="bg-[#0a0e14] border-white/10" />
              <select className="w-full bg-[#0a0e14] border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
              </select>
            </div>
            <DialogFooter><Button data-testid="trip-save" onClick={create} className="bg-sky-500 hover:bg-sky-400 text-slate-950">Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="hp-panel rounded-xl overflow-hidden">
        {/* Desktop table — hidden on mobile */}
        <div className="hidden md:block">
          <div className="grid grid-cols-12 px-4 py-3 text-xs uppercase tracking-wider text-slate-500 border-b border-white/5">
            <div className="col-span-3">Route</div><div className="col-span-3">Driver</div><div className="col-span-2">Vehicle</div><div className="col-span-2">Miles</div><div className="col-span-2">Status</div>
          </div>
          <div className="divide-y divide-white/5">
            {rows.map((t) => (
              <div key={t.id} className="grid grid-cols-12 items-center px-4 py-3 hover:bg-white/[0.02]">
                <div className="col-span-3 flex items-center gap-2 min-w-0"><RouteIcon className="w-4 h-4 text-sky-400 shrink-0" /><div className="text-sm text-white truncate">{t.origin} → {t.destination}</div></div>
                <div className="col-span-3 text-sm text-slate-300 truncate">{driverName(t.driver_id)}</div>
                <div className="col-span-2 text-sm text-slate-400 truncate">{vehicleName(t.vehicle_id) || '—'}</div>
                <div className="col-span-2 text-sm text-slate-300 tabular-nums">{(t.miles || 0).toLocaleString()} mi</div>
                <div className="col-span-2"><span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${statusStyle[t.status]}`}>{t.status}</span><div className="text-[10px] text-slate-500 mt-1">{timeAgo(t.created_at)}</div></div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile card layout — stacked, readable, no overlap */}
        <div className="md:hidden divide-y divide-white/5">
          {rows.map((t) => (
            <div key={t.id} className="px-4 py-3 hover:bg-white/[0.02]" data-testid={`trip-card-${t.id}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <RouteIcon className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-white font-medium leading-snug break-words min-w-0">
                    {t.origin} → {t.destination}
                  </div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider whitespace-nowrap shrink-0 ${statusStyle[t.status]}`}>{t.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pl-6">
                <span><span className="text-slate-600 uppercase tracking-wider text-[10px] mr-1">Driver:</span> {driverName(t.driver_id)}</span>
                {vehicleName(t.vehicle_id) && (
                  <span><span className="text-slate-600 uppercase tracking-wider text-[10px] mr-1">Truck:</span> {vehicleName(t.vehicle_id)}</span>
                )}
                <span className="tabular-nums"><span className="text-slate-600 uppercase tracking-wider text-[10px] mr-1">Miles:</span> {(t.miles || 0).toLocaleString()}</span>
                <span className="text-slate-600">{timeAgo(t.created_at)}</span>
              </div>
            </div>
          ))}
        </div>

        {rows.length === 0 && <div className="p-6 text-sm text-slate-500">No trips yet.</div>}
      </div>
    </div>
  );
}
