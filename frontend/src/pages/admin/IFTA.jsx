import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MapPin, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

function download(url, filename) {
  const token = localStorage.getItem('hp_token');
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.blob())
    .then((b) => {
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u; a.download = filename; a.click();
      URL.revokeObjectURL(u);
    });
}

export default function IFTA() {
  const [data, setData] = useState({ by_state: [], total: 0, state_count: 0 });
  useEffect(() => { api.get('/ifta/summary').then((r) => setData(r.data)); }, []);
  const max = Math.max(1, ...data.by_state.map((s) => s.miles));
  const BACKEND = process.env.REACT_APP_BACKEND_URL;

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div><div className="text-xs uppercase tracking-widest text-sky-400/80">IFTA / Mileage</div><h1 className="text-3xl font-bold text-white mt-1">State-by-state mileage</h1></div>
        <Button data-testid="export-mileage-btn" onClick={() => download(`${BACKEND}/api/exports/mileage.csv`, 'mileage.csv')} className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="hp-panel rounded-xl p-5"><div className="text-xs uppercase tracking-wider text-slate-500">Total miles tracked</div><div className="text-3xl font-semibold text-white mt-1">{data.total.toLocaleString()}</div></div>
        <div className="hp-panel rounded-xl p-5"><div className="text-xs uppercase tracking-wider text-slate-500">States covered</div><div className="text-3xl font-semibold text-white mt-1">{data.state_count}</div></div>
        <div className="hp-panel rounded-xl p-5"><div className="text-xs uppercase tracking-wider text-slate-500">Records</div><div className="text-3xl font-semibold text-white mt-1">{data.by_state.length}</div></div>
      </div>

      <div className="hp-panel rounded-xl">
        <div className="p-4 border-b border-white/5 text-sm font-semibold text-white flex items-center gap-2"><MapPin className="w-4 h-4 text-sky-400" /> By state</div>
        <div className="divide-y divide-white/5">
          {data.by_state.length === 0 && <div className="p-6 text-sm text-slate-500">No mileage logged yet. Drivers can add state mileage from a trip detail page.</div>}
          {data.by_state.map((s) => (
            <div key={s.state} className="p-4 flex items-center gap-4">
              <div className="w-12 text-center text-xs px-2 py-1 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono">{s.state}</div>
              <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-gradient-to-r from-sky-500 to-sky-300" style={{ width: `${(s.miles / max) * 100}%` }} /></div>
              <div className="text-sm text-white w-24 text-right">{s.miles.toLocaleString()} mi</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
