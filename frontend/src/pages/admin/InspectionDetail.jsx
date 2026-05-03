import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { ArrowLeft, ShieldCheck, AlertTriangle, Check, MinusCircle, Truck, Container, Clock, Pencil } from 'lucide-react';

const statusMeta = {
  pass: { icon: Check, color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', label: 'Pass' },
  defect: { icon: AlertTriangle, color: 'text-red-300', bg: 'bg-red-500/15', border: 'border-red-500/40', label: 'Defect' },
  na: { icon: MinusCircle, color: 'text-slate-300', bg: 'bg-slate-500/15', border: 'border-slate-500/40', label: 'N/A' },
  pending: { icon: Pencil, color: 'text-sky-300', bg: 'bg-sky-500/10', border: 'border-sky-500/30', label: 'Pending' },
};

function fmt(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function InspectionDetail() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/inspections/${id}`).then((r) => setDoc(r.data)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!doc) return <div className="p-8 text-slate-500">Not found.</div>;

  const grouped = { tractor: [], trailer: [] };
  (doc.items || []).forEach((it) => { (grouped[it.section] ||= []).push(it); });
  const defectCount = (doc.items || []).filter((i) => i.status === 'defect').length;

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-5" data-testid="admin-inspection-detail">
      <Link to="/app/inspections" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm" data-testid="back-to-inspections">
        <ArrowLeft className="w-4 h-4" /> Back to inspections
      </Link>

      <div className="hp-panel-bordered rounded-2xl p-6 hp-glow">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-sky-400/80">DVIR · {doc.inspection_type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'}</div>
            <h1 className="text-2xl font-bold text-white mt-1">{doc.driver_name || '—'}</h1>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span><Truck className="w-3 h-3 inline mr-1" /> {doc.vehicle_name || '—'} {doc.vehicle_plate ? `· ${doc.vehicle_plate}` : ''}</span>
              <span><Clock className="w-3 h-3 inline mr-1" /> Started {fmt(doc.created_at)}</span>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-[10px] px-2 py-1 rounded-full border uppercase tracking-wider ${doc.status === 'certified' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'}`}>
              {doc.status === 'certified' ? <><ShieldCheck className="w-3 h-3 inline mr-1" /> Certified</> : 'In Progress'}
            </span>
            <div className="mt-2 text-xs text-slate-500">{defectCount} defect{defectCount === 1 ? '' : 's'}</div>
          </div>
        </div>
        {doc.signature && (
          <div className="hp-divider my-4" />
        )}
        {doc.signature && (
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs text-slate-500">Signed by</div><div className="text-white">{doc.signature}</div></div>
            <div><div className="text-xs text-slate-500">Certified at</div><div className="text-white">{fmt(doc.certified_at)}</div></div>
          </div>
        )}
      </div>

      {['tractor', 'trailer'].map((section) => (
        <div key={section} className="hp-panel rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center gap-2">
            {section === 'tractor' ? <Truck className="w-4 h-4 text-sky-400" /> : <Container className="w-4 h-4 text-sky-400" />}
            <span className="text-sm font-semibold text-white">{section === 'tractor' ? 'Tractor' : 'Trailer'}</span>
            <span className="text-[10px] text-slate-500 ml-auto">
              {(grouped[section] || []).filter((i) => i.status === 'pass').length} pass · {(grouped[section] || []).filter((i) => i.status === 'defect').length} defect · {(grouped[section] || []).filter((i) => i.status === 'na').length} n/a
            </span>
          </div>
          <div className="divide-y divide-white/5">
            {(grouped[section] || []).map((it) => {
              const meta = statusMeta[it.status] || statusMeta.pending;
              const Icon = meta.icon;
              return (
                <div key={it.key} className="p-4" data-testid={`detail-item-${it.key}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center ${meta.bg} ${meta.border} border`}>
                      <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{it.label}</div>
                      {it.note && <div className={`text-xs mt-1 ${it.status === 'defect' ? 'text-red-300' : 'text-slate-400'}`}>"{it.note}"</div>}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${meta.bg} ${meta.color} border ${meta.border}`}>{meta.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
