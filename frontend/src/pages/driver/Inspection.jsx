import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mic, MicOff, Volume2, Check, AlertTriangle, MinusCircle, ArrowLeft, ArrowRight,
  ClipboardCheck, ShieldCheck, Loader2, Truck, Container, Pencil, Radio, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { toast } from 'sonner';

function speak(text, onEnd) {
  try {
    if (!('speechSynthesis' in window)) { onEnd && onEnd(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 1; u.volume = 1; u.lang = 'en-US';
    u.onend = () => onEnd && onEnd();
    u.onerror = () => onEnd && onEnd();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) { onEnd && onEnd(); }
}

// Match free-form driver speech to a status answer.
function matchAnswer(transcript) {
  const t = (transcript || '').toLowerCase();
  if (!t) return null;
  if (/(defect|broken|busted|bad|damage|crack|leak|low|issue|problem|wrong|not (working|good)|fail|ain't|isn't|don't work|not work)/i.test(t)) return 'defect';
  if (/(skip|n\/a|not applicable|no trailer|no apply|doesn't apply|don'?t apply|pass on this)/i.test(t)) return 'na';
  if (/^(yes|yep|yeah|good|ok|okay|fine|all good|pass|working|alright|clear|check|copy|affirmative|10[- ]?4)\b|all (good|clear)|looks good|looking good|no problem|no issue/i.test(t)) return 'pass';
  return null;
}

const statusMeta = {
  pass: { label: 'Pass', icon: Check, color: 'emerald', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-300' },
  defect: { label: 'Defect', icon: AlertTriangle, color: 'red', bg: 'bg-red-500/15', border: 'border-red-500/40', text: 'text-red-300' },
  na: { label: 'N/A', icon: MinusCircle, color: 'slate', bg: 'bg-slate-500/15', border: 'border-slate-500/40', text: 'text-slate-300' },
  pending: { label: 'Pending', icon: Loader2, color: 'sky', bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-300' },
};

export default function Inspection() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [voiceMode, setVoiceMode] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0); // index of current item in voice mode
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [defectModalKey, setDefectModalKey] = useState(null);
  const [defectNote, setDefectNote] = useState('');
  const [certifyOpen, setCertifyOpen] = useState(false);
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const recogRef = useRef(null);
  const voiceModeRef = useRef(voiceMode);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  const supportsSTT = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  // Auto-start voice flag from URL
  useEffect(() => {
    if (search.get('voice') === '0') setVoiceMode(false);
  }, [search]);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get(`/inspections/${id}`);
      setDoc(r.data);
      // jump active index to first pending
      const items = r.data?.items || [];
      const firstPending = items.findIndex((it) => it.status === 'pending');
      setActiveIdx(firstPending >= 0 ? firstPending : items.length);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not load inspection');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    refresh();
    return () => {
      try { window.speechSynthesis?.cancel(); } catch {}
      try { recogRef.current?.stop?.(); } catch {}
    };
  }, [refresh]);

  const items = doc?.items || [];
  const total = items.length;
  const completed = items.filter((it) => it.status !== 'pending').length;
  const defectCount = items.filter((it) => it.status === 'defect').length;
  const allDone = completed === total && total > 0;
  const isCertified = doc?.status === 'certified';
  const currentItem = items[activeIdx];

  const sectionLabel = (s) => (s === 'tractor' ? 'Tractor' : s === 'trailer' ? 'Trailer' : s);

  const updateItem = useCallback(async (key, status, note) => {
    try {
      const r = await api.put(`/inspections/${id}/item`, { key, status, note });
      setDoc(r.data);
    } catch (e) {
      toast.error('Could not save item');
      throw e;
    }
  }, [id]);

  const sayAndAdvance = useCallback((idx) => {
    if (!voiceModeRef.current) return;
    const it = (doc?.items || [])[idx];
    if (!it) return;
    const ord = `${idx + 1} of ${(doc?.items || []).length}`;
    const prompt = `${ord}. ${it.label}. Say good, defect, or skip.`;
    speak(prompt, () => {
      if (voiceModeRef.current) startListening();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const startListening = useCallback(() => {
    if (!supportsSTT) return;
    try {
      const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new Recog();
      r.lang = 'en-US';
      r.interimResults = true;
      r.continuous = false;
      r.maxAlternatives = 1;
      r.onstart = () => { setListening(true); setPartial(''); };
      r.onerror = () => { setListening(false); };
      r.onend = () => { setListening(false); };
      r.onresult = async (e) => {
        let interim = ''; let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const txt = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += txt; else interim += txt;
        }
        if (interim) setPartial(interim);
        if (final) {
          setPartial('');
          recogRef.current?.stop?.();
          await processVoiceAnswer(final);
        }
      };
      recogRef.current = r;
      r.start();
    } catch (e) { setListening(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsSTT]);

  const stopListening = () => {
    try { recogRef.current?.stop?.(); } catch {}
    setListening(false);
  };

  const processVoiceAnswer = async (transcript) => {
    const cur = (doc?.items || [])[activeIdx];
    if (!cur) return;
    const matched = matchAnswer(transcript);
    if (!matched) {
      speak(`Sorry, didn't catch that. ${cur.label}. Say good, defect, or skip.`, () => {
        if (voiceModeRef.current) startListening();
      });
      return;
    }
    // Defect → ask for description, then save
    if (matched === 'defect') {
      speak('Defect noted. Briefly describe the issue after the beep.', () => {
        try {
          const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
          const r = new Recog();
          r.lang = 'en-US'; r.interimResults = false; r.continuous = false; r.maxAlternatives = 1;
          r.onstart = () => setListening(true);
          r.onerror = () => setListening(false);
          r.onend = () => setListening(false);
          r.onresult = async (e) => {
            const desc = e.results[0]?.[0]?.transcript || '';
            await updateItem(cur.key, 'defect', desc);
            const nextIdx = (doc?.items || []).findIndex((it, i) => i > activeIdx && it.status === 'pending');
            const next = nextIdx >= 0 ? nextIdx : (doc?.items || []).length;
            setActiveIdx(next);
            if (next < (doc?.items || []).length) {
              setTimeout(() => sayAndAdvance(next), 200);
            } else {
              speak('All items complete. Ready for certification.');
            }
          };
          recogRef.current = r;
          r.start();
        } catch {}
      });
      return;
    }
    // pass / na — save and advance
    await updateItem(cur.key, matched);
    const nextIdx = (doc?.items || []).findIndex((it, i) => i > activeIdx && it.status === 'pending');
    const next = nextIdx >= 0 ? nextIdx : (doc?.items || []).length;
    setActiveIdx(next);
    if (next < (doc?.items || []).length) {
      setTimeout(() => sayAndAdvance(next), 250);
    } else {
      speak('All items complete. Ready for certification.');
    }
  };

  // When user toggles voice mode ON and current item is pending, kick off the loop
  useEffect(() => {
    if (voiceMode && !isCertified && doc && currentItem && currentItem.status === 'pending') {
      const t = setTimeout(() => sayAndAdvance(activeIdx), 600);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode, doc?.id]);

  const tapStatus = async (key, status) => {
    if (status === 'defect') {
      setDefectModalKey(key);
      setDefectNote('');
      return;
    }
    await updateItem(key, status, null);
    const idx = (doc?.items || []).findIndex((it) => it.key === key);
    if (idx === activeIdx) {
      const next = (doc?.items || []).findIndex((it, i) => i > idx && it.status === 'pending');
      setActiveIdx(next >= 0 ? next : items.length);
    }
  };

  const saveDefect = async () => {
    if (!defectModalKey) return;
    await updateItem(defectModalKey, 'defect', defectNote || 'Defect reported (no note)');
    setDefectModalKey(null);
    setDefectNote('');
    const idx = (doc?.items || []).findIndex((it) => it.key === defectModalKey);
    if (idx === activeIdx) {
      const next = (doc?.items || []).findIndex((it, i) => i > idx && it.status === 'pending');
      setActiveIdx(next >= 0 ? next : items.length);
    }
  };

  const submitCertify = async () => {
    if (!signature.trim()) { toast.error('Type your name to sign.'); return; }
    setSubmitting(true);
    try {
      const r = await api.post(`/inspections/${id}/certify`, {
        no_defects: defectCount === 0,
        signature: signature.trim(),
      });
      setDoc(r.data);
      setCertifyOpen(false);
      toast.success(defectCount === 0 ? 'Inspection certified — no defects!' : `Inspection certified. ${defectCount} defect(s) logged for fleet.`);
      try { window.speechSynthesis?.cancel(); } catch {}
      speak(defectCount === 0
        ? 'Inspection certified. No defects. You are clear to roll.'
        : `Inspection certified. ${defectCount} defect${defectCount === 1 ? '' : 's'} sent to fleet maintenance.`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not certify');
    } finally { setSubmitting(false); }
  };

  const grouped = useMemo(() => {
    const out = { tractor: [], trailer: [] };
    (items || []).forEach((it, idx) => {
      (out[it.section] ||= []).push({ ...it, _idx: idx });
    });
    return out;
  }, [items]);

  if (loading) {
    return <div className="p-8 text-slate-400 text-center" data-testid="inspection-loading">Loading inspection...</div>;
  }
  if (!doc) {
    return <div className="p-8 text-slate-400 text-center">Inspection not found.</div>;
  }

  return (
    <div className="text-slate-200 min-h-[calc(100vh-4rem)] flex flex-col" data-testid="inspection-page">
      {/* Top bar */}
      <div className="px-5 py-3 border-b border-white/5 bg-[#07090d]/80 backdrop-blur sticky top-[57px] z-20">
        <div className="flex items-center justify-between gap-3">
          <Link to="/driver" className="flex items-center gap-1.5 text-slate-400 hover:text-white" data-testid="inspection-back-btn">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest">Cab</span>
          </Link>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-sky-400/80 flex items-center justify-center gap-1.5">
              <ClipboardCheck className="w-3 h-3" /> {doc.inspection_type === 'pre_trip' ? 'Pre-Trip Inspection' : 'Post-Trip Inspection'}
            </div>
            <div className="text-sm font-semibold text-white">
              {completed} / {total} complete{defectCount > 0 ? ` · ${defectCount} defect${defectCount === 1 ? '' : 's'}` : ''}
            </div>
          </div>
          <button
            onClick={() => setVoiceMode((v) => !v)}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${voiceMode ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
            data-testid="inspection-mode-toggle"
            aria-label={voiceMode ? 'Switch to tap mode' : 'Switch to voice mode'}
            title={voiceMode ? 'Voice mode ON' : 'Tap mode ON'}
          >
            {voiceMode ? <Radio className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-sky-500 transition-all" style={{ width: total ? `${(completed / total) * 100}%` : '0%' }} />
        </div>
        <div className="mt-2 text-[11px] text-slate-500 text-center">
          {doc.vehicle_name ? `${doc.vehicle_name} · ` : ''}{doc.driver_name || ''}{isCertified ? ' · CERTIFIED' : ''}
        </div>
      </div>

      {/* Voice walkthrough banner */}
      {voiceMode && !isCertified && currentItem && currentItem.status === 'pending' && (
        <div className="mx-5 mt-4 rounded-2xl p-5 bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent border border-sky-500/30 text-center" data-testid="voice-walkthrough-banner">
          <div className="text-[10px] uppercase tracking-widest text-sky-400/80 flex items-center justify-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${listening ? 'bg-red-400 animate-pulse' : 'bg-sky-400 animate-pulse'}`} />
            {listening ? 'Listening...' : 'Voice walkthrough'}
          </div>
          <div className="text-xs text-slate-400 mt-1">Item {activeIdx + 1} of {total} · {sectionLabel(currentItem.section)}</div>
          <div className="text-2xl font-bold text-white mt-2">{currentItem.label}</div>
          <div className="text-sm text-slate-400 mt-1">Say "good", "defect", or "skip"</div>
          {partial && <div className="mt-2 text-sm text-sky-300 italic">"{partial}"</div>}
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={listening ? stopListening : () => sayAndAdvance(activeIdx)}
              className={`relative w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all ${listening ? 'bg-red-500/30 border-red-500/60 hp-voice-ring' : 'bg-sky-500/20 border-sky-500/40'}`}
              data-testid="inspection-mic-btn"
              aria-label={listening ? 'Stop listening' : 'Repeat prompt'}
            >
              {listening ? <MicOff className="w-7 h-7 text-red-200" /> : <Mic className="w-7 h-7 text-sky-300" />}
            </button>
            <button
              onClick={() => sayAndAdvance(activeIdx)}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 text-xs inline-flex items-center gap-1"
              data-testid="inspection-replay-btn"
              aria-label="Replay prompt"
            >
              <Volume2 className="w-3.5 h-3.5" /> Replay
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button onClick={() => tapStatus(currentItem.key, 'pass')} className="px-2 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold" data-testid="quick-pass-btn"><Check className="w-4 h-4 inline mr-1" />Good</button>
            <button onClick={() => tapStatus(currentItem.key, 'defect')} className="px-2 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-semibold" data-testid="quick-defect-btn"><AlertTriangle className="w-4 h-4 inline mr-1" />Defect</button>
            <button onClick={() => tapStatus(currentItem.key, 'na')} className="px-2 py-2 rounded-lg bg-slate-500/15 border border-slate-500/40 text-slate-300 text-xs font-semibold" data-testid="quick-na-btn"><MinusCircle className="w-4 h-4 inline mr-1" />Skip</button>
          </div>
        </div>
      )}

      {/* All-done banner */}
      {allDone && !isCertified && (
        <div className="mx-5 mt-4 rounded-2xl p-5 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/40 text-center" data-testid="all-done-banner">
          <ShieldCheck className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
          <div className="text-base font-semibold text-white">All items reviewed</div>
          <div className="text-sm text-slate-400 mt-1">{defectCount === 0 ? 'No defects found.' : `${defectCount} defect${defectCount === 1 ? '' : 's'} will be sent to fleet.`}</div>
          <Button onClick={() => setCertifyOpen(true)} className="mt-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold" data-testid="open-certify-btn">
            Certify and Sign <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Certified summary banner */}
      {isCertified && (
        <div className="mx-5 mt-4 rounded-2xl p-5 hp-panel-bordered text-center" data-testid="certified-banner">
          <ShieldCheck className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
          <div className="text-base font-semibold text-white">Inspection certified</div>
          <div className="text-xs text-slate-400 mt-1">Signed by {doc.signature} · {new Date(doc.certified_at).toLocaleString()}</div>
          {defectCount > 0 && <div className="text-xs text-amber-400 mt-1">{defectCount} defect{defectCount === 1 ? '' : 's'} forwarded to maintenance.</div>}
          <Button onClick={() => navigate('/driver')} variant="outline" className="mt-3 border-white/15 text-slate-200" data-testid="back-home-btn">
            Back to Cab <ArrowLeft className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Items list (always visible) */}
      <div className="px-5 py-4 space-y-5 flex-1">
        {['tractor', 'trailer'].map((section) => (
          <div key={section} className="hp-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center gap-2">
              {section === 'tractor' ? <Truck className="w-4 h-4 text-sky-400" /> : <Container className="w-4 h-4 text-sky-400" />}
              <span className="text-sm font-semibold text-white">{sectionLabel(section)}</span>
              <span className="text-[10px] text-slate-500 ml-auto">
                {(grouped[section] || []).filter((i) => i.status !== 'pending').length} / {(grouped[section] || []).length}
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {(grouped[section] || []).map((it) => {
                const meta = statusMeta[it.status] || statusMeta.pending;
                const Icon = meta.icon;
                const isCurrent = it._idx === activeIdx && !isCertified;
                return (
                  <motion.div
                    key={it.key}
                    initial={false}
                    animate={isCurrent ? { backgroundColor: 'rgba(56,189,248,0.06)' } : { backgroundColor: 'rgba(0,0,0,0)' }}
                    className={`p-4 ${isCurrent ? 'ring-1 ring-inset ring-sky-500/30' : ''}`}
                    data-testid={`inspection-item-${it.key}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center ${meta.bg} ${meta.border} border`}>
                        <Icon className={`w-3.5 h-3.5 ${meta.text} ${it.status === 'pending' ? 'opacity-60' : ''}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{it.label}</div>
                        {it.note && <div className={`text-xs mt-1 ${it.status === 'defect' ? 'text-red-300' : 'text-slate-400'}`}>"{it.note}"</div>}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${meta.bg} ${meta.text} border ${meta.border}`}>{meta.label}</span>
                    </div>
                    {!isCertified && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          onClick={() => tapStatus(it.key, 'pass')}
                          className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${it.status === 'pass' ? 'bg-emerald-500/25 border-emerald-500/60 text-emerald-200' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-300'}`}
                          data-testid={`tap-pass-${it.key}`}
                        ><Check className="w-3 h-3 inline mr-1" />Good</button>
                        <button
                          onClick={() => tapStatus(it.key, 'defect')}
                          className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${it.status === 'defect' ? 'bg-red-500/25 border-red-500/60 text-red-200' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-red-500/10 hover:text-red-300'}`}
                          data-testid={`tap-defect-${it.key}`}
                        ><AlertTriangle className="w-3 h-3 inline mr-1" />Defect</button>
                        <button
                          onClick={() => tapStatus(it.key, 'na')}
                          className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${it.status === 'na' ? 'bg-slate-500/25 border-slate-500/60 text-slate-200' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                          data-testid={`tap-na-${it.key}`}
                        ><MinusCircle className="w-3 h-3 inline mr-1" />N/A</button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}

        {!isCertified && allDone && (
          <Button onClick={() => setCertifyOpen(true)} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-6" data-testid="bottom-certify-btn">
            <ShieldCheck className="w-5 h-5 mr-2" /> Certify and Sign Inspection
          </Button>
        )}
      </div>

      {/* Defect-note modal */}
      {defectModalKey && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" data-testid="defect-modal">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl hp-panel-bordered p-5 m-0 sm:m-4">
            <div className="text-base font-semibold text-white">Describe the defect</div>
            <div className="text-xs text-slate-400 mt-1">{(items.find((i) => i.key === defectModalKey) || {}).label}</div>
            <Textarea
              value={defectNote}
              onChange={(e) => setDefectNote(e.target.value)}
              placeholder="e.g., Front passenger tire low pressure, ~70 PSI."
              className="mt-3 bg-white/5 border-white/10 text-slate-100"
              rows={3}
              data-testid="defect-note-input"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => { setDefectModalKey(null); setDefectNote(''); }} className="flex-1 border-white/15 text-slate-200" data-testid="defect-cancel-btn">Cancel</Button>
              <Button onClick={saveDefect} className="flex-1 bg-red-500 hover:bg-red-400 text-white font-semibold" data-testid="defect-save-btn">Save Defect</Button>
            </div>
          </div>
        </div>
      )}

      {/* Certify modal */}
      {certifyOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" data-testid="certify-modal">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl hp-panel-bordered p-5 m-0 sm:m-4">
            <ShieldCheck className="w-8 h-8 text-emerald-300 mb-2" />
            <div className="text-base font-semibold text-white">Certify Inspection</div>
            <div className="text-xs text-slate-400 mt-1">
              {defectCount === 0
                ? 'No defects found. By signing, you certify the vehicle is safe to operate per FMCSA 49 CFR 396.11.'
                : `${defectCount} defect(s) will be forwarded to fleet maintenance. By signing, you certify your inspection is accurate.`}
            </div>
            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-widest text-sky-400/80">Type your full legal name</label>
              <Input
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder={doc.driver_name || 'Driver Name'}
                className="mt-1 bg-white/5 border-white/10 text-slate-100"
                data-testid="signature-input"
                autoFocus
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => setCertifyOpen(false)} disabled={submitting} className="flex-1 border-white/15 text-slate-200" data-testid="certify-cancel-btn">Cancel</Button>
              <Button onClick={submitCertify} disabled={submitting || !signature.trim()} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold" data-testid="certify-submit-btn">
                {submitting ? 'Signing...' : 'Sign and Certify'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
