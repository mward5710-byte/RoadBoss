import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Wrench, CheckCircle2 } from 'lucide-react';

export default function Maintenance() {
  const [rows, setRows] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  useEffect(() => { (async () => {
    const [m, v] = await Promise.all([api.get('/maintenance'), api.get('/vehicles')]);
    setRows(m.data); setVehicles(v.data);
  })(); }, []);
  const vName = (id) => vehicles.find((v) => v.id === id)?.name || '—';
  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div><div className="text-xs uppercase tracking-widest text-sky-400/80">Service</div><h1 className="text-3xl font-bold text-white mt-1">Maintenance</h1></div>
      <div className="hp-panel rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 text-xs uppercase tracking-wider text-slate-500 border-b border-white/5">
          <div className="col-span-4">Service</div><div className="col-span-3">Vehicle</div><div className="col-span-2">Due</div><div className="col-span-2">Cost</div><div className="col-span-1">Status</div>
        </div>
        <div className="divide-y divide-white/5">
          {rows.map((m) => (
            <div key={m.id} className="grid grid-cols-12 items-center px-4 py-3">
              <div className="col-span-4 flex items-center gap-2"><Wrench className="w-4 h-4 text-emerald-400" /><span className="text-sm text-white">{m.service_type}</span></div>
              <div className="col-span-3 text-sm text-slate-300">{vName(m.vehicle_id)}</div>
              <div className="col-span-2 text-sm text-slate-400">{m.due_miles ? `${m.due_miles.toLocaleString()} mi` : 'Scheduled'}</div>
              <div className="col-span-2 text-sm text-slate-300">${(m.cost || 0).toLocaleString()}</div>
              <div className="col-span-1">{m.completed ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-wider">Open</span>}</div>
            </div>
          ))}
          {rows.length === 0 && <div className="p-6 text-sm text-slate-500">No maintenance records.</div>}
        </div>
      </div>
    </div>
  );
}
