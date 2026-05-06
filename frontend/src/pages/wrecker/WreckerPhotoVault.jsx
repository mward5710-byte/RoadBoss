import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera, Search, Calendar, X, Download, ExternalLink, Loader2, Image as ImageIcon,
  Filter, Hash, ZoomIn, User, Lock, FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const STAGE_OPTIONS = [
  { value: 'all',          label: 'All Stages' },
  { value: 'on_scene',     label: 'On Scene' },
  { value: 'pickup',       label: 'Pickup' },
  { value: 'pre_hookup',   label: 'Pre-Hookup' },
  { value: 'towing',       label: 'In Tow' },
  { value: 'dest_arrival', label: 'Destination' },
  { value: 'damage',       label: 'Damage' },
  { value: 'other',        label: 'Other' },
];

const STAGE_COLORS = {
  on_scene:     'bg-amber-500/15 border-amber-500/30 text-amber-300',
  pickup:       'bg-sky-500/15 border-sky-500/30 text-sky-300',
  pre_hookup:   'bg-violet-500/15 border-violet-500/30 text-violet-300',
  towing:       'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  dest_arrival: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300',
  damage:       'bg-rose-500/15 border-rose-500/30 text-rose-300',
  other:        'bg-slate-500/15 border-slate-500/30 text-slate-300',
};

