// WreckerJobNew — New Tow Job form WITH integrated hands-free voice fill.
//
// Mike's spec (verbatim translation):
//   "Stay on the page that I'm filling out. Don't ask me yes/no after every
//    field. Show me what I said as I'm saying it. If it mishears something
//    let me fix just that one field — don't make me redo everything."
//
// Behavior:
//   - One green "Voice Fill" button up top → Co-Pilot walks every field.
//   - Each field gets focused + ringed sky-blue when it's its turn.
//   - Live STT interim transcript shows IN the field as Mike speaks.
//   - On silence (~1.2s) the field commits the value and we auto-advance.
//     NO yes/no confirmation. Mike sees the field. If wrong, he taps the
//     mic icon on JUST that field to redo, OR types the fix directly.
//   - Mike can pause anytime (the same green button toggles to "Pause").
//   - All parsing is CLIENT SIDE so there's zero network latency per field.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Save, Mic, Square, Pause, Sparkles, RotateCcw, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { usePushToTalk } from '@/hooks/usePushToTalk';
import { isInIframe, supportsSTT } from '@/hooks/useWakeWord';

const SERVICE_TYPES = [
  ['tow_light_duty', 'Tow — Light Duty'],
  ['tow_medium_duty', 'Tow — Medium Duty'],
  ['tow_heavy_duty', 'Tow — Heavy Duty'],
  ['flatbed', 'Flatbed'],
  ['winch_out', 'Winch Out'],
  ['lockout', 'Lockout'],
  ['jumpstart', 'Jumpstart'],
  ['tire_change', 'Tire Change'],
  ['fuel_delivery', 'Fuel Delivery'],
  ['accident_recovery', 'Accident Recovery'],
  ['impound', 'Impound Tow'],
  ['private_property', 'Private Property'],
];

// ---------- Client-side parsers (zero network round-trip) ----------

const DIGIT_WORDS = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9', niner: '9',
};

function parsePhoneClient(t) {
  if (!t) return '';
  const s = t.toLowerCase();
  const tokens = s.split(/[\s,.\-]+/);
  const converted = tokens.map((tk) => DIGIT_WORDS[tk] != null ? DIGIT_WORDS[tk] : tk);
  let digits = converted.join(' ').replace(/\D/g, '');
  if (digits.length >= 11 && digits.startsWith('1')) digits = digits.slice(1, 11);
  else if (digits.length >= 10) digits = digits.slice(0, 10);
  if (digits.length !== 10) return '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

const NUM_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
};

