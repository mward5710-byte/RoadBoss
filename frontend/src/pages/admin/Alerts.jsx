import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { severityColor, timeAgo } from '@/lib/utils';
import { Bell, AlertTriangle } from 'lucide-react';

export default function Alerts() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/alerts').then((r) => setRows(r.data)); }, []);
  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div><div className="text-xs uppercase tracking-widest text-sky-400/80">Notifications</div><h1 className="text-3xl font-bold text-white mt-1">Alerts</h1></div>
      <div className="hp-panel rounded-xl divide-y divide-white/5">
        {rows.map((a) => {
          const sc = severityColor[a.severity] || severityColor.info;
          const Icon = a.severity === 'critical' ? AlertTriangle : Bell;
          return (
            <div key={a.id} className="p-4 flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg ${sc.bg} ${sc.border} border flex items-center justify-center`}><Icon className={`w-4 h-4 ${sc.text}`} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${sc.bg} ${sc.text} uppercase tracking-wider border ${sc.border}`}>{a.severity}</span>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider">{a.type}</span>
                  <span className="text-[11px] text-slate-500">· {timeAgo(a.created_at)}</span>
                </div>
                <div className="text-sm text-slate-200 mt-1.5">{a.message}</div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="p-6 text-sm text-slate-500">No alerts.</div>}
      </div>
    </div>
  );
}