export default function WreckerPhotoVault() {
  const [q, setQ] = useState('');
  const [plate, setPlate] = useState('');
  const [stage, setStage] = useState('all');
  const [driverId, setDriverId] = useState('all');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [photos, setPhotos] = useState([]);
  const [perDriver, setPerDriver] = useState([]);
  const [driverLocked, setDriverLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [count, setCount] = useState(0);
  const [lightbox, setLightbox] = useState(null);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (plate) params.set('plate', plate);
    if (stage && stage !== 'all') params.set('stage', stage);
    if (driverId && driverId !== 'all') params.set('driver_id', driverId);
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    return params;
  }, [q, plate, stage, driverId, start, end]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      params.set('limit', '300');
      const r = await api.get(`/wrecker/photos/vault?${params.toString()}`);
      setPhotos(r.data.photos || []);
      setCount(r.data.count || 0);
      setPerDriver(r.data.per_driver || []);
      setDriverLocked(!!r.data.driver_locked);
    } catch (e) {
      toast.error('Could not load photo vault');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { load(); }, [load]);

  const downloadPhoto = (p) => {
    try {
      if (!p.thumb_url) { toast.error('No image data'); return; }
      const a = document.createElement('a');
      a.href = p.thumb_url;
      const safe = (p.plate || p.customer_name || 'photo').replace(/[^a-z0-9]/gi, '-');
      a.download = `${safe}-${p.stage}-${(p.taken_at || '').slice(0, 10)}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast.error('Download failed'); }
  };

  const downloadCsv = async () => {
    setExporting(true);
    try {
      const params = buildParams();
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/wrecker/photos/export.csv?${params.toString()}`;
      const token = localStorage.getItem('hp_token');
      const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `photo_archive_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      toast.success('Photo archive CSV downloaded');
    } catch (e) {
      toast.error(`Export failed: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => { setQ(''); setPlate(''); setStage('all'); setDriverId('all'); setStart(''); setEnd(''); };
  const hasFilters = q || plate || (stage && stage !== 'all') || (driverId && driverId !== 'all') || start || end;

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="wrecker-photo-vault-page">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" /> {driverLocked ? 'My Photos' : 'Office · Photo Vault'}
          </div>
          <h1 className="text-3xl font-bold text-white mt-1" data-testid="vault-page-title">
            {driverLocked ? 'My Photos' : 'Claims Defense Archive'}
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            {driverLocked
              ? "Every photo you've taken on every job. These photos are tied to your account permanently — they're your evidence and your accountability."
              : "Every photo from every job, timestamped and locked to the driver who took it. Chain-of-custody preserved — when a customer disputes damage, you've got the receipts."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-white/10 text-slate-300" data-testid="vault-count">
            <ImageIcon className="w-3 h-3 mr-1.5" /> {count} photo{count === 1 ? '' : 's'}
          </Badge>
          {!driverLocked && (
            <Button onClick={downloadCsv} disabled={exporting} variant="outline" size="sm"
                    className="border-white/10 text-slate-300 hover:bg-white/5" data-testid="vault-export-csv">
              {exporting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />}
              Export Archive CSV
            </Button>
          )}
        </div>
      </header>

      {/* Driver-locked banner (only for drivers) */}
      {driverLocked && (
        <Card className="bg-sky-500/5 border-sky-500/20 p-3.5" data-testid="vault-driver-locked-banner">
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
            <div className="text-xs text-sky-200">
              <span className="font-semibold">Chain-of-custody locked.</span> You can only see your own photos.
              Each photo is tied to your driver record permanently — it cannot be reassigned or hidden.
              Take good ones, boss — they protect <em>you</em> when a customer claims damage.
            </div>
          </div>
        </Card>
      )}

      {/* Per-driver accountability chips (office only) */}
      {!driverLocked && perDriver.length > 0 && (
        <Card className="bg-[#0d1218] border-white/5 p-4" data-testid="vault-per-driver">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold flex items-center gap-1.5">
              <User className="w-3 h-3" /> Photos by Driver
              <span className="text-slate-600 normal-case tracking-normal text-[10px]">— click a driver to filter</span>
            </div>
            {driverId !== 'all' && (
              <Button onClick={() => setDriverId('all')} variant="ghost" size="sm" className="text-amber-300 h-7 text-xs" data-testid="vault-clear-driver">
                <X className="w-3 h-3 mr-1" /> Show all drivers
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {perDriver.map((d) => {
              const active = driverId === d.driver_id;
              return (
                <button
                  key={d.driver_id}
                  data-testid={`driver-chip-${d.driver_id}`}
                  onClick={() => setDriverId(active ? 'all' : d.driver_id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition ${
                    active
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      : 'bg-white/[0.02] border-white/10 text-slate-300 hover:border-amber-500/30 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold ${active ? 'bg-amber-500/30 text-amber-100' : 'bg-white/[0.06] text-slate-300'}`}>
                    {d.driver_name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{d.driver_name}</span>
                    <span className={`text-[10px] ${active ? 'text-amber-200/80' : 'text-slate-500'}`}>{d.count} photo{d.count === 1 ? '' : 's'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="bg-[#0d1218] border-white/5 p-4" data-testid="vault-filters">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5"><Search className="w-3 h-3" /> Search</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer / vehicle / VIN…"
                   data-testid="vault-q" className="bg-[#0a0e14] border-white/10 text-white" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5"><Hash className="w-3 h-3" /> Plate</Label>
            <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="e.g. IN-9382R"
                   data-testid="vault-plate" className="bg-[#0a0e14] border-white/10 text-white" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5"><Filter className="w-3 h-3" /> Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger data-testid="vault-stage" className="bg-[#0a0e14] border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> From</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                   data-testid="vault-start" className="bg-[#0a0e14] border-white/10 text-white" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> To</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                   data-testid="vault-end" className="bg-[#0a0e14] border-white/10 text-white" />
          </div>
        </div>
        {hasFilters && (
          <div className="mt-3 flex justify-end">
            <Button onClick={clearFilters} variant="ghost" size="sm" className="text-slate-400" data-testid="vault-clear">
              <X className="w-3.5 h-3.5 mr-1.5" /> Clear filters
            </Button>
          </div>
        )}
      </Card>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading photo vault…
        </div>
      ) : photos.length === 0 ? (
        <Card className="bg-[#0d1218] border-white/5 p-12 text-center" data-testid="vault-empty">
          <Camera className="w-10 h-10 mx-auto text-slate-600 mb-3" />
          <h3 className="text-white font-semibold">No photos match your filters</h3>
          <p className="text-slate-500 text-sm mt-1">Try clearing filters, or take more photos in the field — they&apos;ll show up here.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" data-testid="vault-grid">
          {photos.map((p) => (
            <PhotoCard key={p.photo_id} photo={p} onClick={() => setLightbox(p)} />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          data-testid="vault-lightbox"
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-5xl w-full max-h-[92vh] bg-[#0d1218] border border-white/10 rounded-xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-white/5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">{lightbox.customer_name || 'Unknown customer'}</div>
                <div className="text-xs text-slate-400 truncate">{lightbox.vehicle} {lightbox.plate && `· ${lightbox.plate}`}</div>
              </div>
              {/* Prominent driver attribution */}
              {lightbox.taken_by_name && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-lg shrink-0" data-testid="lightbox-driver">
                  <div className="w-7 h-7 rounded-full bg-amber-500/25 text-amber-200 flex items-center justify-center text-[10px] font-bold">
                    {lightbox.taken_by_name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="leading-tight">
                    <div className="text-[9px] uppercase tracking-widest text-amber-300/70">Photo by</div>
                    <div className="text-xs text-amber-100 font-semibold">{lightbox.taken_by_name}</div>
                  </div>
                </div>
              )}
              <Button onClick={() => setLightbox(null)} variant="ghost" size="icon" className="text-slate-400 hover:text-white shrink-0" data-testid="vault-lightbox-close">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 bg-black/40 flex items-center justify-center overflow-auto">
              <img src={lightbox.thumb_url} alt={lightbox.caption || lightbox.stage} className="max-w-full max-h-[70vh] object-contain" data-testid="vault-lightbox-img" />
            </div>
            <div className="p-4 border-t border-white/5 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`capitalize ${STAGE_COLORS[lightbox.stage] || STAGE_COLORS.other}`}>{lightbox.stage.replace(/_/g, ' ')}</Badge>
                <span className="text-xs text-slate-400">{new Date(lightbox.taken_at).toLocaleString()}</span>
                {/* Mobile: show driver name inline since the header chip is hidden */}
                {lightbox.taken_by_name && <span className="sm:hidden text-xs text-amber-300">· by {lightbox.taken_by_name}</span>}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => downloadPhoto(lightbox)} variant="outline" size="sm" className="border-white/10 text-slate-300" data-testid="vault-lightbox-download">
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                </Button>
                <Link to={`/wrecker/jobs/${lightbox.job_id}`}>
                  <Button variant="outline" size="sm" className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10" data-testid="vault-lightbox-job">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open Job
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoCard({ photo, onClick }) {
  return (
    <div
      onClick={onClick}
      data-testid={`vault-photo-${photo.photo_id}`}
      className="group relative bg-[#0d1218] border border-white/5 rounded-lg overflow-hidden cursor-pointer hover:border-amber-500/30 hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="aspect-square bg-black/40 overflow-hidden relative">
        {photo.thumb_url ? (
          <img src={photo.thumb_url} alt={photo.stage} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600"><ImageIcon className="w-8 h-8" /></div>
        )}
        {/* Driver attribution badge — burnt into the corner of every photo card */}
        {photo.taken_by_name && (
          <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-1 max-w-[calc(100%-12px)]" data-testid="photo-driver-badge">
            <User className="w-2.5 h-2.5 text-amber-300 shrink-0" />
            <span className="text-[10px] text-white truncate font-medium">{photo.taken_by_name}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <ZoomIn className="w-6 h-6 text-white drop-shadow" />
        </div>
      </div>
      <div className="p-2.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={`text-[9px] capitalize px-1.5 py-0 ${STAGE_COLORS[photo.stage] || STAGE_COLORS.other}`}>
            {(photo.stage || 'other').replace(/_/g, ' ')}
          </Badge>
          <span className="text-[10px] text-slate-500 ml-auto">{new Date(photo.taken_at).toLocaleDateString()}</span>
        </div>
        <div className="text-xs text-white truncate">{photo.customer_name || 'Unknown'}</div>
        <div className="text-[10px] text-slate-500 truncate">{photo.plate || photo.vehicle || '—'}</div>
      </div>
    </div>
  );
}
