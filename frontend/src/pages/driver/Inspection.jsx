import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Camera, Check, AlertTriangle, MinusCircle, Loader2,
  ClipboardCheck, X, Pencil, Save, ChevronDown, ChevronUp, Mic,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { setCopilotScreenContext, clearCopilotScreenContext } from '@/lib/copilotContext';
import { toast } from 'sonner';
import { openCameraAsDataUrl } from '@/lib/photoCapture';

// =============================================================
// Inspection page — form-based DVIR with H1 / H2 / H3 hierarchy
// Spec: 1 H1 ("New Inspection"), 9 H2 sections, ~58–69 H3 items.
// Each check item: Pass / Fail / N/A slider + comment + camera.
// Each text item (truck details): text input + optional camera.
// Photos stay IN the app — uploaded to backend, never camera roll.
// "Sign" button (top-right) → /driver/inspection/:id/sign
// =============================================================

const STATUS_META = {
  pass:    { label: 'Pass',   icon: Check,          color: 'emerald', cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' },
  defect:  { label: 'Fail',   icon: AlertTriangle,  color: 'red',     cls: 'bg-red-500/15 border-red-500/40 text-red-200' },
  na:      { label: 'N/A',    icon: MinusCircle,    color: 'slate',   cls: 'bg-slate-500/15 border-slate-500/40 text-slate-300' },
  pending: { label: 'Pending', icon: Loader2,        color: 'sky',     cls: 'bg-white/[0.03] border-white/10 text-slate-400' },
};

const STATUS_BUTTONS = ['pass', 'defect', 'na'];

function PhotoThumb({ photo, onDelete }) {
  return (
    <div className="relative group rounded-md overflow-hidden border border-white/10 w-16 h-16 shrink-0" data-testid={`photo-${photo.id}`}>
      <img src={photo.data_url} alt={photo.label || 'photo'} className="w-full h-full object-cover" />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete?.(photo); }}
        className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition"
        data-testid={`delete-photo-${photo.id}`}
      >
        <X className="w-3 h-3" />
      </button>
      {photo.label && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] uppercase tracking-wider px-1 truncate">
          {photo.label}
        </div>
      )}
    </div>
  );
}

