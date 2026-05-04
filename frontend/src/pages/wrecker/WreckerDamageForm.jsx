import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Save, X, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SignaturePad } from '@/components/SignaturePad';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const SEVERITIES = [
  { key: 'minor',        label: 'Minor',        color: '#fbbf24' },
  { key: 'moderate',     label: 'Moderate',     color: '#f97316' },
  { key: 'major',        label: 'Major',        color: '#dc2626' },
  { key: 'pre_existing', label: 'Pre-existing', color: '#6366f1' },
];

function CarSilhouette({ marks, onAddMark, onRemoveMark, severity }) {
  // Single 4-view top-down silhouette using simple SVG. ViewBox: 0..1 normalized X & Y.
  const svgRef = useRef(null);

  const handleClick = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    // viewBox is 0 0 100 200, normalize to 0-1
    const x = local.x / 100;
    const y = local.y / 200;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onAddMark({ x, y, severity });
  };

  return (
    <svg ref={svgRef} viewBox="0 0 100 200" onClick={handleClick}
      className="w-full max-w-md mx-auto bg-white rounded-lg cursor-crosshair touch-none select-none"
      style={{ touchAction: 'manipulation' }} data-testid="damage-svg">
      {/* Front bumper (top) */}
      <rect x="15" y="6" width="70" height="14" rx="6" fill="none" stroke="#94a3b8" strokeWidth="1.4" />
      <text x="50" y="15" textAnchor="middle" fontSize="4" fill="#94a3b8">FRONT BUMPER</text>
      {/* Hood */}
      <rect x="22" y="24" width="56" height="30" rx="3" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
      <text x="50" y="42" textAnchor="middle" fontSize="4" fill="#94a3b8">HOOD</text>
      {/* Windshield */}
      <path d="M22 56 L78 56 L74 70 L26 70 Z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />
      {/* Roof / cabin */}
      <rect x="24" y="72" width="52" height="56" rx="3" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
      <text x="50" y="102" textAnchor="middle" fontSize="4" fill="#94a3b8">ROOF / CABIN</text>
      {/* Driver door */}
      <rect x="10" y="78" width="14" height="22" rx="2" fill="none" stroke="#94a3b8" strokeWidth="1" />
      <text x="17" y="91" textAnchor="middle" fontSize="3" fill="#94a3b8">DRV</text>
      {/* Driver rear door */}
      <rect x="10" y="100" width="14" height="22" rx="2" fill="none" stroke="#94a3b8" strokeWidth="1" />
      <text x="17" y="113" textAnchor="middle" fontSize="3" fill="#94a3b8">DRV-R</text>
      {/* Passenger door */}
      <rect x="76" y="78" width="14" height="22" rx="2" fill="none" stroke="#94a3b8" strokeWidth="1" />
      <text x="83" y="91" textAnchor="middle" fontSize="3" fill="#94a3b8">PSGR</text>
      {/* Passenger rear door */}
      <rect x="76" y="100" width="14" height="22" rx="2" fill="none" stroke="#94a3b8" strokeWidth="1" />
      <text x="83" y="113" textAnchor="middle" fontSize="3" fill="#94a3b8">PSGR-R</text>
      {/* Rear glass */}
      <path d="M26 130 L74 130 L78 144 L22 144 Z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />
      {/* Trunk */}
      <rect x="22" y="146" width="56" height="30" rx="3" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
      <text x="50" y="164" textAnchor="middle" fontSize="4" fill="#94a3b8">TRUNK</text>
      {/* Rear bumper */}
      <rect x="15" y="180" width="70" height="14" rx="6" fill="none" stroke="#94a3b8" strokeWidth="1.4" />
      <text x="50" y="189" textAnchor="middle" fontSize="4" fill="#94a3b8">REAR BUMPER</text>
      {/* Wheels */}
      <ellipse cx="12" cy="45" rx="5" ry="8" fill="#1e293b" />
      <ellipse cx="88" cy="45" rx="5" ry="8" fill="#1e293b" />
      <ellipse cx="12" cy="155" rx="5" ry="8" fill="#1e293b" />
      <ellipse cx="88" cy="155" rx="5" ry="8" fill="#1e293b" />

      {/* Marks */}
      {marks.map((m, i) => {
        const sev = SEVERITIES.find((s) => s.key === m.severity) || SEVERITIES[0];
        return (
          <g key={m.id || i} onClick={(e) => { e.stopPropagation(); onRemoveMark(m); }} style={{ cursor: 'pointer' }}>
            <circle cx={m.x * 100} cy={m.y * 200} r="3.5" fill={sev.color} stroke="white" strokeWidth="1" />
            <text x={m.x * 100} y={m.y * 200 + 1.4} textAnchor="middle" fontSize="3.5" fill="white" fontWeight="bold">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function WreckerDamageForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [form, setForm] = useState({ marks: [], customer_name: '', signature_data_url: '', notes: '' });
  const [activeSeverity, setActiveSeverity] = useState('minor');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [j, df] = await Promise.all([
        api.get(`/wrecker/jobs/${id}`),
        api.get(`/wrecker/jobs/${id}/damage-form`).catch(() => ({ data: null })),
      ]);
      setJob(j.data);
      if (df.data) {
        setForm({
          marks: (df.data.marks || []).map((m, i) => ({ ...m, id: m.id || `m-${i}` })),
          customer_name: df.data.customer_name || j.data?.customer?.name || '',
          signature_data_url: df.data.signature_data_url || '',
          notes: df.data.notes || '',
        });
      } else {
        setForm((f) => ({ ...f, customer_name: j.data?.customer?.name || '' }));
      }
    } catch (e) {
      toast.error('Could not load damage form');
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const addMark = ({ x, y, severity }) => {
    setForm((f) => ({ ...f, marks: [...f.marks, { id: `m-${Date.now()}`, x, y, severity, note: '' }] }));
  };
  const removeMark = (mark) => {
    if (!window.confirm('Remove this damage mark?')) return;
    setForm((f) => ({ ...f, marks: f.marks.filter((m) => m.id !== mark.id) }));
  };
  const updateMarkNote = (markId, note) => {
    setForm((f) => ({ ...f, marks: f.marks.map((m) => m.id === markId ? { ...m, note } : m) }));
  };

  const submit = async () => {
    if (!form.signature_data_url) { toast.error('Customer signature required'); return; }
    setSaving(true);
    try {
      await api.post(`/wrecker/jobs/${id}/damage-form`, {
        marks: form.marks.map(({ id, ...m }) => m),
        customer_name: form.customer_name,
        signature_data_url: form.signature_data_url,
        notes: form.notes,
      });
      toast.success('Damage form saved');
      navigate(`/wrecker/jobs/${id}`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading damage form...</div>;
  if (!job) return null;

  const veh = job.vehicle || {};
  const veh_str = [veh.year, veh.color, veh.make, veh.model].filter(Boolean).join(' ');

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <header className="sticky top-0 z-10 bg-[#0a0e14]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to={`/wrecker/jobs/${id}`} className="text-slate-400 hover:text-white" data-testid="back-to-job">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-amber-400">Damage Form</div>
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{veh_str || 'Vehicle'} {veh.plate && <span className="text-slate-500">· {veh.plate}</span>}</h1>
            </div>
          </div>
          <Button data-testid="damage-form-save" onClick={submit} disabled={saving} size="sm" className="bg-amber-500 text-black hover:bg-amber-400 font-semibold">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Sign
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5 pb-32">
        <div className="text-sm text-slate-400 leading-relaxed">
          Tap on the diagram to mark visible damage. Pick a severity first. Tap a mark to remove it.
        </div>

        {/* Severity picker */}
        <Card className="p-4 bg-[#0a0e14] border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Severity (tap before marking)</div>
          <div className="flex gap-2 flex-wrap">
            {SEVERITIES.map((s) => (
              <button key={s.key} data-testid={`severity-${s.key}`} onClick={() => setActiveSeverity(s.key)}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-full border transition flex items-center gap-2 ${activeSeverity === s.key ? 'bg-white/10 text-white border-white/30 font-semibold' : 'bg-white/[0.03] text-slate-400 border-white/10 hover:text-white'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        </Card>

        {/* SVG diagram */}
        <Card className="p-4 bg-[#0a0e14] border-white/5">
          <CarSilhouette marks={form.marks} severity={activeSeverity} onAddMark={addMark} onRemoveMark={removeMark} />
          <div className="mt-3 text-[11px] text-slate-500 text-center">{form.marks.length} damage mark{form.marks.length === 1 ? '' : 's'} placed</div>
        </Card>

        {/* Marks list with notes */}
        {form.marks.length > 0 && (
          <Card className="p-4 bg-[#0a0e14] border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Damage Notes</div>
            <div className="space-y-2">
              {form.marks.map((m, i) => {
                const sev = SEVERITIES.find((s) => s.key === m.severity) || SEVERITIES[0];
                return (
                  <div key={m.id} className="flex items-center gap-2" data-testid={`damage-note-${i}`}>
                    <span className="shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: sev.color }}>{i + 1}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400 w-20">{sev.label}</span>
                    <Input value={m.note || ''} onChange={(e) => updateMarkNote(m.id, e.target.value)} placeholder="e.g. scratch on driver door" className="bg-[#07090d] border-white/10 text-white text-sm" />
                    <button onClick={() => removeMark(m)} className="shrink-0 text-slate-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Customer info + signature */}
        <Card className="p-4 bg-[#0a0e14] border-white/5 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Customer name</label>
            <Input data-testid="damage-customer-name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="bg-[#07090d] border-white/10 text-white" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Notes (optional)</label>
            <Textarea data-testid="damage-form-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Customer pointed out scratch as pre-existing" rows={2} className="bg-[#07090d] border-white/10 text-white text-sm resize-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Customer signature</label>
            <SignaturePad onChange={(d) => setForm({ ...form, signature_data_url: d })} testId="damage-signature" />
            <div className="text-[11px] text-slate-500 mt-1">By signing, the customer acknowledges the marked condition of the vehicle.</div>
          </div>
        </Card>

        <Button data-testid="damage-form-save-bottom" onClick={submit} disabled={saving} size="lg" className="w-full bg-amber-500 text-black hover:bg-amber-400 font-semibold h-12 text-base">
          {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />} Save & Sign
        </Button>
      </main>
    </div>
  );
}
