import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { dutyColor, formatMinutes } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function Drivers() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', license_state: '', license_number: '', home_terminal: '', status: 'off_duty' });

  const load = () => api.get('/drivers').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    try { await api.post('/drivers', form); toast.success('Driver added'); setOpen(false); setForm({ name: '', email: '', phone: '', license_state: '', license_number: '', home_terminal: '', status: 'off_duty' }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const filtered = rows.filter((r) => (r.name + (r.home_terminal || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-sky-400/80">Roster</div>
          <h1 className="text-3xl font-bold text-white mt-1">Drivers</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-driver-btn" className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"><Plus className="w-4 h-4 mr-1" /> Add driver</Button></DialogTrigger>
          <DialogContent className="bg-[#0e131a] border-white/10">
            <DialogHeader><DialogTitle className="text-white">New driver</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input data-testid="driver-name" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-[#0a0e14] border-white/10" />
              <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-[#0a0e14] border-white/10" />
              <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-[#0a0e14] border-white/10" />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="License state" value={form.license_state} onChange={(e) => setForm({ ...form, license_state: e.target.value })} className="bg-[#0a0e14] border-white/10" />
                <Input placeholder="License number" value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} className="bg-[#0a0e14] border-white/10" />
              </div>
              <Input placeholder="Home terminal" value={form.home_terminal} onChange={(e) => setForm({ ...form, home_terminal: e.target.value })} className="bg-[#0a0e14] border-white/10" />
            </div>
            <DialogFooter><Button data-testid="driver-save" onClick={create} className="bg-sky-500 hover:bg-sky-400 text-slate-950">Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input placeholder="Search drivers..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-[#0a0e14] border-white/10 pl-9" />
        </div>
      </div>

      <div className="hp-panel rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 text-xs uppercase tracking-wider text-slate-500 border-b border-white/5">
          <div className="col-span-4">Driver</div><div className="col-span-2">Status</div><div className="col-span-3">HOS remaining</div><div className="col-span-3">Home terminal</div>
        </div>
        <div className="divide-y divide-white/5">
          {filtered.map((d) => {
            const dc = dutyColor[d.status] || dutyColor.off_duty;
            return (
              <Link key={d.id} to={`/app/drivers/${d.id}`} className="grid grid-cols-12 items-center px-4 py-3 hover:bg-white/[0.02]">
                <div className="col-span-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-slate-950" style={{ background: d.avatar_color || '#38bdf8' }}>{d.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}</div>
                  <div><div className="text-sm text-white">{d.name}</div><div className="text-xs text-slate-500">{d.email || '—'}</div></div>
                </div>
                <div className="col-span-2"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${dc.bg} ${dc.text} uppercase tracking-wider`}>{dc.label}</span></div>
                <div className="col-span-3 text-sm text-slate-300">{formatMinutes(d.hos_remaining_minutes)}</div>
                <div className="col-span-3 text-sm text-slate-400">{d.home_terminal || '—'}</div>
              </Link>
            );
          })}
          {filtered.length === 0 && <div className="p-6 text-sm text-slate-500">No drivers yet.</div>}
        </div>
      </div>
    </div>
  );
}
