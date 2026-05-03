import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { severityColor, timeAgo } from '@/lib/utils';
import { Camera, Play } from 'lucide-react';

export default function DashcamPage() {
  const [rows, setRows] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  useEffect(() => { (async () => {
    const [c, v] = await Promise.all([api.get('/dashcam-events'), api.get('/vehicles')]);
    setRows(c.data); setVehicles(v.data);
  })(); }, []);
  const vName = (id) => vehicles.find((v) => v.id === id)?.name || '—';
  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div><div className="text-xs uppercase tracking-widest text-sky-400/80">Camera feed</div><h1 className="text-3xl font-bold text-white mt-1">Dashcam events</h1></div>
        <div className="flex gap-2 text-[10px] uppercase tracking-wider">
          <span className="px-2 py-1 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30">Samsara</span>
          <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">Lytx</span>
          <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">Verizon Connect</span>
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((e) => {
          const sc = severityColor[e.severity] || severityColor.info;
          return (
            <div key={e.id} className="hp-panel rounded-xl overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-[#0a0e14] to-[#1a2332] relative flex items-center justify-center">
                {e.thumbnail ? <img src={e.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" /> : <Camera className="w-10 h-10 text-slate-700" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <button className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-sky-500/90 hover:bg-sky-400 flex items-center justify-center text-slate-950 transition"><Play className="w-5 h-5 ml-0.5" /></button>
                <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/60 text-slate-200">{e.vendor}</div>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${sc.bg} ${sc.text} uppercase tracking-wider border ${sc.border}`}>{e.severity}</span><span className="text-[10px] text-slate-500">· {timeAgo(e.created_at)}</span></div>
                <div className="text-sm text-white mt-1.5">{e.event}</div>
                <div className="text-xs text-slate-500">{vName(e.vehicle_id)}</div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="col-span-full p-6 text-slate-500">No events.</div>}
      </div>
    </div>
  );
}
