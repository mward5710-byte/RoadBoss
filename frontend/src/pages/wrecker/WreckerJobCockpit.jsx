import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api, getUser } from '@/lib/api';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Phone, MapPin, MessageSquare, Clock, DollarSign, Truck,
  AlertTriangle, UserPlus, Crown, Camera, FileSignature, FileText, Receipt,
  Send, Plus, X, Check, Key, Car, Edit3, ExternalLink, ChevronRight, Printer,
  Paperclip, Download, Upload, File as FileIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { openCameraAsDataUrl } from '@/lib/photoCapture';
import { NAV_APPS, getNavApp, setNavApp, navUrl } from '@/lib/navPref';

// 7-stage Towbook-style flow + colors
const STATUS_FLOW = ['pending', 'assigned', 'en_route', 'on_scene', 'towing', 'dest_arrival', 'completed'];
const STATUS_LABEL = {
  pending: 'Waiting', assigned: 'Dispatched', en_route: 'En Route',
  on_scene: 'On Scene', towing: 'Towing', dest_arrival: 'Dest. Arrival',
  completed: 'Completed', cancelled: 'Cancelled',
};
const STATUS_DOT = {
  pending:      'bg-amber-400',
  assigned:     'bg-blue-700',
  en_route:     'bg-emerald-300',
  on_scene:     'bg-emerald-600',
  towing:       'bg-sky-400',
  dest_arrival: 'bg-fuchsia-500',
  completed:    'bg-slate-200',
  cancelled:    'bg-slate-500',
};
const PHOTO_STAGES = [
  { key: 'on_scene',     label: 'On Scene' },
  { key: 'towing',       label: 'Loaded' },
  { key: 'dest_arrival', label: 'Destination' },
  { key: 'damage',       label: 'Damage' },
  { key: 'pre_hook',     label: 'Pre-Hook' },
  { key: 'other',        label: 'Other' },
];

