import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Route as RouteIcon, ArrowRight } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

const statusStyle = {
  planned: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  active: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export default function DriverTrips() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/trips').then((r) => setRows(r.data)); }, []);
  return (
    <div className="p-5 space-y-3">
      <h1 className="text-2xl font-bold text-white">My trips</h1>
      <div className="space-y-2">
        {rows.map((t) => (
          <Link key={t.id} to={`/driver/trips/${t.id}`} className="block hp-panel rounded-xl p-4 hover:border-sky-500/30 transition">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center"><RouteIcon className="w-4 h-4 text-sky-300" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white">{t.origin} → {t.destination}</div>
                <div className="text-xs text-slate-500 mt-0.5">{(t.miles || 0).toLocaleString()} mi · {timeAgo(t.created_at)}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${statusStyle[t.status]}`}>{t.status}</span>
                <ArrowRight className="w-4 h-4 text-slate-500" />
              </div>
            </div>
          </Link>
        ))}
        {rows.length === 0 && <div className="text-sm text-slate-500">No trips yet.</div>}
      </div>
    </div>
  );
}