function parsePriceClient(t) {
  if (!t) return '';
  let s = t.toLowerCase().trim();
  s = s.replace(/^\s*(charge|set\s+price\s+to|price\s+is|the\s+price\s+is|it'?s|its)\s+/, '');
  s = s.replace(/dollars?|bucks/g, '');
  s = s.replace(/\band\b/g, ' ');
  s = s.replace(/(\d),(\d{3})/g, '$1$2');
  s = s.replace(/(\d),(\d{3})/g, '$1$2');
  // Numeric form first
  const m = s.match(/\$?(\d{1,7}(?:\.\d{1,2})?)/);
  if (m) {
    const v = parseFloat(m[1]);
    if (v > 0 && v < 1_000_000) return v.toFixed(2);
  }
  // Colloquial "two fifty" → 250
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 2 && tokens.every((tk) => NUM_WORDS[tk] != null)) {
    const a = NUM_WORDS[tokens[0]];
    const b = NUM_WORDS[tokens[1]];
    if (a >= 1 && a <= 9 && [20, 30, 40, 50, 60, 70, 80, 90].includes(b)) {
      return (a * 100 + b).toFixed(2);
    }
  }
  // General spoken-number parser
  let total = 0, current = 0, matched = false;
  for (const tk of tokens) {
    if (NUM_WORDS[tk] == null) continue;
    matched = true;
    const n = NUM_WORDS[tk];
    if (n === 100) { if (current === 0) current = 1; current *= 100; }
    else if (n === 1000) { if (current === 0) current = 1; total += current * 1000; current = 0; }
    else current += n;
  }
  total += current;
  if (matched && total > 0 && total < 1_000_000) return total.toFixed(2);
  return '';
}

const SERVICE_KEYWORDS = [
  [/\b(heavy.?duty)\b|\b(heavy)\b/, 'tow_heavy_duty'],
  [/\b(medium.?duty)\b|\b(medium)\b/, 'tow_medium_duty'],
  [/\b(flat.?bed|flatbed)\b/, 'flatbed'],
  [/\b(jump.?start|jump)\b/, 'jumpstart'],
  [/\b(lock.?out|locked.?out|unlock|keys?\s+(in|locked))\b/, 'lockout'],
  [/\b(tire|flat)\b/, 'tire_change'],
  [/\b(fuel|gas|gasoline)\b/, 'fuel_delivery'],
  [/\b(winch)\b/, 'winch_out'],
  [/\b(accident|crash|recover|recovery)\b/, 'accident_recovery'],
  [/\b(impound)\b/, 'impound'],
  [/\b(private\s+property|trespass)\b/, 'private_property'],
  [/\b(light.?duty|tow|towing|haul)\b/, 'tow_light_duty'],
];

function parseServiceClient(t) {
  if (!t) return '';
  const s = t.toLowerCase();
  for (const [re, key] of SERVICE_KEYWORDS) {
    if (re.test(s)) return key;
  }
  return '';
}

function cleanFreeform(t) {
  if (!t) return '';
  let s = t.trim().replace(/[.!?,]+$/, '');
  s = s.replace(/^\s*(it'?s|it is|the customer is|customer is|name is|address is|the address is|pickup is|drop\s*off is|the vehicle is|vehicle is|service is|um+|uh+|so|like)\s+/i, '').trim();
  if (!s) return '';
  if (s === s.toLowerCase()) {
    s = s.replace(/\b\w/g, (c) => c.toUpperCase());
    s = s.replace(/\bI (\d+)/g, 'I-$1');
    s = s.replace(/\bUs (\d+)/gi, 'US-$1');
  }
  return s;
}

function parseVehicleClient(t) {
  // Extract year (4 digits) if present, leave rest as combined "make model color"
  if (!t) return { year: '', rest: '' };
  const cleaned = cleanFreeform(t);
  const yearMatch = cleaned.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : '';
  const rest = year ? cleaned.replace(year, '').replace(/\s+/g, ' ').trim() : cleaned;
  return { year, rest };
}

// ---------- Voice flow steps ----------
// Each step targets one or more form keys. `prompt` is short — Mike doesn't
// want long preambles. parser maps captured text → field updates.

const VOICE_STEPS = [
  {
    key: 'customer_name', label: 'Customer name',
    prompt: 'Customer name?',
    targets: ['customer_name'],
    fillFromInterim: true,
    apply: (text, set) => { set('customer_name', cleanFreeform(text)); },
    optional: false,
  },
  {
    key: 'customer_phone', label: 'Phone',
    prompt: 'Phone number? Or say skip.',
    targets: ['customer_phone'],
    fillFromInterim: false,
    apply: (text, set) => {
      const v = parsePhoneClient(text);
      if (v) set('customer_phone', v);
      // if STT gave nothing parseable, store the raw cleaned text so Mike can fix
      else if (text) set('customer_phone', text.replace(/[^\d() \-+]/g, '').trim());
    },
    optional: true,
  },
  {
    key: 'pickup_address', label: 'Pickup address',
    prompt: 'Pickup address?',
    targets: ['pickup_address'],
    fillFromInterim: true,
    apply: (text, set) => { set('pickup_address', cleanFreeform(text)); },
    optional: false,
  },
  {
    key: 'dropoff_address', label: 'Drop-off',
    prompt: 'Drop-off address? Or say skip.',
    targets: ['dropoff_address'],
    fillFromInterim: true,
    apply: (text, set) => { set('dropoff_address', cleanFreeform(text)); },
    optional: true,
  },
  {
    key: 'vehicle', label: 'Vehicle',
    prompt: 'Vehicle? Year, make, model, color.',
    targets: ['veh_year', 'veh_make'],
    fillFromInterim: false,
    apply: (text, set) => {
      const { year, rest } = parseVehicleClient(text);
      if (year) set('veh_year', year);
      // Drop combined remainder into "make" so Mike can split if he wants;
      // typing into separate fields is faster than parsing perfectly.
      if (rest) set('veh_make', rest);
    },
    optional: true,
  },
  {
    key: 'service_type', label: 'Service type',
    prompt: 'Service? Tow, flatbed, jumpstart, lockout, tire, fuel, winch, or recovery.',
    targets: ['service_type'],
    fillFromInterim: false,
    apply: (text, set) => {
      const v = parseServiceClient(text);
      if (v) set('service_type', v);
    },
    optional: false, // has a default but we still ask
  },
  {
    key: 'quoted_price', label: 'Quoted price',
    prompt: 'Quoted price? Or say skip.',
    targets: ['quoted_price'],
    fillFromInterim: false,
    apply: (text, set) => {
      const v = parsePriceClient(text);
      if (v) set('quoted_price', v);
    },
    optional: true,
  },
];

const SKIP_RE = /\b(skip|none|no\s+(phone|number|address|drop\s*off|vehicle|price)|leave\s+blank|pass|next)\b/i;

// ---------- Speech helpers ----------
function speak(text, onEnd) {
  try {
    if (!('speechSynthesis' in window) || !text) { onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.08; u.pitch = 1; u.volume = 1; u.lang = 'en-US';
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.cancel();
    try { window.speechSynthesis.resume(); } catch {}
    window.speechSynthesis.speak(u);
  } catch { onEnd?.(); }
}
function chime(freq = 880) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.2);
    setTimeout(() => { try { ctx.close(); } catch {} }, 400);
  } catch {}
}

// ---------- Per-field mic icon button ----------
function FieldMicButton({ active, recording, onClick, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center transition ${
        recording ? 'bg-red-500/30 text-red-200 ring-1 ring-red-400/50 animate-pulse'
          : active ? 'bg-sky-500/30 text-sky-200 ring-1 ring-sky-400/50'
          : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-slate-100'
      }`}
      data-testid={testid}
      aria-label={recording ? 'Stop recording' : 'Record this field'}
      title={recording ? 'Stop' : 'Re-record this field'}
    >
      {recording ? <Square className="w-3.5 h-3.5 fill-current" /> : <Mic className="w-3.5 h-3.5" />}
    </button>
  );
}

// ---------- Main component ----------
export default function WreckerJobNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoStartVoice = searchParams.get('voice') === '1';

  const [clubs, setClubs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    service_type: 'tow_light_duty',
    priority: 'normal',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    veh_year: '', veh_make: '', veh_model: '', veh_color: '', veh_plate: '', veh_vin: '',
    pickup_address: '', dropoff_address: '',
    quoted_price: '',
    motor_club_id: '',
    payment_method: 'invoice',
    notes: '',
  });

  // Voice flow state
  const [voiceMode, setVoiceMode] = useState(false); // true while flow active
  const [voiceUnlocked, setVoiceUnlocked] = useState(false);
  const [stepIdx, setStepIdx] = useState(0); // index into VOICE_STEPS
  const [activeFieldKey, setActiveFieldKey] = useState(null); // form key currently being captured / single-field redo
  const [singleFieldRedo, setSingleFieldRedo] = useState(false); // true when user tapped a per-field mic
  const stepIdxRef = useRef(0);
  const voiceModeRef = useRef(false);
  const singleRedoRef = useRef(false);
  const activeFieldRef = useRef(null);

  useEffect(() => { stepIdxRef.current = stepIdx; }, [stepIdx]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { singleRedoRef.current = singleFieldRedo; }, [singleFieldRedo]);
  useEffect(() => { activeFieldRef.current = activeFieldKey; }, [activeFieldKey]);

  const inIframe = isInIframe();
  const sttSupported = supportsSTT();

  const setField = useCallback((k, v) => setForm((f) => ({ ...f, [k]: v })), []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target?.value ?? e }));

  useEffect(() => { api.get('/wrecker/motor-clubs').then((r) => setClubs(r.data)).catch(() => {}); }, []);

  // ---------- Voice transcript handling ----------
  const handleTranscript = useCallback((text) => {
    const raw = (text || '').trim();
    if (!raw) {
      // Empty result — just stop, don't advance. User can re-tap mic.
      return;
    }

    // Single-field redo (Mike tapped a per-field mic)
    if (singleRedoRef.current) {
      const fieldKey = activeFieldRef.current;
      if (!fieldKey) return;
      const step = VOICE_STEPS.find((s) => s.targets.includes(fieldKey));
      if (step) {
        if (SKIP_RE.test(raw) && step.optional) {
          step.targets.forEach((t) => setField(t, ''));
        } else {
          step.apply(raw, setField);
        }
        chime(1320);
      } else {
        // Field has no formal step — just dump cleaned text into it
        setField(fieldKey, cleanFreeform(raw));
        chime(1320);
      }
      setSingleFieldRedo(false);
      setActiveFieldKey(null);
      return;
    }

    // Sequential voice flow
    if (!voiceModeRef.current) return;
    const idx = stepIdxRef.current;
    const step = VOICE_STEPS[idx];
    if (!step) return;

    // Skip handling
    if (SKIP_RE.test(raw) && step.optional) {
      chime(660);
      step.targets.forEach((t) => setField(t, ''));
      advanceVoice(idx + 1);
      return;
    }
    // Cancel handling
    if (/\b(cancel|stop voice|exit voice|done)\b/i.test(raw)) {
      pauseVoice();
      return;
    }
    // Apply parsed value
    step.apply(raw, setField);
    chime(1320);
    advanceVoice(idx + 1);
  }, [setField]);

  const ptt = usePushToTalk({ onTranscript: handleTranscript, silenceMs: 1300 });

  // While recording, also stream interim transcript into the active field
  // (for fields we trust live updates on).
  useEffect(() => {
    if (!ptt.recording || !ptt.interim) return;
    const fieldKey = activeFieldRef.current;
    if (!fieldKey) return;
    // Find step / decide if we should live-fill
    const step = VOICE_STEPS.find((s) => s.targets.includes(fieldKey));
    if (step && step.fillFromInterim) {
      setField(fieldKey, ptt.interim);
    }
  }, [ptt.recording, ptt.interim, setField]);

  // Scroll to current field when it changes
  useEffect(() => {
    if (!activeFieldKey) return;
    const el = document.querySelector(`[data-fieldkey="${activeFieldKey}"]`);
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const inputEl = document.querySelector(`[data-testid="${fieldTestId(activeFieldKey)}"]`);
    if (inputEl && inputEl.focus) {
      try { inputEl.focus({ preventScroll: true }); } catch {}
    }
  }, [activeFieldKey]);

  // ---------- Voice flow control ----------
  const startStep = useCallback((idx) => {
    if (idx >= VOICE_STEPS.length) {
      // All done — stop voice mode and chime
      setVoiceMode(false);
      setActiveFieldKey(null);
      chime(1320);
      toast.success('Voice fill complete. Review and create.');
      return;
    }
    const step = VOICE_STEPS[idx];
    setStepIdx(idx);
    setActiveFieldKey(step.targets[0]);
    speak(step.prompt, () => {
      if (!voiceModeRef.current) return;
      chime(880);
      ptt.start();
    });
  }, [ptt]);

  const advanceVoice = useCallback((idx) => {
    setTimeout(() => {
      if (!voiceModeRef.current) return;
      startStep(idx);
    }, 350); // tiny breath between fields
  }, [startStep]);

  const startVoiceFlow = useCallback(() => {
    if (inIframe) {
      toast.error('Mic blocked in preview iframe. Open in a real browser tab.', { duration: 7000 });
      return;
    }
    if (!sttSupported) {
      toast.error('Voice not supported on this browser.', { duration: 5000 });
      return;
    }
    // iOS audio gesture unlock
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0.01; window.speechSynthesis.speak(u); } catch {}
    setVoiceUnlocked(true);
    setVoiceMode(true);
    setStepIdx(0);
    setSingleFieldRedo(false);
    // Find first empty step (so resuming after a manual edit picks up where it makes sense)
    const firstEmpty = VOICE_STEPS.findIndex((s) => s.targets.every((k) => !form[k]));
    const start = firstEmpty >= 0 ? firstEmpty : 0;
    setTimeout(() => startStep(start), 200);
  }, [inIframe, sttSupported, form, startStep]);

  const pauseVoice = useCallback(() => {
    setVoiceMode(false);
    setActiveFieldKey(null);
    try { window.speechSynthesis.cancel(); } catch {}
    try { ptt.cancel(); } catch {}
  }, [ptt]);

  const resumeOrStart = useCallback(() => {
    if (voiceMode) { pauseVoice(); return; }
    startVoiceFlow();
  }, [voiceMode, pauseVoice, startVoiceFlow]);

  const recordSingleField = useCallback((fieldKey) => {
    if (inIframe || !sttSupported) {
      toast.error('Mic not available here. Open the app in a real browser tab.');
      return;
    }
    // If voice flow is running, pause it first
    if (voiceMode) {
      pauseVoice();
    }
    if (ptt.recording && activeFieldRef.current === fieldKey) {
      // Toggle stop
      ptt.stop();
      return;
    }
    try { window.speechSynthesis.cancel(); } catch {}
    try { ptt.cancel(); } catch {}
    setSingleFieldRedo(true);
    setActiveFieldKey(fieldKey);
    // Don't speak a prompt for single-field redo (Mike already knows what he's redoing)
    setTimeout(() => { chime(880); ptt.start(); }, 120);
  }, [inIframe, sttSupported, voiceMode, pauseVoice, ptt]);

  // Auto-start if ?voice=1
  useEffect(() => {
    if (autoStartVoice && !voiceUnlocked) {
      // Delay so the page mounts first
      const t = setTimeout(() => startVoiceFlow(), 400);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartVoice]);

  // Cleanup on unmount
  useEffect(() => () => {
    try { window.speechSynthesis.cancel(); } catch {}
    try { ptt.cancel(); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.customer_name) { toast.error('Customer name is required'); return; }
    if (!form.pickup_address) { toast.error('Pickup address is required'); return; }
    setSaving(true);
    try { window.speechSynthesis.cancel(); } catch {}
    try { ptt.cancel(); } catch {}
    setVoiceMode(false);
    try {
      const club = clubs.find((c) => c.id === form.motor_club_id);
      const payload = {
        service_type: form.service_type,
        priority: form.priority,
        customer: { name: form.customer_name, phone: form.customer_phone || null, email: form.customer_email || null },
        vehicle: {
          year: form.veh_year ? parseInt(form.veh_year) : null,
          make: form.veh_make || null,
          model: form.veh_model || null,
          color: form.veh_color || null,
          plate: form.veh_plate || null,
          vin: form.veh_vin || null,
        },
        pickup: { lat: 0, lng: 0, address: form.pickup_address },
        dropoff: form.dropoff_address ? { lat: 0, lng: 0, address: form.dropoff_address } : null,
        quoted_price: form.quoted_price ? parseFloat(form.quoted_price) : null,
        motor_club_id: form.motor_club_id || null,
        motor_club_name: club ? club.name : null,
        payment_method: form.payment_method,
        notes: form.notes || null,
      };
      const r = await api.post('/wrecker/jobs', payload);
      toast.success('Tow job created');
      navigate(`/wrecker/jobs/${r.data.id}`);
    } catch (err) {
      toast.error('Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  // Visual ring helper for active field
  const ringFor = (key) => activeFieldKey === key
    ? (ptt.recording ? 'ring-2 ring-red-500/70 ring-offset-1 ring-offset-slate-950'
                     : 'ring-2 ring-sky-500/60 ring-offset-1 ring-offset-slate-950')
    : '';

  // Where the per-field mic button can live (only for fields we have parsing for)
  const VOICEABLE_FIELDS = useMemo(() => new Set([
    'customer_name', 'customer_phone', 'pickup_address', 'dropoff_address',
    'veh_year', 'veh_make', 'veh_model', 'veh_color',
    'quoted_price', 'notes',
  ]), []);

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-5 pb-32">
      <header className="flex items-center gap-3">
        <Link to="/wrecker"><Button variant="ghost" size="sm" data-testid="back-to-board"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-widest text-amber-400/80">New Tow Job</div>
          <h1 className="text-2xl font-bold text-white mt-1">Create dispatch ticket</h1>
        </div>
      </header>

      {/* Voice control bar — pinned, highly visible */}
      <div className={`rounded-xl border p-3 flex items-center gap-3 transition ${
        voiceMode
          ? 'bg-emerald-500/10 border-emerald-500/40'
          : 'bg-slate-900/60 border-slate-800'
      }`} data-testid="voice-fill-bar">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          voiceMode ? 'bg-emerald-500/30 text-emerald-200' : 'bg-slate-800 text-slate-400'
        }`}>
          {ptt.recording ? <Mic className="w-5 h-5 animate-pulse" />
            : voiceMode ? <Volume2 className="w-5 h-5" />
            : <Sparkles className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white leading-tight">
            {voiceMode
              ? (ptt.recording ? 'Listening — speak now'
                : VOICE_STEPS[stepIdx]?.prompt || 'Co-Pilot speaking…')
              : 'Hands-Free Voice Fill'}
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {voiceMode
              ? `Step ${Math.min(stepIdx + 1, VOICE_STEPS.length)} of ${VOICE_STEPS.length} · Say "skip" to skip · Tap any field's mic to redo just that one`
              : 'Co-Pilot fills every field — you watch, edit anything inline, no yes/no asked.'}
          </div>
        </div>
        <Button
          type="button"
          onClick={resumeOrStart}
          disabled={inIframe || !sttSupported}
          className={voiceMode
            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
            : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-semibold'}
          data-testid="voice-fill-toggle"
        >
          {voiceMode ? <><Pause className="w-4 h-4 mr-1" /> Pause</> : <><Mic className="w-4 h-4 mr-1" /> Voice Fill</>}
        </Button>
      </div>
      {inIframe && (
        <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          Mic is blocked inside this preview iframe. Open the app in a real Safari/Chrome tab to use Voice Fill.
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Service</div>
          <div className="grid md:grid-cols-2 gap-4">
            <div data-fieldkey="service_type" className={`rounded-md ${ringFor('service_type')}`}>
              <Label>Service Type</Label>
              <Select value={form.service_type} onValueChange={(v) => setField('service_type', v)}>
                <SelectTrigger data-testid="service-type" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setField('priority', v)}>
                <SelectTrigger data-testid="priority" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Customer</div>
          <div className="grid md:grid-cols-2 gap-4">
            <div data-fieldkey="customer_name" className={`relative rounded-md ${ringFor('customer_name')}`}>
              <Label>Name *</Label>
              <div className="relative">
                <Input data-testid="customer-name" value={form.customer_name} onChange={set('customer_name')} required className="pr-10" />
                {VOICEABLE_FIELDS.has('customer_name') && sttSupported && !inIframe && (
                  <FieldMicButton
                    active={activeFieldKey === 'customer_name'}
                    recording={ptt.recording && activeFieldKey === 'customer_name'}
                    onClick={() => recordSingleField('customer_name')}
                    testid="mic-customer-name"
                  />
                )}
              </div>
            </div>
            <div data-fieldkey="customer_phone" className={`relative rounded-md ${ringFor('customer_phone')}`}>
              <Label>Phone</Label>
              <div className="relative">
                <Input data-testid="customer-phone" value={form.customer_phone} onChange={set('customer_phone')} placeholder="+1..." className="pr-10" />
                <FieldMicButton
                  active={activeFieldKey === 'customer_phone'}
                  recording={ptt.recording && activeFieldKey === 'customer_phone'}
                  onClick={() => recordSingleField('customer_phone')}
                  testid="mic-customer-phone"
                />
              </div>
            </div>
            <div className="md:col-span-2"><Label>Email</Label><Input data-testid="customer-email" value={form.customer_email} onChange={set('customer_email')} /></div>
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Vehicle</div>
          <div className="grid md:grid-cols-3 gap-4">
            <div data-fieldkey="veh_year" className={`relative rounded-md ${ringFor('veh_year')}`}>
              <Label>Year</Label>
              <div className="relative">
                <Input data-testid="veh-year" value={form.veh_year} onChange={set('veh_year')} className="pr-10" />
                <FieldMicButton active={activeFieldKey === 'veh_year'} recording={ptt.recording && activeFieldKey === 'veh_year'} onClick={() => recordSingleField('veh_year')} testid="mic-veh-year" />
              </div>
            </div>
            <div data-fieldkey="veh_make" className={`relative rounded-md ${ringFor('veh_make')}`}>
              <Label>Make</Label>
              <div className="relative">
                <Input data-testid="veh-make" value={form.veh_make} onChange={set('veh_make')} className="pr-10" />
                <FieldMicButton active={activeFieldKey === 'veh_make'} recording={ptt.recording && activeFieldKey === 'veh_make'} onClick={() => recordSingleField('veh_make')} testid="mic-veh-make" />
              </div>
            </div>
            <div data-fieldkey="veh_model" className={`relative rounded-md ${ringFor('veh_model')}`}>
              <Label>Model</Label>
              <div className="relative">
                <Input data-testid="veh-model" value={form.veh_model} onChange={set('veh_model')} className="pr-10" />
                <FieldMicButton active={activeFieldKey === 'veh_model'} recording={ptt.recording && activeFieldKey === 'veh_model'} onClick={() => recordSingleField('veh_model')} testid="mic-veh-model" />
              </div>
            </div>
            <div data-fieldkey="veh_color" className={`relative rounded-md ${ringFor('veh_color')}`}>
              <Label>Color</Label>
              <div className="relative">
                <Input data-testid="veh-color" value={form.veh_color} onChange={set('veh_color')} className="pr-10" />
                <FieldMicButton active={activeFieldKey === 'veh_color'} recording={ptt.recording && activeFieldKey === 'veh_color'} onClick={() => recordSingleField('veh_color')} testid="mic-veh-color" />
              </div>
            </div>
            <div><Label>Plate</Label><Input data-testid="veh-plate" value={form.veh_plate} onChange={set('veh_plate')} /></div>
            <div><Label>VIN</Label><Input data-testid="veh-vin" value={form.veh_vin} onChange={set('veh_vin')} /></div>
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Locations</div>
          <div className="grid md:grid-cols-2 gap-4">
            <div data-fieldkey="pickup_address" className={`relative rounded-md ${ringFor('pickup_address')}`}>
              <Label>Pickup Address *</Label>
              <div className="relative">
                <Input data-testid="pickup-address" value={form.pickup_address} onChange={set('pickup_address')} required className="pr-10" />
                <FieldMicButton active={activeFieldKey === 'pickup_address'} recording={ptt.recording && activeFieldKey === 'pickup_address'} onClick={() => recordSingleField('pickup_address')} testid="mic-pickup-address" />
              </div>
            </div>
            <div data-fieldkey="dropoff_address" className={`relative rounded-md ${ringFor('dropoff_address')}`}>
              <Label>Dropoff Address</Label>
              <div className="relative">
                <Input data-testid="dropoff-address" value={form.dropoff_address} onChange={set('dropoff_address')} className="pr-10" />
                <FieldMicButton active={activeFieldKey === 'dropoff_address'} recording={ptt.recording && activeFieldKey === 'dropoff_address'} onClick={() => recordSingleField('dropoff_address')} testid="mic-dropoff-address" />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Billing</div>
          <div className="grid md:grid-cols-3 gap-4">
            <div data-fieldkey="quoted_price" className={`relative rounded-md ${ringFor('quoted_price')}`}>
              <Label>Quoted Price ($)</Label>
              <div className="relative">
                <Input data-testid="quoted-price" type="number" step="0.01" value={form.quoted_price} onChange={set('quoted_price')} className="pr-10" />
                <FieldMicButton active={activeFieldKey === 'quoted_price'} recording={ptt.recording && activeFieldKey === 'quoted_price'} onClick={() => recordSingleField('quoted_price')} testid="mic-quoted-price" />
              </div>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={form.payment_method} onValueChange={(v) => setField('payment_method', v)}>
                <SelectTrigger data-testid="payment-method" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="motor_club">Motor Club</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motor Club</Label>
              <Select value={form.motor_club_id || 'none'} onValueChange={(v) => setField('motor_club_id', v === 'none' ? '' : v)}>
                <SelectTrigger data-testid="motor-club" className="bg-[#07090d] border-white/10 text-white"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / Direct</SelectItem>
                  {clubs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-2">
          <Label>Dispatch Notes</Label>
          <div className="relative">
            <Textarea data-testid="notes" value={form.notes} onChange={set('notes')} rows={3} placeholder="Hazards, gate codes, special instructions..." className="pr-10" />
            <button
              type="button"
              onClick={() => recordSingleField('notes')}
              className={`absolute right-1.5 top-2 w-7 h-7 rounded-md flex items-center justify-center transition ${
                ptt.recording && activeFieldKey === 'notes'
                  ? 'bg-red-500/30 text-red-200 ring-1 ring-red-400/50 animate-pulse'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-slate-100'
              }`}
              data-testid="mic-notes"
              aria-label="Record notes"
            >
              {ptt.recording && activeFieldKey === 'notes' ? <Square className="w-3.5 h-3.5 fill-current" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
          </div>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pb-4">
          <Link to="/wrecker" className="sm:w-auto"><Button type="button" variant="outline" className="border-white/10 w-full sm:w-auto">Cancel</Button></Link>
          <Button data-testid="save-job" type="submit" disabled={saving} className="bg-amber-500 text-black hover:bg-amber-400 w-full sm:w-auto h-11 sm:h-10 font-semibold">
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Creating...' : 'Create Tow Job'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// Map our internal form key → input data-testid (used for focusing)
function fieldTestId(key) {
  const map = {
    customer_name: 'customer-name',
    customer_phone: 'customer-phone',
    pickup_address: 'pickup-address',
    dropoff_address: 'dropoff-address',
    veh_year: 'veh-year',
    veh_make: 'veh-make',
    veh_model: 'veh-model',
    veh_color: 'veh-color',
    quoted_price: 'quoted-price',
    notes: 'notes',
    service_type: 'service-type',
  };
  return map[key] || key;
}