function TimelineRail({ history, currentStatus }) {
  // Build a map of status → first timestamp
  const stamps = {};
  (history || []).forEach((h) => {
    if (h.status && !stamps[h.status]) stamps[h.status] = h.at;
  });
  return (
    <div className="space-y-2" data-testid="status-timeline">
      {STATUS_FLOW.map((s) => {
        const ts = stamps[s];
        const isDone = !!ts;
        const isCurrent = s === currentStatus;
        return (
          <div key={s} className={`flex items-center gap-3 ${isCurrent ? 'opacity-100' : isDone ? 'opacity-90' : 'opacity-40'}`}>
            <div className={`w-3 h-3 rounded-full shrink-0 ${STATUS_DOT[s]} ${isCurrent ? 'ring-2 ring-amber-400/60 ring-offset-2 ring-offset-[#07090d]' : ''}`} />
            <div className="flex-1 flex items-center justify-between gap-3">
              <div className={`text-sm ${isCurrent ? 'text-white font-semibold' : 'text-slate-300'}`}>{STATUS_LABEL[s]}</div>
              <div className="text-[11px] text-slate-500 tabular-nums">{ts ? new Date(ts).toLocaleString() : '—'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageTabs({ activeStage, onChange, photos }) {
  const counts = useMemo(() => {
    const c = { all: photos.length };
    PHOTO_STAGES.forEach((s) => { c[s.key] = photos.filter((p) => p.stage === s.key).length; });
    return c;
  }, [photos]);
  const all = [{ key: 'all', label: 'All' }, ...PHOTO_STAGES];
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {all.map((s) => (
        <button
          key={s.key}
          data-testid={`photo-stage-${s.key}`}
          onClick={() => onChange(s.key)}
          className={`shrink-0 text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border transition ${activeStage === s.key ? 'bg-amber-500 text-black border-amber-400 font-semibold' : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
        >
          {s.label} {counts[s.key] > 0 && <span className={activeStage === s.key ? 'text-black/70' : 'text-amber-400'}>({counts[s.key]})</span>}
        </button>
      ))}
    </div>
  );
}

export default function WreckerJobCockpit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = getUser();
  const role = me?.role;
  const isDriver = role === 'wrecker_operator';
  const canDispatch = ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'dispatcher'].includes(role);
  const canReassign = ['wrecker_supervisor', 'fleet_admin', 'super_admin'].includes(role);

  const [job, setJob] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [rateSheet, setRateSheet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reassignTo, setReassignTo] = useState('');
  const [photoStage, setPhotoStage] = useState('all');
  const [captureStage, setCaptureStage] = useState('on_scene');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('overview'); // overview | photos | charges | payments | files

  // Files tab state
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileCategory, setFileCategory] = useState('other');

  // Add charge form
  const [chargeKey, setChargeKey] = useState('');
  const [chargeQty, setChargeQty] = useState('1');
  // Add payment form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payRef, setPayRef] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/wrecker/jobs/${id}`);
      setJob(r.data);
      if (canDispatch) {
        try { const dr = await api.get('/wrecker/drivers'); setDrivers(dr.data); } catch (e) { /* */ }
      }
      try { const rs = await api.get('/wrecker/rate-sheet'); setRateSheet(rs.data?.items || []); } catch (e) { /* */ }
    } catch (e) {
      toast.error('Job not found');
      navigate(isDriver ? '/wrecker/me' : '/wrecker');
    } finally { setLoading(false); }
  }, [id, navigate, canDispatch, isDriver]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (newStatus) => {
    try {
      await api.post(`/wrecker/jobs/${id}/status`, { status: newStatus });
      toast.success(`Status → ${STATUS_LABEL[newStatus]}`);
      load();
    } catch (e) { toast.error('Status update failed'); }
  };

  const cancelJob = async () => {
    if (!window.confirm('Cancel this job?')) return;
    try {
      await api.post(`/wrecker/jobs/${id}/status`, { status: 'cancelled' });
      toast.success('Job cancelled');
      navigate(isDriver ? '/wrecker/me' : '/wrecker');
    } catch (e) { toast.error('Cancel failed'); }
  };

  const handleAssign = async () => {
    if (!reassignTo) { toast.error('Pick a driver first'); return; }
    try {
      await api.post(`/wrecker/jobs/${id}/assign`, { driver_id: reassignTo });
      toast.success('Driver assigned');
      setReassignTo('');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Assign failed'); }
  };

  const capturePhoto = async (stage = captureStage) => {
    try {
      const dataUrl = await openCameraAsDataUrl();
      if (!dataUrl) return;
      setBusy(true);
      await api.post(`/wrecker/jobs/${id}/photo`, { data_url: dataUrl, stage });
      toast.success(`Photo saved (${PHOTO_STAGES.find((s) => s.key === stage)?.label || stage})`);
      load();
    } catch (e) { toast.error('Photo upload failed'); }
    finally { setBusy(false); }
  };

  const deletePhoto = async (photoId) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      await api.delete(`/wrecker/jobs/${id}/photo/${photoId}`);
      load();
    } catch (e) { toast.error('Delete failed'); }
  };

  // ---------- Files (PDFs / docs) ----------
  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const r = await api.get(`/wrecker/jobs/${id}/files`);
      setFiles(r.data?.files || []);
    } catch (e) { /* 404 on fresh jobs is fine */ }
    finally { setFilesLoading(false); }
  }, [id]);

  useEffect(() => {
    if (tab === 'files') loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  const uploadFile = async (file, category) => {
    if (!file) return;
    // 15 MB cap matches backend
    if (file.size > 15 * 1024 * 1024) {
      toast.error('File too large (max 15 MB)');
      return;
    }
    try {
      setBusy(true);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api.post(`/wrecker/jobs/${id}/files`, {
        data_url: dataUrl,
        name: file.name,
        mime_type: file.type || 'application/octet-stream',
        size: file.size,
        category: category || 'other',
      });
      toast.success(`Uploaded ${file.name}`);
      await loadFiles();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Upload failed');
    } finally { setBusy(false); }
  };

  const downloadFile = async (fileId, fileName) => {
    try {
      const r = await api.get(`/wrecker/jobs/${id}/files/${fileId}`);
      const dataUrl = r.data?.data_url;
      if (!dataUrl) { toast.error('File data unavailable'); return; }
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName || 'download';
      a.click();
    } catch (e) { toast.error('Download failed'); }
  };

  const viewFile = async (fileId) => {
    try {
      const r = await api.get(`/wrecker/jobs/${id}/files/${fileId}`);
      const dataUrl = r.data?.data_url;
      if (!dataUrl) { toast.error('File data unavailable'); return; }
      const w = window.open('', '_blank', 'noopener');
      if (w) {
        if ((r.data?.mime_type || '').startsWith('image/')) {
          w.document.write(`<html><head><title>${r.data.name || 'file'}</title></head><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${dataUrl}" style="max-width:100%;max-height:100vh;object-fit:contain" alt="file"/></body></html>`);
          w.document.close();
        } else {
          // For PDFs and other, redirect the window to the data URL directly
          w.location.href = dataUrl;
        }
      }
    } catch (e) { toast.error('Open failed'); }
  };

  const deleteFile = async (fileId) => {
    if (!window.confirm('Delete this file?')) return;
    try {
      await api.delete(`/wrecker/jobs/${id}/files/${fileId}`);
      await loadFiles();
    } catch (e) { toast.error('Delete failed'); }
  };

  const addCharge = async () => {
    const item = rateSheet.find((r) => r.key === chargeKey);
    if (!item) { toast.error('Pick a charge type'); return; }
    const qty = parseFloat(chargeQty) || 1;
    try {
      await api.post(`/wrecker/jobs/${id}/charges`, { key: item.key, label: item.label, rate: item.rate, qty, unit: item.unit || 'ea' });
      toast.success(`+ ${item.label}`);
      setChargeKey(''); setChargeQty('1');
      load();
    } catch (e) { toast.error('Add charge failed'); }
  };

  const deleteCharge = async (chargeId) => {
    try { await api.delete(`/wrecker/jobs/${id}/charges/${chargeId}`); load(); }
    catch (e) { toast.error('Delete failed'); }
  };

  const addPayment = async () => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { toast.error('Enter an amount'); return; }
    try {
      await api.post(`/wrecker/jobs/${id}/payments`, { amount: amt, method: payMethod, reference: payRef || null });
      toast.success(`+ $${amt.toFixed(2)} ${payMethod}`);
      setPayAmount(''); setPayRef('');
      load();
    } catch (e) { toast.error('Add payment failed'); }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading job...</div>;
  if (!job) return null;

  const idx = STATUS_FLOW.indexOf(job.status);
  const next = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
  const assignedDriver = drivers.find((d) => d.id === job.assigned_driver_id);
  const photos = job.photos || [];
  const filteredPhotos = photoStage === 'all' ? photos : photos.filter((p) => p.stage === photoStage);
  const charges = job.charges || [];
  const payments = job.payments || [];
  const totals = {
    subtotal: job.subtotal || 0,
    tax: job.tax || 0,
    invoice_total: job.invoice_total || 0,
    amount_paid: job.amount_paid || 0,
    balance_due: job.balance_due || 0,
  };
  const isPaid = totals.invoice_total > 0 && totals.balance_due <= 0.01;
  const veh = job.vehicle || {};
  const veh_str = [veh.year, veh.color, veh.make, veh.model].filter(Boolean).join(' ');

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      {/* Sticky-ish header */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link to={isDriver ? '/wrecker/me' : '/wrecker'}><Button variant="ghost" size="sm" data-testid="back-to-board"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-amber-400/80">Job #{(job.id || '').slice(0, 8).toUpperCase()} · {(job.service_type || '').replace(/_/g, ' ')}</div>
            <h1 className="text-2xl font-bold text-white mt-1 truncate" data-testid="job-customer-name">{job.customer?.name}</h1>
            <div className="text-sm text-slate-400 mt-0.5 truncate">
              {veh_str || 'Vehicle'}
              {veh.plate && <span className="ml-1 text-slate-500">· {veh.plate}{veh.state ? '/' + veh.state : ''}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isPaid && <Badge data-testid="paid-badge" className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">PAID</Badge>}
          <Badge data-testid="job-status-badge" className="text-xs uppercase tracking-wider bg-amber-500/15 text-amber-200 border border-amber-500/30">
            {STATUS_LABEL[job.status] || job.status}
          </Badge>
        </div>
      </header>

      {/* Top action row — Towbook style */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" data-testid="action-row">
        <ActionPill icon={Camera} label="Photos" badge={photos.length} active={tab === 'photos'} onClick={() => setTab('photos')} testId="action-photos" />
        <ActionPill icon={FileSignature} label="Damage Form" onClick={() => navigate(`/wrecker/jobs/${id}/damage-form`)} testId="action-damage" />
        <ActionPill icon={FileText} label="Waiver" highlight={job.waiver_id} onClick={() => navigate(`/wrecker/jobs/${id}/waiver`)} testId="action-waiver" />
        <ActionPill icon={Receipt} label="Charges" badge={charges.length} active={tab === 'charges'} onClick={() => setTab('charges')} testId="action-charges" />
        <ActionPill icon={DollarSign} label="Payments" badge={payments.length} active={tab === 'payments'} onClick={() => setTab('payments')} testId="action-payments" />
        <ActionPill icon={Send} label="Email Receipt" onClick={() => navigate(`/wrecker/jobs/${id}/receipt`)} testId="action-receipt" />
        <ActionPill icon={Printer} label="Print Receipt" onClick={() => window.open(`/wrecker/jobs/${id}/print`, '_blank', 'noopener')} testId="action-print" />
        <ActionPill icon={Paperclip} label="Files" badge={files.length} active={tab === 'files'} onClick={() => setTab('files')} testId="action-files" />
      </div>

      {/* Quick advance */}
      {next && job.status !== 'completed' && job.status !== 'cancelled' && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="quick-advance-row">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Next:</span>
          <Button data-testid="quick-advance" onClick={() => setStatus(next)} size="sm" className="bg-amber-500 text-black hover:bg-amber-400 font-semibold">
            <Check className="w-4 h-4 mr-1" /> Mark {STATUS_LABEL[next]}
          </Button>
          {STATUS_FLOW.slice(Math.max(0, idx - 1), idx + 3).filter((s) => s !== job.status && s !== next).map((s) => (
            <button key={s} data-testid={`set-status-${s}`} onClick={() => setStatus(s)} className="text-xs px-2.5 py-1.5 rounded-md border border-white/10 text-slate-400 hover:text-white hover:border-white/30 transition">
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {/* TAB CONTENT */}
      {tab === 'overview' && (
        <>
          {/* Status timeline (color-coded) */}
          <Card className="p-5 bg-[#0a0e14] border-white/5">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-4">Status Timeline</div>
            <TimelineRail history={job.status_history || []} currentStatus={job.status} />
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Customer */}
            <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-400">Customer</div>
              <div className="text-white font-semibold">{job.customer?.name || 'No customer'}</div>
              {job.customer?.phone && (
                <a href={`tel:${job.customer.phone}`} className="flex items-center gap-2 text-sky-300 text-sm hover:text-sky-200" data-testid="call-customer">
                  <Phone className="w-4 h-4" /> {job.customer.phone}
                </a>
              )}
              {job.customer?.email && <div className="text-sm text-slate-400 truncate">{job.customer.email}</div>}
              {job.motor_club_name && <div className="text-xs text-amber-300 mt-2">Motor Club: {job.motor_club_name}</div>}
            </Card>

            {/* Billing summary */}
            <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-400">Invoice</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tabular-nums">${totals.invoice_total.toFixed(2)}</span>
                <span className="text-xs text-slate-500">total</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-300">Paid</span>
                <span className="text-emerald-300 tabular-nums">${totals.amount_paid.toFixed(2)}</span>
              </div>
              <div className={`flex items-center justify-between text-sm font-semibold ${totals.balance_due > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                <span>Balance Due</span>
                <span className="tabular-nums">${totals.balance_due.toFixed(2)}</span>
              </div>
            </Card>
          </div>

          {/* Vehicle Details — Towbook parity */}
          <Card className="p-5 bg-[#0a0e14] border-white/5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-wider text-slate-400 flex items-center gap-2"><Car className="w-3 h-3" /> Vehicle Details</div>
              {!isDriver && <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white text-xs"><Edit3 className="w-3 h-3 mr-1" /> Edit</Button>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-sm">
              <Field label="Description" value={veh_str} />
              <Field label="License / State" value={[veh.plate, veh.state].filter(Boolean).join(' / ')} />
              <Field label="Type" value={veh.duty_class || 'Light'} />
              <Field label="Drive Type" value={veh.drive_type || '—'} />
              <Field label="Drivable" value={veh.drivable === true ? 'Yes' : veh.drivable === false ? 'No' : '—'} />
              <Field label="Has Keys" value={veh.has_keys === true ? 'Yes' : veh.has_keys === false ? 'No' : '—'} icon={<Key className="w-3 h-3 text-amber-400" />} />
              {veh.has_keys && <Field label="Key Location" value={veh.key_location || '—'} />}
              {veh.odometer && <Field label="Odometer" value={`${veh.odometer.toLocaleString()} mi`} />}
              <Field label="VIN" value={veh.vin || '—'} mono full />
            </div>
          </Card>

          {/* Locations */}
          <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wider text-slate-400">Locations</div>
              <NavAppPicker />
            </div>
            <LocationRow label="Pick up" address={job.pickup?.address} lat={job.pickup?.lat} lng={job.pickup?.lng} icon={<MapPin className="w-4 h-4 text-amber-300" />} />
            {job.dropoff?.address && (
              <LocationRow label="Drop off" address={job.dropoff.address} lat={job.dropoff?.lat} lng={job.dropoff?.lng} icon={<Truck className="w-4 h-4 text-emerald-300" />} />
            )}
          </Card>

          {/* Service info */}
          <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">Service Information</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Account" value={job.motor_club_name || job.customer?.name || '—'} />
              <Field label="Reason" value={(job.service_type || '').replace(/_/g, ' ')} />
              <Field label="Priority" value={job.priority || 'normal'} />
              <Field label="Payment Method" value={(job.payment_method || 'invoice').replace(/_/g, ' ')} />
            </div>
            {job.notes && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Dispatch Notes</div>
                <div className="text-sm text-slate-200 whitespace-pre-wrap">{job.notes}</div>
              </div>
            )}
          </Card>

          {/* Assignment / Reassignment — dispatcher+ only */}
          {canDispatch && (
            <Card className="p-5 bg-[#0a0e14] border-white/5" data-testid="assignment-card">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400 mb-3">
                <UserPlus className="w-3 h-3" /> Driver Assignment
              </div>
              {assignedDriver ? (
                <div className="flex items-center gap-3 mb-3">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <div className="flex-1">
                    <div className="text-sm text-white font-semibold">{assignedDriver.name}</div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wider">Currently assigned · Truck {assignedDriver.truck_number || '—'}</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400 mb-3">Unassigned. Pick a driver from rotation:</div>
              )}
              {(canReassign || !job.assigned_driver_id) && job.status !== 'completed' && job.status !== 'cancelled' ? (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select value={reassignTo} onValueChange={setReassignTo}>
                      <SelectTrigger data-testid="reassign-select" className="bg-[#07090d] border-white/10 text-white">
                        <SelectValue placeholder="Select driver..." />
                      </SelectTrigger>
                      <SelectContent>
                        {drivers.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name} {d.next_in_rotation ? '👑 NEXT UP' : ''} {!d.on_duty ? '(off duty)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button data-testid="confirm-assign" onClick={handleAssign} disabled={!reassignTo || reassignTo === job.assigned_driver_id} className="bg-amber-500 text-black hover:bg-amber-400">
                    {job.assigned_driver_id ? 'Reassign' : 'Assign'}
                  </Button>
                </div>
              ) : null}
            </Card>
          )}

          {canDispatch && job.status !== 'completed' && job.status !== 'cancelled' && (
            <div className="flex justify-end">
              <Button data-testid="cancel-job" variant="outline" onClick={cancelJob} className="border-red-500/30 text-red-300 hover:bg-red-500/10">
                <AlertTriangle className="w-4 h-4 mr-1" /> Cancel Job
              </Button>
            </div>
          )}
        </>
      )}

      {tab === 'photos' && (
        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4" data-testid="photos-tab">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400">Photos & Videos</div>
              <div className="text-xs text-slate-500 mt-0.5">Tag each photo by what stage you're in. Stays inside the app — never on your camera roll.</div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={captureStage} onValueChange={setCaptureStage}>
                <SelectTrigger className="bg-[#07090d] border-white/10 text-white w-36 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHOTO_STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button data-testid="capture-photo" onClick={() => capturePhoto()} disabled={busy} className="bg-amber-500 text-black hover:bg-amber-400">
                <Camera className="w-4 h-4 mr-1" /> Add Photo
              </Button>
            </div>
          </div>
          <StageTabs activeStage={photoStage} onChange={setPhotoStage} photos={photos} />
          {filteredPhotos.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm" data-testid="photos-empty">
              <Camera className="w-10 h-10 mx-auto mb-2 text-slate-700" />
              No photos in this bucket yet. Tap <span className="text-amber-400 font-semibold">Add Photo</span> to capture.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {filteredPhotos.map((p) => (
                <div key={p.id} className="group relative rounded-lg overflow-hidden border border-white/10 aspect-square" data-testid={`job-photo-${p.id}`}>
                  <img src={p.data_url} alt={p.stage} className="w-full h-full object-cover" />
                  <div className="absolute top-1 left-1 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/70 text-amber-300 font-semibold">
                    {PHOTO_STAGES.find((s) => s.key === p.stage)?.label || p.stage}
                  </div>
                  <button onClick={() => deletePhoto(p.id)} data-testid={`delete-photo-${p.id}`} className="absolute top-1 right-1 bg-black/70 rounded p-1 opacity-0 group-hover:opacity-100 transition">
                    <X className="w-3 h-3 text-white" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/70 text-[9px] text-white">
                    {p.taken_at ? new Date(p.taken_at).toLocaleString() : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'charges' && (
        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4" data-testid="charges-tab">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400">Charges (line items)</div>
              <div className="text-xs text-slate-500 mt-0.5">Pick a service, set qty, and we'll do the math.</div>
            </div>
          </div>

          {/* Add charge */}
          <div className="flex items-end gap-2 flex-wrap p-3 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="flex-1 min-w-[200px]">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Service</div>
              <Select value={chargeKey} onValueChange={setChargeKey}>
                <SelectTrigger data-testid="charge-key-select" className="bg-[#07090d] border-white/10 text-white">
                  <SelectValue placeholder="Pick from rate sheet..." />
                </SelectTrigger>
                <SelectContent>
                  {rateSheet.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.label} — ${r.rate.toFixed(2)}/{r.unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Qty</div>
              <Input data-testid="charge-qty-input" type="number" step="0.5" value={chargeQty} onChange={(e) => setChargeQty(e.target.value)} className="bg-[#07090d] border-white/10 text-white" />
            </div>
            <Button data-testid="charge-add-btn" onClick={addCharge} className="bg-amber-500 text-black hover:bg-amber-400">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>

          {/* Line items */}
          {charges.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">No charges yet. Add the first line item above.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {charges.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 py-3" data-testid={`charge-row-${c.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white font-medium truncate">{c.label}</div>
                    <div className="text-[11px] text-slate-500">${c.rate?.toFixed(2)} × {c.qty} {c.unit || ''}</div>
                  </div>
                  <div className="text-sm text-emerald-300 font-semibold tabular-nums">${c.subtotal?.toFixed(2)}</div>
                  <button data-testid={`charge-delete-${c.id}`} onClick={() => deleteCharge(c.id)} className="text-slate-500 hover:text-red-400 p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="pt-3 border-t border-white/5 space-y-1 text-sm">
            <Total label="Sub Total" value={totals.subtotal} />
            <Total label="Tax" value={totals.tax} muted />
            <Total label="Invoice Total" value={totals.invoice_total} bold />
            <Total label="Payments" value={-totals.amount_paid} green />
            <Total label="Balance Due" value={totals.balance_due} bold red={totals.balance_due > 0} />
          </div>
        </Card>
      )}

      {tab === 'payments' && (
        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4" data-testid="payments-tab">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-400">Payments</div>
            <div className="text-xs text-slate-500 mt-0.5">Log every payment received — cash, check, card, motor club, or Square.</div>
          </div>

          {/* Big totals banner */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Invoice Total</div>
              <div className="text-2xl font-bold text-white tabular-nums mt-1">${totals.invoice_total.toFixed(2)}</div>
            </div>
            <div className={`p-4 rounded-xl ${totals.balance_due > 0 ? 'bg-red-500/10 border border-red-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
              <div className={`text-[10px] uppercase tracking-wider ${totals.balance_due > 0 ? 'text-red-300' : 'text-emerald-300'}`}>Balance Due</div>
              <div className={`text-2xl font-bold tabular-nums mt-1 ${totals.balance_due > 0 ? 'text-red-200' : 'text-emerald-200'}`}>${totals.balance_due.toFixed(2)}</div>
            </div>
          </div>

          {/* Add payment */}
          <div className="flex items-end gap-2 flex-wrap p-3 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="w-28">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Amount</div>
              <Input data-testid="payment-amount-input" type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" className="bg-[#07090d] border-white/10 text-white" />
            </div>
            <div className="w-32">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Method</div>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger data-testid="payment-method-select" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['cash','check','card','square','motor_club','other'].map((m) => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Reference (optional)</div>
              <Input data-testid="payment-ref-input" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="check #, last-4, txn id" className="bg-[#07090d] border-white/10 text-white" />
            </div>
            <Button data-testid="payment-add-btn" onClick={addPayment} className="bg-emerald-500 text-black hover:bg-emerald-400">
              <Plus className="w-4 h-4 mr-1" /> Mark Paid
            </Button>
          </div>

          {payments.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">No payments recorded yet.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3" data-testid={`payment-row-${p.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white">${p.amount?.toFixed(2)} <span className="text-slate-500 text-xs uppercase tracking-wider ml-2">{(p.method || '').replace('_', ' ')}</span></div>
                    <div className="text-[11px] text-slate-500">
                      {p.received_at ? new Date(p.received_at).toLocaleString() : ''} {p.reference && `· ${p.reference}`} {p.received_by_name && `· received by ${p.received_by_name}`}
                    </div>
                  </div>
                  <div className="text-emerald-300 font-semibold tabular-nums">+${p.amount?.toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button data-testid="send-receipt-cta" onClick={() => navigate(`/wrecker/jobs/${id}/receipt`)} variant="outline" className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10">
              <Send className="w-4 h-4 mr-1" /> Send Receipt
            </Button>
          </div>
        </Card>
      )}

      {tab === 'files' && (
        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4" data-testid="files-tab">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400">Files & Documents</div>
              <div className="text-xs text-slate-500 mt-0.5">Attach PDFs, police reports, insurance docs, dispatch sheets. 15 MB per file.</div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={fileCategory} onValueChange={setFileCategory}>
                <SelectTrigger data-testid="file-category-select" className="bg-[#07090d] border-white/10 text-white w-40 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="police_report">Police Report</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="dispatch_sheet">Dispatch Sheet</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <label className="inline-flex items-center gap-1 bg-amber-500 text-black hover:bg-amber-400 rounded-md px-3 h-9 cursor-pointer text-sm font-semibold transition" data-testid="file-upload-btn">
                <Upload className="w-4 h-4" />
                <span>Upload</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f, fileCategory);
                    e.target.value = '';
                  }}
                  disabled={busy}
                />
              </label>
            </div>
          </div>

          {filesLoading ? (
            <div className="py-8 text-center text-slate-500 text-sm">Loading files…</div>
          ) : files.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm" data-testid="files-empty">
              <Paperclip className="w-10 h-10 mx-auto mb-2 text-slate-700" />
              No files attached yet. Tap <span className="text-amber-400 font-semibold">Upload</span> to add one.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 py-2.5" data-testid={`job-file-${f.id}`}>
                  <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
                    <FileIcon className="w-5 h-5 text-sky-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white truncate font-medium">{f.name}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                      <span className="uppercase tracking-wider">{(f.category || 'other').replace(/_/g, ' ')}</span>
                      {f.size ? <span>· {formatBytes(f.size)}</span> : null}
                      {f.uploaded_at ? <span>· {new Date(f.uploaded_at).toLocaleString()}</span> : null}
                      {f.uploaded_by_name ? <span>· by {f.uploaded_by_name}</span> : null}
                    </div>
                  </div>
                  <button data-testid={`file-view-${f.id}`} onClick={() => viewFile(f.id)} title="View" className="p-2 text-slate-400 hover:text-sky-300 hover:bg-white/5 rounded transition">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button data-testid={`file-download-${f.id}`} onClick={() => downloadFile(f.id, f.name)} title="Download" className="p-2 text-slate-400 hover:text-emerald-300 hover:bg-white/5 rounded transition">
                    <Download className="w-4 h-4" />
                  </button>
                  <button data-testid={`file-delete-${f.id}`} onClick={() => deleteFile(f.id)} title="Delete" className="p-2 text-slate-500 hover:text-red-400 hover:bg-white/5 rounded transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Subcomponents
function ActionPill({ icon: Icon, label, badge, active, highlight, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border transition text-xs font-medium
        ${active ? 'bg-amber-500 text-black border-amber-400' :
          highlight ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15' :
          'bg-white/[0.03] text-slate-300 border-white/10 hover:bg-white/5 hover:text-white'}`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
      {badge != null && badge > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-black/20 text-black' : 'bg-amber-500/20 text-amber-300'}`}>{badge}</span>
      )}
      {highlight && <Check className="w-3 h-3 text-emerald-400" />}
    </button>
  );
}

function Field({ label, value, icon, mono, full }) {
  return (
    <div className={full ? 'col-span-2 md:col-span-3' : ''}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1">{icon}{label}</div>
      <div className={`text-sm text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</div>
    </div>
  );
}

function LocationRow({ label, address, lat, lng, icon }) {
  if (!address) return null;
  const mapsUrl = navUrl(address, lat, lng);
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="text-sm text-white">{address}</div>
      </div>
      <a href={mapsUrl} target="_blank" rel="noreferrer" data-testid={`directions-${label.toLowerCase().replace(/\s+/g, '-')}`} className="shrink-0 text-sky-300 hover:text-sky-200 p-1 hover:bg-sky-500/10 rounded transition" title={`Open in ${NAV_APPS.find((n) => n.key === getNavApp())?.label || 'Maps'}`}>
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}

function NavAppPicker() {
  const [current, setCurrent] = useState(getNavApp());
  useEffect(() => {
    const handler = (e) => setCurrent(e.detail);
    window.addEventListener('hp-nav-app-change', handler);
    return () => window.removeEventListener('hp-nav-app-change', handler);
  }, []);
  const cycle = () => {
    const idx = NAV_APPS.findIndex((n) => n.key === current);
    const next = NAV_APPS[(idx + 1) % NAV_APPS.length];
    setNavApp(next.key);
    setCurrent(next.key);
    toast.success(`Nav app: ${next.label}`);
  };
  const meta = NAV_APPS.find((n) => n.key === current) || NAV_APPS[0];
  return (
    <button
      type="button"
      onClick={cycle}
      data-testid="nav-app-picker"
      className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] uppercase tracking-wider border border-white/10 bg-white/[0.03] text-slate-300 hover:text-white hover:bg-white/5 transition"
      title="Tap to change nav app"
    >
      <ExternalLink className="w-3 h-3 text-sky-300" />
      <span>Nav: {meta.short}</span>
    </button>
  );
}

function Total({ label, value, bold, muted, green, red }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'text-base' : 'text-sm'}`}>
      <span className={muted ? 'text-slate-500' : red ? 'text-red-300' : green ? 'text-emerald-300' : 'text-slate-300'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${red ? 'text-red-300' : green ? 'text-emerald-300' : 'text-white'}`}>${Math.abs(value).toFixed(2)}{value < 0 ? '' : ''}</span>
    </div>
  );
}
