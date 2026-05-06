import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera, Search, Calendar, X, Download, ExternalLink, Loader2, Image as ImageIcon,
  Filter, Hash, ZoomIn,
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
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (plate) params.set('plate', plate);
      if (stage && stage !== 'all') params.set('stage', stage);
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      params.set('limit', '300');
      const r = await api.get(`/wrecker/photos/vault?${params.toString()}`);
      setPhotos(r.data.photos || []);
      setCount(r.data.count || 0);
    } catch (e) {
      toast.error('Could not load photo vault');
    } finally {
      setLoading(false);
    }
  }, [q, plate, stage, start, end]);

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

  const clearFilters = () => { setQ(''); setPlate(''); setStage('all'); setStart(''); setEnd(''); };
  const hasFilters = q || plate || (stage && stage !== 'all') || start || end;

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="wrecker-photo-vault-page">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" /> Office · Photo Vault
          </div>
          <h1 className="text-3xl font-bold text-white mt-1" data-testid="vault-page-title">Claims Defense Archive</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Every photo from every job, timestamped and searchable. When a customer claims you damaged their car &mdash; you&apos;ve got the receipts.
          </p>
        </div>
        <Badge variant="outline" className="border-white/10 text-slate-300" data-testid="vault-count">
          <ImageIcon className="w-3 h-3 mr-1.5" /> {count} photo{count === 1 ? '' : 's'}
        </Badge>
      </header>

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
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">{lightbox.customer_name || 'Unknown customer'}</div>
                <div className="text-xs text-slate-400 truncate">{lightbox.vehicle} {lightbox.plate && `· ${lightbox.plate}`}</div>
              </div>
              <Button onClick={() => setLightbox(null)} variant="ghost" size="icon" className="text-slate-400 hover:text-white" data-testid="vault-lightbox-close">
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
                {lightbox.taken_by_name && <span className="text-xs text-slate-500">· by {lightbox.taken_by_name}</span>}
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
      <div className="aspect-square bg-black/40 overflow-hidden">
        {photo.thumb_url ? (
          <img src={photo.thumb_url} alt={photo.stage} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600"><ImageIcon className="w-8 h-8" /></div>
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
