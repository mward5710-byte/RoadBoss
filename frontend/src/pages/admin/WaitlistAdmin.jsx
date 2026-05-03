import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Mail, Users } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

export default function WaitlistAdmin() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/waitlist').then((r) => setRows(r.data)).catch(() => setRows([])); }, []);
  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div><div className="text-xs uppercase tracking-widest text-sky-400/80">Pre-launch</div><h1 className="text-3xl font-bold text-white mt-1">Waitlist</h1></div>
      <div className="hp-panel rounded-xl p-4 flex items-center gap-3"><Users className="w-5 h-5 text-sky-300" /><div><div className="text-2xl font-semibold text-white">{rows.length}</div><div className="text-xs text-slate-500">total signups</div></div></div>
      <div className="hp-panel rounded-xl divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.id} className="p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center"><Mail className="w-4 h-4 text-sky-300" /></div>
            <div className="flex-1">
              <div className="flex items-center gap-2"><div className="text-sm text-white">{r.name}</div><span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-300 uppercase tracking-wider">{r.role || '—'}</span><span className="text-[11px] text-slate-500">· {timeAgo(r.created_at)}</span></div>
              <div className="text-xs text-slate-400 mt-0.5">{r.email} {r.fleet_size && `· ${r.fleet_size}`}</div>
              {r.message && <div className="text-sm text-slate-300 mt-1.5 italic">“{r.message}”</div>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="p-6 text-sm text-slate-500">No signups yet. Share the home page!</div>}
      </div>
    </div>
  );
}
