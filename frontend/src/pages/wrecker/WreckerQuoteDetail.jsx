// WreckerQuoteDetail — Mike's "review before dispatch" screen.
//
// Lives at /wrecker/quotes/:id. Renders any tow_job document (regardless
// of status) but is purpose-built for jobs whose status === 'quote' —
// the pre-dispatch state where the dispatcher gets the customer to
// approve the price before a truck rolls.
//
// Layout (top → bottom):
//   1. Header: back, Call # / quote ID, status pill
//   2. Action bar: Email Quote · Print · CONVERT TO JOB
//   3. Map preview (Mapbox) of pickup → dropoff
//   4. Two-column collapsible blocks: Pickup, Destination
//   5. Vehicle + Customer summary cards
//   6. Charges panel (read-only summary of the line items)
//   7. Photos gallery
//   8. Status timeline (audit trail)
//
// Built deliberately to mirror standard tow-industry workflow without
// using the trade-dressed name. Custom dark/amber styling per V2 spec.

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ArrowLeft, MapPin, Truck, Phone, Mail, User, FileText, Clock,
  ChevronDown, Send, Printer, ArrowRight, CheckCircle2, AlertCircle,
  DollarSign, Camera, Hash, Image as ImageIcon, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const STATUS_PILL = {
  quote:        { label: 'Quote',        bg: 'bg-amber-500/15  text-amber-200  border-amber-500/30' },
  pending:      { label: 'Pending',      bg: 'bg-sky-500/15    text-sky-200    border-sky-500/30' },
  assigned:     { label: 'Dispatched',   bg: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30' },
  en_route:     { label: 'En Route',     bg: 'bg-violet-500/15 text-violet-200 border-violet-500/30' },
  on_scene:     { label: 'On Scene',     bg: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/30' },
  towing:       { label: 'Towing',       bg: 'bg-purple-500/15 text-purple-200 border-purple-500/30' },
  dest_arrival: { label: 'At Drop-off',  bg: 'bg-cyan-500/15   text-cyan-200   border-cyan-500/30' },
  completed:    { label: 'Completed',    bg: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' },
  cancelled:    { label: 'Cancelled',    bg: 'bg-rose-500/15   text-rose-200   border-rose-500/30' },
};

const fmt$ = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export default function WreckerQuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [mapboxToken, setMapboxToken] = useState('');

  // Email dialog
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  // Photo upload
  const [photoUploading, setPhotoUploading] = useState(false);

  /* ─── Load job ─────────────────────────────────────────────────── */
  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/wrecker/jobs/${id}`);
      setJob(r.data);
      // Pre-fill email field from customer record if available
      if (r.data?.customer?.email) setEmailTo(r.data.customer.email);
    } catch (e) {
      toast.error('Quote not found.');
      navigate('/wrecker');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // Pull Mapbox token once for the static-map preview
  useEffect(() => {
    api.get('/mapbox/config').then((r) => setMapboxToken(r?.data?.token || '')).catch(() => {});
  }, []);

  /* ─── Computed totals (matches WreckerJobNew math) ─────────────── */
  const totals = useMemo(() => {
    if (!job) return { subtotal: 0, discount: 0, fuel: 0, tax: 0, total: 0 };
    const lines = Array.isArray(job.charges) ? job.charges : [];
    const subtotal = lines.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const discount = Number(job.discount) || 0;
    const fuel = ((Number(job.fuel_surcharge_pct) || 0) / 100) * Math.max(0, subtotal - discount);
    const tax = ((Number(job.tax_rate_pct) || 0) / 100) * Math.max(0, subtotal - discount + fuel);
    const total = Math.max(0, subtotal - discount + fuel + tax);
    return { subtotal, discount, fuel, tax, total };
  }, [job]);

  /* ─── Mapbox static map URL ────────────────────────────────────── */
  const mapStaticUrl = useMemo(() => {
    if (!mapboxToken || !job) return null;
    const p = job.pickup, d = job.dropoff;
    const hasPickup = p && (p.lat || p.lng);
    const hasDrop = d && (d.lat || d.lng);
    const markers = [];
    if (hasPickup) markers.push(`pin-l-a+f59e0b(${p.lng},${p.lat})`);
    if (hasDrop) markers.push(`pin-l-b+10b981(${d.lng},${d.lat})`);
    if (markers.length === 0) return null;
    const overlay = markers.join(',');
    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlay}/auto/640x300@2x?access_token=${mapboxToken}&padding=60,60,60,60`;
  }, [mapboxToken, job]);

  /* ─── Actions ──────────────────────────────────────────────────── */
  const convert = async () => {
    if (!job) return;
    setConverting(true);
    try {
      const r = await api.post(`/wrecker/jobs/${id}/convert`);
      toast.success(`Quote converted — now ${STATUS_PILL[r.data.status]?.label || r.data.status}.`);
      setJob(r.data);
      // Push the dispatcher onto the live cockpit
      setTimeout(() => navigate(`/wrecker/jobs/${id}`), 600);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Conversion failed.');
    } finally {
      setConverting(false);
    }
  };

  const sendEmail = async () => {
    if (!emailTo.includes('@')) { toast.error('Valid email required.'); return; }
    setEmailSending(true);
    try {
      await api.post(`/wrecker/jobs/${id}/email-quote`, { to: emailTo });
      toast.success(`Quote emailed to ${emailTo}.`);
      setEmailOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Email send failed.');
    } finally {
      setEmailSending(false);
    }
  };

  const handlePrint = () => {
    window.open(`/wrecker/jobs/${id}/print`, '_blank', 'noopener,noreferrer');
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotoUploading(true);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        await api.post(`/wrecker/jobs/${id}/photo`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      toast.success(`${files.length} photo${files.length === 1 ? '' : 's'} added.`);
      load();
    } catch (err) {
      toast.error('Photo upload failed.');
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  /* ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto" data-testid="quote-detail-loading">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-64" />
          <div className="h-72 bg-white/5 rounded" />
          <div className="h-32 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  if (!job) return null;

  const pill = STATUS_PILL[job.status] || STATUS_PILL.pending;
  const isQuote = job.status === 'quote';
  const isConvertible = job.status === 'quote' || job.status === 'pending';
  const callNo = job.call_number ? `#${job.call_number}` : `#${(job.id || '').slice(-6).toUpperCase()}`;

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5 pb-24" data-testid="quote-detail">
      {/* HEADER ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            className="border-white/10 text-slate-300 shrink-0"
            data-testid="quote-back"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-white" data-testid="quote-title">
                Quote {callNo}
              </h1>
              <Badge className={`border ${pill.bg}`} data-testid="quote-status-pill">{pill.label}</Badge>
              {job.converted_at && (
                <Badge className="border bg-emerald-500/15 text-emerald-200 border-emerald-500/30">
                  Converted
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {job.customer?.name || 'No customer'} · {job.vehicle?.year} {job.vehicle?.make} {job.vehicle?.model}
            </p>
          </div>
        </div>

        {/* Quick badges */}
        <div className="hidden md:flex flex-col items-end gap-1 text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1"><Hash className="w-3 h-3" /> {(job.id || '').slice(0, 8)}</div>
          <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {job.created_at ? new Date(job.created_at).toLocaleString() : '—'}</div>
        </div>
      </div>

      {/* ACTION BAR ─────────────────────────────────────────────── */}
      <Card className="bg-[#0a0e14] border-white/5 p-4" data-testid="quote-action-bar">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setEmailOpen(true)}
            className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-semibold"
            data-testid="quote-email"
          >
            <Send className="w-4 h-4 mr-1.5" /> Email Quote
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handlePrint}
            className="border-white/10 text-slate-300 hover:bg-white/5"
            data-testid="quote-print"
          >
            <Printer className="w-4 h-4 mr-1.5" /> Print
          </Button>
          <Link to={`/wrecker/jobs/${id}`}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/10 text-slate-300 hover:bg-white/5"
              data-testid="quote-job-detail"
            >
              <Truck className="w-4 h-4 mr-1.5" /> Open Job Detail
            </Button>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {job.quote_emailed_to && (
              <span className="text-xs text-emerald-300/80 hidden sm:inline" data-testid="quote-emailed-status">
                <CheckCircle2 className="w-3 h-3 inline mr-1" />
                Sent to {job.quote_emailed_to}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              disabled={!isConvertible || converting}
              onClick={convert}
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold disabled:opacity-50"
              data-testid="quote-convert"
            >
              {converting
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Converting…</>
                : <>{isQuote ? 'CONVERT TO JOB' : 'DISPATCH'} <ArrowRight className="w-4 h-4 ml-1.5" /></>}
            </Button>
          </div>
        </div>
      </Card>

      {/* MAP PREVIEW ────────────────────────────────────────────── */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="quote-map">
        {mapStaticUrl ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(job.pickup?.address || '')}&destination=${encodeURIComponent(job.dropoff?.address || '')}`}
            target="_blank"
            rel="noreferrer"
            className="block hover:opacity-95 transition-opacity"
          >
            <img
              src={mapStaticUrl}
              alt="Pickup → Dropoff route"
              className="w-full h-[300px] object-cover"
              data-testid="quote-map-image"
            />
          </a>
        ) : (
          <div className="w-full h-[200px] flex items-center justify-center bg-[#07090d] text-slate-600 text-sm">
            <MapPin className="w-5 h-5 mr-2" /> No locations on this quote yet
          </div>
        )}
        <div className="p-4 grid grid-cols-2 gap-4 text-xs border-t border-white/5">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber-300/70 font-bold mb-1">Loaded Miles</div>
            <div className="text-white font-semibold text-sm" data-testid="quote-loaded-miles">
              {job.loaded_miles ? `${job.loaded_miles.toFixed(1)} mi` : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Deadhead</div>
            <div className="text-slate-300 font-semibold text-sm" data-testid="quote-deadhead-miles">
              {job.deadhead_miles ? `${job.deadhead_miles.toFixed(1)} mi` : '—'}
            </div>
          </div>
        </div>
      </Card>

      {/* PICKUP + DROPOFF ──────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <LocationBlock label="Pickup" data={job.pickup} accent="amber" testid="quote-pickup-block" />
        <LocationBlock label="Destination" data={job.dropoff} accent="emerald" testid="quote-dropoff-block" />
      </div>

      {/* CUSTOMER + VEHICLE ────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-[#0a0e14] border-white/5 p-5" data-testid="quote-customer">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-amber-300" />
            <h3 className="text-sm font-semibold text-white">Customer</h3>
          </div>
          <div className="space-y-2 text-sm">
            <KV label="Name" value={job.customer?.name} />
            <KV label="Phone" value={job.customer?.phone} icon={Phone} />
            <KV label="Email" value={job.customer?.email} icon={Mail} />
          </div>
        </Card>

        <Card className="bg-[#0a0e14] border-white/5 p-5" data-testid="quote-vehicle">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-4 h-4 text-amber-300" />
            <h3 className="text-sm font-semibold text-white">Vehicle</h3>
          </div>
          <div className="space-y-2 text-sm">
            <KV label="Year/Make/Model" value={`${job.vehicle?.year || ''} ${job.vehicle?.make || ''} ${job.vehicle?.model || ''}`.trim() || '—'} />
            <KV label="Body Type" value={job.vehicle?.body_type} />
            <KV label="Drive" value={job.vehicle?.drive_type} />
            <KV label="VIN" value={job.vehicle?.vin} />
            <KV label="Plate" value={job.vehicle?.plate} />
          </div>
        </Card>
      </div>

      {/* CHARGES SUMMARY ────────────────────────────────────────── */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="quote-charges">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-300" />
            <h3 className="text-sm font-semibold text-white">Charges</h3>
            <Badge className="bg-white/5 border-white/10 text-slate-400 text-[10px]">
              {(job.charges || []).length} line{(job.charges || []).length === 1 ? '' : 's'}
            </Badge>
          </div>
          <Link to={`/wrecker/jobs/${id}`}>
            <Button type="button" size="sm" variant="outline" className="border-white/10 text-slate-300 hover:bg-white/5">
              Edit charges
            </Button>
          </Link>
        </div>
        <div className="p-5">
          {(job.charges || []).length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-6">
              No charges yet — add them in the job detail.
            </div>
          ) : (
            <div className="space-y-1.5 mb-4">
              {(job.charges || []).map((c, idx) => (
                <div key={c.id || idx} className="flex items-center justify-between text-sm py-1.5" data-testid={`quote-charge-${idx}`}>
                  <div className="text-slate-300 truncate flex-1">{c.label || c.type || 'Charge'}</div>
                  <div className="text-white font-semibold tabular-nums">{fmt$(c.amount)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-white/5 pt-3 space-y-1.5 text-sm">
            <SummaryLine label="Subtotal" value={totals.subtotal} />
            {totals.discount > 0 && <SummaryLine label="Discount" value={-totals.discount} negative />}
            {totals.fuel > 0 && <SummaryLine label={`Fuel surcharge${job.fuel_surcharge_pct ? ` (${job.fuel_surcharge_pct}%)` : ''}`} value={totals.fuel} />}
            {totals.tax > 0 && <SummaryLine label={`Tax${job.tax_rate_pct ? ` (${job.tax_rate_pct}%)` : ''}`} value={totals.tax} />}
            <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
              <div className="text-amber-300 font-bold uppercase tracking-wider text-xs">Total Quote</div>
              <div className="text-amber-200 font-bold text-xl tabular-nums" data-testid="quote-total">{fmt$(totals.total)}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* PHOTOS ────────────────────────────────────────────────── */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="quote-photos">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-amber-300" />
            <h3 className="text-sm font-semibold text-white">Photos</h3>
            <Badge className="bg-white/5 border-white/10 text-slate-400 text-[10px]">
              {(job.photo_urls || []).length}
            </Badge>
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoUpload}
              data-testid="quote-photo-input"
            />
            <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400">
              {photoUploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 mr-1" />}
              Add photos
            </span>
          </label>
        </div>
        <div className="p-5">
          {(job.photo_urls || []).length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-6">
              No photos yet. Add them so customers see proof of condition.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {(job.photo_urls || []).map((url, idx) => (
                <a key={idx} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded border border-white/5 hover:opacity-90 transition" data-testid={`quote-photo-${idx}`}>
                  <img src={url} alt={`Quote photo ${idx + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* STATUS TIMELINE (audit) ───────────────────────────────── */}
      {Array.isArray(job.status_history) && job.status_history.length > 0 && (
        <Collapsible className="bg-[#0a0e14] border border-white/5 rounded-lg" data-testid="quote-timeline">
          <CollapsibleTrigger className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-white">Audit Trail</span>
              <Badge className="bg-white/5 border-white/10 text-slate-400 text-[10px]">
                {job.status_history.length}
              </Badge>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-5 pb-5">
            <div className="space-y-2 text-xs border-l border-white/10 pl-4">
              {[...job.status_history].reverse().map((h, idx) => (
                <div key={idx} className="relative">
                  <div className="absolute -left-[19px] top-1.5 w-2 h-2 rounded-full bg-amber-400" />
                  <div className="text-slate-300">
                    {h.note || (h.status ? `Status → ${STATUS_PILL[h.status]?.label || h.status}` : 'Update')}
                  </div>
                  <div className="text-slate-600 text-[10px]">
                    {h.at ? new Date(h.at).toLocaleString() : '—'}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* EMAIL DIALOG ──────────────────────────────────────────── */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-md" data-testid="quote-email-dialog">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Send className="w-5 h-5 text-sky-300" /> Email this quote
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Send the customer a link to review the quote before you dispatch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                Customer email
              </label>
              <Input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendEmail(); }}
                placeholder="alice@example.com"
                className="mt-1 bg-[#07090d] border-white/10 text-white"
                data-testid="quote-email-to"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmailOpen(false)}
                className="border-white/10 text-slate-300"
                data-testid="quote-email-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={sendEmail}
                disabled={emailSending || !emailTo.includes('@')}
                className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-bold"
                data-testid="quote-email-send"
              >
                {emailSending
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Sending…</>
                  : <><Send className="w-4 h-4 mr-1.5" /> Send</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * SUB-COMPONENTS
 * ─────────────────────────────────────────────────────────────── */

function LocationBlock({ label, data, accent, testid }) {
  const [open, setOpen] = useState(true);
  const has = data && (data.address || data.lat);
  const tint = accent === 'amber' ? 'text-amber-300' : 'text-emerald-300';

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="bg-[#0a0e14] border border-white/5 rounded-lg overflow-hidden" data-testid={testid}>
      <CollapsibleTrigger className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className={`w-4 h-4 ${tint} shrink-0`} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</div>
            <div className="text-sm font-semibold text-white truncate">
              {has ? (data.address || `${data.lat?.toFixed(4)}, ${data.lng?.toFixed(4)}`) : 'Not set'}
            </div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-5 pb-5 pt-0">
        {has ? (
          <div className="space-y-1.5 text-sm">
            {data.address && <KV label="Address" value={data.address} />}
            {(data.lat || data.lng) && <KV label="Coords" value={`${data.lat?.toFixed(5)}, ${data.lng?.toFixed(5)}`} />}
            {data.notes && <KV label="Notes" value={data.notes} />}
            {data.contact && <KV label="Contact" value={data.contact} />}
          </div>
        ) : (
          <div className="text-xs text-slate-500 py-2">
            <AlertCircle className="w-3 h-3 inline mr-1" />
            No location captured. Add it on the job detail screen.
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function KV({ label, value, icon: Icon }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <div className="w-24 text-[10px] uppercase tracking-widest text-slate-500 font-semibold pt-0.5 shrink-0">
        {label}
      </div>
      <div className="text-slate-200 flex items-center gap-1.5 min-w-0 break-words">
        {Icon && <Icon className="w-3 h-3 text-slate-500 shrink-0" />}
        {value || <span className="text-slate-600">—</span>}
      </div>
    </div>
  );
}

function SummaryLine({ label, value, negative }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="text-slate-400">{label}</div>
      <div className={`tabular-nums font-medium ${negative ? 'text-rose-300' : 'text-slate-200'}`}>
        {negative ? `-${fmt$(Math.abs(value))}` : fmt$(value)}
      </div>
    </div>
  );
}
