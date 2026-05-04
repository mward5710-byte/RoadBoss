import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Eraser, ClipboardCheck, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { toast } from 'sonner';

/**
 * Signature pad — captures finger/stylus signature on a canvas, exports as base64.
 * Supports touch + mouse + pointer events.
 */
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const [empty, setEmpty] = useState(true);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b1120';
    ctx.lineWidth = 2.4;
  }, []);

  useEffect(() => {
    sizeCanvas();
    const onResize = () => sizeCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sizeCanvas]);

  const point = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;
    return { x, y };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const data = canvasRef.current.toDataURL('image/png');
    onChange?.(data);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange?.('');
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        data-testid="signature-canvas"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        className="w-full h-44 sm:h-56 bg-white rounded-md cursor-crosshair touch-none"
        style={{ touchAction: 'none' }}
      />
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
          Sign with your finger or stylus
        </div>
      )}
      <div className="absolute bottom-2 right-2">
        <button
          type="button"
          data-testid="clear-signature"
          onClick={clear}
          className="text-xs px-2 py-1 rounded bg-white/90 border border-slate-200 text-slate-600 hover:bg-white transition flex items-center gap-1"
        >
          <Eraser className="w-3 h-3" /> Clear
        </button>
      </div>
    </div>
  );
}

export default function InspectionSign() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [signature, setSignature] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/inspections/${id}`)
      .then((r) => setDoc(r.data))
      .catch(() => {
        toast.error('Inspection not found');
        navigate('/driver');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const certify = async () => {
    if (!signature) {
      toast.error('Sign on the pad first');
      return;
    }
    const defects = (doc.items || []).filter((i) => i.status === 'defect');
    setSubmitting(true);
    try {
      await api.post(`/inspections/${id}/certify`, {
        no_defects: defects.length === 0,
        signature,
      });
      toast.success('Inspection certified ✅');
      // Bounce to driver home (or back to inspection detail)
      navigate(`/driver/inspection/${id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not certify');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!doc) return null;

  const items = doc.items || [];
  const passes = items.filter((i) => i.status === 'pass').length;
  const defects = items.filter((i) => i.status === 'defect');
  const naCount = items.filter((i) => i.status === 'na').length;
  const totalCheck = items.filter((i) => i.type === 'check').length;
  const photos = items.reduce((sum, i) => sum + (i.photos?.length || 0), 0);
  const incomplete = items.filter((i) => i.type === 'check' && (!i.status || i.status === 'pending'));

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <header className="sticky top-0 z-10 bg-[#0a0e14]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link to={`/driver/inspection/${id}`} className="text-slate-400 hover:text-white" data-testid="back-to-form">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-amber-400">{doc.inspection_type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'} · Sign &amp; Certify</div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="sign-page-title">Review &amp; Sign</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5 pb-32">
        {/* Summary */}
        <Card className="p-4 bg-[#0a0e14] border-white/5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-300">{passes}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Pass</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${defects.length > 0 ? 'text-red-300' : 'text-slate-500'}`}>{defects.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Defects</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-300">{naCount}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">N/A</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-sky-300">{photos}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Photos</div>
            </div>
          </div>
        </Card>

        {/* Defect summary */}
        {defects.length > 0 && (
          <Card className="p-4 bg-red-500/5 border-red-500/30" data-testid="defects-card">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-semibold text-red-200 uppercase tracking-wider">Defects Found ({defects.length})</span>
            </div>
            <ul className="space-y-1">
              {defects.map((d) => (
                <li key={d.key} className="text-sm text-red-200 flex items-start gap-2">
                  <span className="text-red-400 shrink-0">•</span>
                  <span>
                    <span className="font-semibold">{d.label}</span>
                    {d.note && <span className="text-red-300/80"> — {d.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-[11px] text-slate-400 leading-relaxed">
              Each defect will auto-create a maintenance ticket for the shop. The vehicle should not be driven until repaired.
            </div>
          </Card>
        )}

        {/* No-defects FMCSA cert language */}
        {defects.length === 0 && (
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/30">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-200 uppercase tracking-wider">No Defects Reported</span>
            </div>
            <div className="text-[11px] text-slate-400 leading-relaxed">
              Vehicle is roadworthy by FMCSA 49 CFR § 396.11 / § 396.13. Your signature certifies the inspection is true and complete.
            </div>
          </Card>
        )}

        {/* Incomplete warning */}
        {incomplete.length > 0 && (
          <Card className="p-3 bg-amber-500/5 border-amber-500/30 text-xs text-amber-200" data-testid="incomplete-warning">
            <span className="font-semibold">Heads up:</span> {incomplete.length} item{incomplete.length === 1 ? '' : 's'} not yet checked. You can still sign, but it's safer to review every line.
          </Card>
        )}

        {/* Signature pad */}
        <Card className="p-4 bg-[#0a0e14] border-white/5">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            <ClipboardCheck className="w-3 h-3" /> Driver Signature
          </div>
          <SignaturePad onChange={setSignature} />
          <div className="mt-2 text-[11px] text-slate-500 leading-relaxed">
            By signing, I certify under FMCSA regulations that I have personally inspected this vehicle and the report above is accurate.
          </div>
        </Card>

        <Button
          data-testid="certify-cta"
          size="lg"
          onClick={certify}
          disabled={submitting || !signature}
          className="w-full bg-amber-500 text-black hover:bg-amber-400 font-semibold h-12 text-base"
        >
          {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <ClipboardCheck className="w-5 h-5 mr-2" />}
          {submitting ? 'Certifying…' : 'Certify Inspection'}
        </Button>
      </main>
    </div>
  );
}
