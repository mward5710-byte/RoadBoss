import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { dutyColor, formatMinutes, timeAgo } from '@/lib/utils';
import { ArrowLeft, Truck, Route, Activity, Clock } from 'lucide-react';

export default function DriverDetail() {
  const { id } = useParams();
  const [driver, setDriver] = useState(null);
  const [trips, setTrips] = useState([]);
  const [hos, setHos] = useState([]);
  const [vehicle, setVehicle] = useState(null);

  useEffect(() => {
    (async () => {
      const d = (await api.get(`/drivers/${id}`)).data;
      setDriver(d);
      if (d.vehicle_id) { try { setVehicle((await api.get(`/vehicles/${d.vehicle_id}`)).data); } catch {} }
      setTrips((await api.get('/trips', { params: { driver_id: id } })).data);
      setHos((await api.get('/hos', { params: { driver_id: id } })).data);
    })();
  }, [id]);

  if (!driver) return <div className="p-8 text-slate-400">Loading...</div>;
  const dc = dutyColor[driver.status] || dutyColor.off_duty;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <Link to="/app/drivers" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> All drivers</Link>
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-slate-950" style={{ background: driver.avatar_color || '#38bdf8' }}>{driver.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}</div>
        <div>
          <h1 className="text-3xl font-bold text-white">{driver.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${dc.bg} ${dc.text} uppercase tracking-wider`}>{dc.label}</span>
            <span className="text-sm text-slate-400">{driver.home_terminal || ''}</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-3">
        <div className="hp-panel rounded-xl p-4"><div className="text-xs uppercase tracking-wider text-slate-500">HOS remaining</div><div className="text-2xl font-semibold text-white mt-1">{formatMinutes(driver.hos_remaining_minutes)}</div></div>
        <div className="hp-panel rounded-xl p-4"><div className="text-xs uppercase tracking-wider text-slate-500">License</div><div className="text-base text-white mt-1">{driver.license_state} · {driver.license_number || '—'}</div></div>
        <div className="hp-panel rounded-xl p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Phone</div><div className="text-base text-white mt-1">{driver.phone || '—'}</div></div>
        <div className="hp-panel rounded-xl p-4"><div className="text-xs uppercase tracking-wider text-slate-500">Email</div><div className="text-base text-white mt-1 truncate">{driver.email || '—'}</div></div>
      </div>

      {vehicle && (
        <div className="hp-panel rounded-xl p-5">
          <div className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Truck className="w-4 h-4 text-sky-400" /> Assigned vehicle</div>
          <div className="grid md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-xs text-slate-500">Truck</div><div className="text-white">{vehicle.name}</div></div>
            <div><div className="text-xs text-slate-500">Make / Model</div><div className="text-white">{vehicle.make} {vehicle.model}</div></div>
            <div><div className="text-xs text-slate-500">Plate</div><div className="text-white">{vehicle.plate}</div></div>
            <div><div className="text-xs text-slate-500">Odometer</div><div className="text-white">{vehicle.odometer?.toLocaleString()} mi</div></div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="hp-panel rounded-xl">
          <div className="p-4 border-b border-white/5 text-sm font-semibold text-white flex items-center gap-2"><Route className="w-4 h-4 text-sky-400" /> Trips</div>
          <div className="divide-y divide-white/5">
            {trips.length === 0 && <div className="p-4 text-sm text-slate-500">No trips yet.</div>}
            {trips.map((t) => (
              <div key={t.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white">{t.origin} → {t.destination}</div>
                  <span className="text-xs text-slate-500">{(t.miles || 0).toLocaleString()} mi</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">{t.status} · {timeAgo(t.created_at)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="hp-panel rounded-xl">
          <div className="p-4 border-b border-white/5 text-sm font-semibold text-white flex items-center gap-2"><Clock className="w-4 h-4 text-amber-400" /> HOS log</div>
          <div className="divide-y divide-white/5 max-h-[420px] overflow-auto">
            {hos.length === 0 && <div className="p-4 text-sm text-slate-500">No HOS entries.</div>}
            {hos.map((h) => {
              const dcc = dutyColor[h.duty_status] || dutyColor.off_duty;
              return (
                <div key={h.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${dcc.bg} ${dcc.text} uppercase tracking-wider`}>{dcc.label}</span>
                    <span className="text-xs text-slate-500">{timeAgo(h.started_at || h.created_at)}</span>
                  </div>
                  <span className="text-xs text-slate-500">{h.notes || ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
