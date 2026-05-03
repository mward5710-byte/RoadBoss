import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function Vehicles() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', make: '', model: '', year: 2024, plate: '', vin: '', odometer: 0, status: 'active' });

  const load = () => api.get('/vehicles').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    try { await api.post('/vehicles', { ...form, year: Number(form.year), odometer: Number(form.odometer) }); toast.success('Vehicle added'); setOpen(false); setForm({ name: '', make: '', model: '', year: 2024, plate: '', vin: '', odometer: 0, status: 'active' }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div><div className="text-xs uppercase tracking-widest text-sky-400/80">Fleet</div><h1 className="text-3xl font-bold text-white mt-1">Vehicles</h1></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-vehicle-btn" className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"><Plus className="w-4 h-4 mr-1" /> Add vehicle</Button></DialogTrigger>
          <DialogContent className="bg-[#0e131a] border-white/10">
            <DialogHeader><DialogTitle className="text-white">New vehicle</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input data-testid="vehicle-name" placeholder="Truck name / number" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-[#0a0e14] border-white/10" />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="bg-[#0a0e14] border-white/10" />
                <Input placeholder="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="bg-[#0a0e14] border-white/10" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input placeholder="Year" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="bg-[#0a0e14] border-white/10" />
                <Input placeholder="Plate" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} className="bg-[#0a0e14] border-white/10" />
                <Input placeholder="Odometer" type="number" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} className="bg-[#0a0e14] border-white/10" />
              </div>
              <Input placeholder="VIN" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} className="bg-[#0a0e14] border-white/10" />
            </div>
            <DialogFooter><Button data-testid="vehicle-save" onClick={create} className="bg-sky-500 hover:bg-sky-400 text-slate-950">Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((v) => (
          <div key={v.id} className="hp-panel rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center"><Truck className="w-5 h-5 text-sky-300" /></div>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">{v.status}</span>
            </div>
            <div className="mt-4 text-lg font-semibold text-white">{v.name}</div>
            <div className="text-sm text-slate-400">{v.year} {v.make} {v.model}</div>
            <div className="hp-divider my-3" />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><div className="text-slate-500">Plate</div><div className="text-white">{v.plate || '—'}</div></div>
              <div><div className="text-slate-500">Odometer</div><div className="text-white">{(v.odometer || 0).toLocaleString()} mi</div></div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="col-span-full hp-panel rounded-xl p-10 text-center text-slate-500">No vehicles yet.</div>}
      </div>
    </div>
  );
}
