import React, { useEffect, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { Truck, Wrench } from 'lucide-react';

export default function DriverVehicle() {
  const user = getUser();
  const [vehicle, setVehicle] = useState(null);
  const [maint, setMaint] = useState([]);
  useEffect(() => { (async () => {
    const drivers = (await api.get('/drivers')).data;
    const mine = drivers.find((d) => d.email === user.email) || drivers[0];
    if (mine?.vehicle_id) { setVehicle((await api.get(`/vehicles/${mine.vehicle_id}`)).data); setMaint((await api.get('/maintenance', { params: { vehicle_id: mine.vehicle_id } })).data); }
  })(); }, [user.email]);
  if (!vehicle) return <div className="p-5 text-slate-400">No assigned vehicle.</div>;
  return (
    <div className="p-5 space-y-4">
      <h1 className="text-2xl font-bold text-white">My truck</h1>
      <div className="hp-panel-bordered rounded-2xl p-5 hp-glow">
        <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center"><Truck className="w-6 h-6 text-sky-300" /></div><div><div className="text-2xl font-bold text-white">{vehicle.name}</div><div className="text-sm text-slate-400">{vehicle.year} {vehicle.make} {vehicle.model}</div></div></div>
        <div className="hp-divider my-4" />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-xs text-slate-500">Plate</div><div className="text-white">{vehicle.plate || '—'}</div></div>
          <div><div className="text-xs text-slate-500">Odometer</div><div className="text-white">{(vehicle.odometer || 0).toLocaleString()} mi</div></div>
          <div className="col-span-2"><div className="text-xs text-slate-500">VIN</div><div className="text-white text-xs font-mono break-all">{vehicle.vin || '—'}</div></div>
        </div>
      </div>
      <div className="hp-panel rounded-2xl">
        <div className="p-4 border-b border-white/5 text-sm font-semibold text-white flex items-center gap-2"><Wrench className="w-4 h-4 text-emerald-400" /> Service history</div>
        <div className="divide-y divide-white/5">
          {maint.map((m) => (
            <div key={m.id} className="p-4 flex items-center justify-between">
              <div><div className="text-sm text-white">{m.service_type}</div><div className="text-xs text-slate-500">{m.due_miles ? `Due @ ${m.due_miles.toLocaleString()} mi` : 'Scheduled'}</div></div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${m.completed ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'}`}>{m.completed ? 'Done' : 'Open'}</span>
            </div>
          ))}
          {maint.length === 0 && <div className="p-4 text-sm text-slate-500">No history yet.</div>}
        </div>
      </div>
    </div>
  );
}
