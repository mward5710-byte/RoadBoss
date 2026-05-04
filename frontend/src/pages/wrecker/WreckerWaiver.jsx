import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ZoomIn, ZoomOut, Save, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SignaturePad } from '@/components/SignaturePad';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function WreckerWaiver() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [template, setTemplate] = useState(null);
  const [existingWaiver, setExistingWaiver] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [signature, setSignature] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [j, tpl, w] = await Promise.all([
        api.get(`/wrecker/jobs/${id}`),
        api.get('/wrecker/waiver/template'),
        api.get(`/wrecker/jobs/${id}/waiver`).catch(() => ({ data: null })),
      ]);
      setJob(j.data);
      setTemplate(tpl.data);
      setExistingWaiver(w.data);
      setCustomerName(w.data?.customer_name || j.data?.customer?.name || '');
    } catch (e) { toast.error('Could not load waiver'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!customerName.trim()) { toast.error('Customer name required'); return; }
    if (!signature) { toast.error('Customer signature required'); return; }
    if (!accepted) { toast.error('Customer must acknowledge the terms'); return; }
    setSaving(true);
    try {
      await api.post(`/wrecker/jobs/${id}/waiver/accept`, {
        customer_name: customerName,
        signature_data_url: signature,
      });
      toast.success('Waiver signed');
      navigate(`/wrecker/jobs/${id}`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading waiver...</div>;
  if (!job || !template) return null;

  const company = template.company_name || 'Martin Wrecker Service Inc';
  const text = (template.waiver_text || '').replace(/\{\{COMPANY_NAME\}\}/g, company);

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <header className="sticky top-0 z-10 bg-[#0a0e14]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to={`/wrecker/jobs/${id}`} className="text-slate-400 hover:text-white" data-testid="back-to-job">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-amber-400">Liability Waiver</div>
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{company}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setFontSize((s) => Math.max(11, s - 1))} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5" data-testid="font-smaller"><ZoomOut className="w-4 h-4" /></button>
            <button onClick={() => setFontSize((s) => Math.min(20, s + 1))} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5" data-testid="font-larger"><ZoomIn className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5 pb-32">
        {existingWaiver && (
          <Card className="p-4 bg-emerald-500/10 border-emerald-500/30 flex items-center gap-3" data-testid="waiver-already-signed">
            <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            <div className="text-sm">
              <div className="text-emerald-200 font-semibold">Already signed by {existingWaiver.customer_name}</div>
              <div className="text-xs text-emerald-300/80">{new Date(existingWaiver.accepted_at).toLocaleString()}</div>
            </div>
          </Card>
        )}

        <Card className="p-5 bg-[#0a0e14] border-white/5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 mb-3">
            <FileText className="w-3 h-3" /> Disclaimer
          </div>
          <div className="text-slate-200 leading-relaxed whitespace-pre-line" style={{ fontSize: `${fontSize}px`, lineHeight: 1.55 }} data-testid="waiver-text">
            {text}
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Customer name</label>
            <Input data-testid="waiver-customer-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="bg-[#07090d] border-white/10 text-white" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Customer signature</label>
            <SignaturePad onChange={setSignature} testId="waiver-signature" />
          </div>
          <label className="flex items-start gap-2 cursor-pointer" data-testid="waiver-accept-toggle">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 accent-amber-500" />
            <span className="text-sm text-slate-200">I have read and accepted the terms above.</span>
          </label>
          <Button data-testid="waiver-submit" onClick={submit} disabled={saving} size="lg" className="w-full bg-amber-500 text-black hover:bg-amber-400 font-semibold h-12 text-base">
            {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />} Sign & Accept
          </Button>
        </Card>
      </main>
    </div>
  );
}