function CheckItem({ item, onUpdate, onAddPhoto, onDeletePhoto, busy }) {
  const Icon = STATUS_META[item.status || 'pending'].icon;
  const [showComment, setShowComment] = useState(!!item.note);

  const setStatus = (s) => onUpdate?.(item.key, { status: s });
  const setNote = (note) => onUpdate?.(item.key, { note });

  return (
    <div className="border-t border-white/5 first:border-t-0 py-3" data-testid={`item-${item.key}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        {/* H3 — item label */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h3 className="text-sm text-slate-200 font-medium leading-snug">{item.label}</h3>
        </div>

        {/* Pass / Fail / N/A toggle group */}
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          {STATUS_BUTTONS.map((s) => {
            const meta = STATUS_META[s];
            const active = item.status === s;
            const SIcon = meta.icon;
            return (
              <button
                key={s}
                type="button"
                data-testid={`status-${item.key}-${s}`}
                onClick={() => setStatus(s)}
                disabled={busy}
                className={`px-2.5 py-1.5 rounded-md text-[11px] uppercase tracking-wider font-semibold border transition flex items-center gap-1
                  ${active ? meta.cls : 'bg-transparent border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300'}`}
              >
                <SIcon className="w-3 h-3" />
                {meta.label}
              </button>
            );
          })}

          {/* Comment toggle */}
          <button
            type="button"
            data-testid={`note-toggle-${item.key}`}
            onClick={() => setShowComment(!showComment)}
            className={`p-1.5 rounded-md border transition ${item.note ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300'}`}
            title="Add comment"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          {/* Camera */}
          <button
            type="button"
            data-testid={`photo-${item.key}`}
            onClick={() => onAddPhoto?.(item)}
            disabled={busy}
            className="p-1.5 rounded-md border border-white/10 text-slate-400 hover:border-sky-500/40 hover:text-sky-300 hover:bg-sky-500/10 transition relative"
            title="Take photo"
          >
            <Camera className="w-3.5 h-3.5" />
            {item.photos?.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-sky-500 text-black text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {item.photos.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Comment / note */}
      {showComment && (
        <div className="mt-2">
          <Input
            data-testid={`note-input-${item.key}`}
            value={item.note || ''}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)"
            className="bg-[#07090d] border-white/10 text-white text-sm h-9"
          />
        </div>
      )}

      {/* Photos */}
      {item.photos?.length > 0 && (
        <div className="mt-2 flex gap-2 flex-wrap">
          {item.photos.map((p) => (
            <PhotoThumb key={p.id} photo={p} onDelete={onDeletePhoto} />
          ))}
        </div>
      )}
    </div>
  );
}

function TextItem({ item, onUpdate, onAddPhoto, onDeletePhoto, busy }) {
  const setVal = (value) => onUpdate?.(item.key, { value });
  return (
    <div className="border-t border-white/5 first:border-t-0 py-3" data-testid={`item-${item.key}`}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <h3 className="text-sm text-slate-200 font-medium">
          {item.label}
          {item.required && <span className="text-amber-400 ml-1">*</span>}
          {item.optional && <span className="text-slate-500 text-[10px] ml-2 font-normal">optional</span>}
          {item.max && <span className="text-slate-500 text-[10px] ml-2 font-normal">0 / {item.max} chars</span>}
        </h3>
        {item.allow_photo && (
          <button
            type="button"
            data-testid={`photo-${item.key}`}
            onClick={() => onAddPhoto?.(item)}
            disabled={busy}
            className="p-1.5 rounded-md border border-white/10 text-slate-400 hover:border-sky-500/40 hover:text-sky-300 hover:bg-sky-500/10 transition relative shrink-0"
          >
            <Camera className="w-3.5 h-3.5" />
            {item.photos?.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-sky-500 text-black text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {item.photos.length}
              </span>
            )}
          </button>
        )}
      </div>
      {item.type === 'textarea' ? (
        <Textarea
          data-testid={`field-${item.key}`}
          value={item.value || ''}
          onChange={(e) => setVal(e.target.value.slice(0, item.max || 1000))}
          placeholder={item.label}
          rows={3}
          className="bg-[#07090d] border-white/10 text-white text-sm resize-none"
        />
      ) : (
        <Input
          data-testid={`field-${item.key}`}
          type={item.type === 'number' ? 'number' : 'text'}
          value={item.value || ''}
          onChange={(e) => setVal(e.target.value)}
          placeholder={item.label}
          className="bg-[#07090d] border-white/10 text-white"
        />
      )}
      {item.photos?.length > 0 && (
        <div className="mt-2 flex gap-2 flex-wrap">
          {item.photos.map((p) => (
            <PhotoThumb key={p.id} photo={p} onDelete={onDeletePhoto} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label, count, total, collapsed, onToggle }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 py-3 group"
      data-testid={`section-toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
    >
      {/* H2 — section title */}
      <div className="flex items-center gap-3 min-w-0">
        <h2 className="text-base font-bold text-white tracking-tight">{label}</h2>
        <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-semibold ${pct === 100 ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' : pct > 0 ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300' : 'bg-white/5 border border-white/10 text-slate-500'}`}>
          {count} / {total}
        </span>
      </div>
      {collapsed ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
    </button>
  );
}

export default function Inspection() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [sectionLabels, setSectionLabels] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await api.get('/inspections/template');
      setSectionLabels(t.data.section_labels || {});

      // If id present → load existing; else create new
      let resp;
      if (id) {
        resp = await api.get(`/inspections/${id}`);
      } else {
        const inspectionType = search.get('type') === 'post_trip' ? 'post_trip' : 'pre_trip';
        resp = await api.post('/inspections', { inspection_type: inspectionType });
        // Replace URL with the new id
        if (resp.data?.id) navigate(`/driver/inspection/${resp.data.id}`, { replace: true });
      }
      setDoc(resp.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not load inspection');
    } finally {
      setLoading(false);
    }
  }, [id, search, navigate]);

  useEffect(() => { load(); }, [load]);

  // Group items by section
  const grouped = useMemo(() => {
    const out = {};
    (doc?.items || []).forEach((it) => {
      out[it.section] = out[it.section] || [];
      out[it.section].push(it);
    });
    return out;
  }, [doc]);

  // Section completion progress
  const sectionProgress = useMemo(() => {
    const out = {};
    Object.entries(grouped).forEach(([section, items]) => {
      const done = items.filter((i) => {
        if (i.type === 'check') return i.status && i.status !== 'pending';
        return !!(i.value || i.optional);
      }).length;
      out[section] = { done, total: items.length };
    });
    return out;
  }, [grouped]);

  // Update an item locally + push to server (debounced manually via direct save)
  const updateItem = useCallback(async (key, patch) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((it) => (it.key === key ? { ...it, ...patch, updated_at: new Date().toISOString() } : it));
      return { ...prev, items };
    });
    try {
      await api.put(`/inspections/${id || doc.id}/item`, { key, ...patch });
    } catch (e) {
      toast.error('Save failed — try again');
    }
  }, [id, doc?.id]);

  const addPhoto = useCallback(async (item) => {
    try {
      const dataUrl = await openCameraAsDataUrl();
      if (!dataUrl) return; // user cancelled
      setSaving(true);
      const r = await api.post(`/inspections/${id || doc.id}/photo`, { key: item.key, data_url: dataUrl });
      // Push the new photo into local state
      setDoc((prev) => {
        if (!prev) return prev;
        const items = prev.items.map((it) => {
          if (it.key !== item.key) return it;
          const newPhoto = { id: r.data.photo_id, data_url: dataUrl, taken_at: new Date().toISOString() };
          return { ...it, photos: [...(it.photos || []), newPhoto] };
        });
        return { ...prev, items };
      });
      toast.success('Photo captured');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save photo');
    } finally { setSaving(false); }
  }, [id, doc?.id]);

  const deletePhoto = useCallback(async (photo) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      await api.delete(`/inspections/${id || doc.id}/photo/${photo.id}`);
      setDoc((prev) => {
        if (!prev) return prev;
        const items = prev.items.map((it) => ({ ...it, photos: (it.photos || []).filter((p) => p.id !== photo.id) }));
        return { ...prev, items };
      });
    } catch (e) { toast.error('Delete failed'); }
  }, [id, doc?.id]);

  const totalDone = useMemo(() => Object.values(sectionProgress).reduce((sum, p) => sum + p.done, 0), [sectionProgress]);
  const totalItems = useMemo(() => Object.values(sectionProgress).reduce((sum, p) => sum + p.total, 0), [sectionProgress]);

  useEffect(() => {
    setCopilotScreenContext({
      screen_key: 'driver_inspection',
      screen_state: {
        inspection_id: doc?.id || id || null,
        status: doc?.status || 'draft',
        completed_items: totalDone,
        total_items: totalItems,
      },
      draft_values: {
        inspection_type: doc?.inspection_type || null,
      },
    });
    return () => clearCopilotScreenContext('driver_inspection');
  }, [doc?.id, doc?.status, doc?.inspection_type, id, totalDone, totalItems]);

  if (loading) return <div className="p-8 text-slate-400">Loading inspection…</div>;
  if (!doc) return null;

  const isCertified = doc.status === 'certified';
  const sectionsOrder = Object.keys(grouped);

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      {/* Sticky header with H1 + SIGN button top-right */}
      <header className="sticky top-0 z-10 bg-[#0a0e14]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/driver" className="text-slate-400 hover:text-white shrink-0" data-testid="back-to-driver">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-amber-400">
                {doc.inspection_type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'} DVIR
              </div>
              {/* H1 */}
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight" data-testid="inspection-title">
                {isCertified ? 'Inspection Complete' : 'New Inspection'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400 hidden sm:inline">
              {totalDone} / {totalItems}
            </span>
            <div className="w-12 sm:w-20 h-1.5 rounded-full bg-white/5 overflow-hidden hidden sm:block">
              <div className="h-full bg-amber-500" style={{ width: `${totalItems ? (totalDone / totalItems) * 100 : 0}%` }} />
            </div>
            {!isCertified && (
              <Button
                data-testid="voice-walkthrough-cta"
                size="sm"
                variant="outline"
                onClick={() => navigate(`/driver/inspection/${doc.id}/voice`)}
                className="bg-sky-500/10 border-sky-500/40 text-sky-200 hover:bg-sky-500/20 hover:text-white font-semibold"
                title="Hands-free voice walkthrough"
              >
                <Mic className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Voice</span>
              </Button>
            )}
            {!isCertified ? (
              <Button
                data-testid="sign-cta"
                size="sm"
                onClick={() => navigate(`/driver/inspection/${doc.id}/sign`)}
                className="bg-amber-500 text-black hover:bg-amber-400 font-semibold"
              >
                <Save className="w-4 h-4 mr-1" />
                Sign
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold uppercase tracking-wider" data-testid="certified-badge">
                Certified
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-32">
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="pt-4 pb-2 text-xs text-slate-500 leading-relaxed">
          Walk every line. Hit <span className="text-emerald-400 font-semibold">Pass</span>, <span className="text-red-400 font-semibold">Fail</span>, or <span className="text-slate-300 font-semibold">N/A</span>. Use the camera to document anything iffy. When you're done, hit <span className="text-amber-400 font-semibold">Sign</span> up top.
        </motion.div>

        {sectionsOrder.map((section) => {
          const items = grouped[section];
          const label = sectionLabels[section] || section;
          const prog = sectionProgress[section] || { done: 0, total: 0 };
          const isCollapsed = collapsedSections[section] === true;
          return (
            <section key={section} className="mb-3 hp-panel rounded-xl px-4 sm:px-5">
              <SectionHeader
                label={label}
                count={prog.done}
                total={prog.total}
                collapsed={isCollapsed}
                onToggle={() => setCollapsedSections((c) => ({ ...c, [section]: !c[section] }))}
              />
              {!isCollapsed && (
                <div className="pb-2">
                  {items.map((item) =>
                    item.type === 'check' ? (
                      <CheckItem
                        key={item.key}
                        item={item}
                        busy={isCertified}
                        onUpdate={isCertified ? undefined : updateItem}
                        onAddPhoto={isCertified ? undefined : addPhoto}
                        onDeletePhoto={isCertified ? undefined : deletePhoto}
                      />
                    ) : (
                      <TextItem
                        key={item.key}
                        item={item}
                        busy={isCertified}
                        onUpdate={isCertified ? undefined : updateItem}
                        onAddPhoto={isCertified ? undefined : addPhoto}
                        onDeletePhoto={isCertified ? undefined : deletePhoto}
                      />
                    )
                  )}
                </div>
              )}
            </section>
          );
        })}

        {!isCertified && (
          <div className="mt-6">
            <Button
              data-testid="sign-cta-bottom"
              size="lg"
              onClick={() => navigate(`/driver/inspection/${doc.id}/sign`)}
              className="w-full bg-amber-500 text-black hover:bg-amber-400 font-semibold h-12 text-base"
            >
              <ClipboardCheck className="w-5 h-5 mr-2" /> Review &amp; Sign
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
