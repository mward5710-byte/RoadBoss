import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getUser } from '@/lib/api';
import {
  Mic, MicOff, Volume2, Bell, BellRing, Bot, Play, Square, Wrench, ArrowRight,
  ClipboardCheck, ClipboardX, ExternalLink, AlertTriangle, LifeBuoy, Sparkles,
  ChevronDown, ChevronUp, Sun, Inbox, Truck, Moon, MapPin,
} from 'lucide-react';
import { dutyColor, formatMinutes, severityColor, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { isInIframe, supportsSTT } from '@/hooks/useWakeWord';
import { computeDriverShift } from '@/hooks/useDriverShift';

const speak = (text) => {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 1; u.volume = 1; u.lang = 'en-US';
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  } catch {}
};

const DUTY_OPTIONS = [
  { key: 'driving', label: 'Driving', color: 'sky' },
  { key: 'on_duty', label: 'On duty', color: 'amber' },
  { key: 'off_duty', label: 'Off duty', color: 'slate' },
  { key: 'sleeper', label: 'Sleeper', color: 'purple' },
];

export default function DriverHome() {
  const user = getUser();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [trips, setTrips] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [busyDvir, setBusyDvir] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [showWakeHint, setShowWakeHint] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const recogRef = useRef(null);
  const sttSupported = supportsSTT();

  const refresh = async () => {
    try {
      const drivers = (await api.get('/drivers')).data;
      const mine = drivers.find((d) => d.email === user.email) || drivers[0];
      setMe(mine);
      setTrips((await api.get('/trips')).data);
      setAlerts((await api.get('/alerts')).data);
      try { setReminders((await api.get('/maintenance/reminders')).data); } catch {}
      try { setInspections((await api.get('/inspections')).data); } catch {}
    } catch {}
  };
  useEffect(() => { refresh(); /* refresh every minute so state-machine reflects new dispatches */ const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [user.email]);

  useEffect(() => {
    try { if (!localStorage.getItem('roadboss.wake_hint_seen.v1')) setShowWakeHint(true); } catch {}
  }, []);

  const dismissWakeHint = () => {
    try { localStorage.setItem('roadboss.wake_hint_seen.v1', '1'); } catch {}
    setShowWakeHint(false);
  };

  const handleVoice = async (text) => {
    setTranscript(text); setResponse('Thinking...');
    try {
      const r = await api.post('/copilot/chat', { message: text });
      const reply = r.data?.reply || ''; setResponse(reply);
      if (reply) speak(reply);
      const action = r.data?.action;
      if (action?.executed) {
        const t = action.type;
        if (t === 'duty_change') toast.success(`Status: ${action.new_status?.replace('_', ' ')}`);
        if (t === 'start_trip') toast.success(`Trip started: ${action.origin} → ${action.destination}`);
        if (t === 'end_trip') toast.success('Trip completed');
        if (t === 'log_fuel') toast.success('Fuel stop logged');
        if (t === 'start_inspection' && action.redirect) {
          toast.success(`${action.inspection_type === 'pre_trip' ? 'Pre' : 'Post'}-trip started`);
          setTimeout(() => navigate(action.redirect), 800);
          return;
        }
        if (t === 'dispatch_roadside' && action.redirect) {
          toast.success(`Roadside dispatched: ${action.provider_name || action.service_type}`);
          setTimeout(() => navigate(action.redirect), 1200);
          return;
        }
        await refresh();
      } else if (action?.error) {
        toast.info(action.error);
      }
    } catch {
      const msg = 'Co-Pilot is unavailable right now.';
      setResponse(msg); toast.error(msg);
    }
  };

  const startListening = () => {
    if (!sttSupported) {
      const t = window.prompt('Type a command (e.g., "switch to sleeper", "start my pre-trip"):');
      if (t) handleVoice(t); return;
    }
    if (isInIframe()) {
      toast.error('Mic blocked in preview. Open in a real Safari tab.', {
        action: { label: 'Open', onClick: () => window.open(window.location.href, '_blank') }, duration: 8000,
      }); return;
    }
    const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new Recog();
    r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1;
    r.onstart = () => setListening(true);
    r.onerror = (ev) => {
      setListening(false);
      const code = ev?.error;
      if (code === 'audio-capture') toast.error('Mic blocked. Open in a real tab.', { action: { label: 'Open in tab', onClick: () => window.open(window.location.href, '_blank') } });
      else if (code === 'not-allowed') toast.error('Mic permission denied. Allow it in browser settings.');
      else if (code !== 'aborted' && code !== 'no-speech') toast.error(`Mic error: ${code}`);
    };
    r.onend = () => setListening(false);
    r.onresult = (e) => handleVoice(e.results[0][0].transcript);
    r.start(); recogRef.current = r;
  };

  const dutyStyle = (k) => ({
    sky: 'bg-sky-500/10 border-sky-500/30 text-sky-200',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
    slate: 'bg-slate-500/10 border-slate-500/30 text-slate-200',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-200',
  }[k]);

  const setDuty = async (status) => {
    setBusyAction(`duty_${status}`);
    try { await api.post('/hos', { driver_id: me?.id, duty_status: status }); await refresh(); toast.success(`Status: ${status.replace('_', ' ')}`); }
    catch { toast.error('Failed to change duty'); }
    finally { setBusyAction(''); }
  };

  const startNextTrip = async () => {
    const planned = trips.find((t) => t.driver_id === me?.id && t.status === 'planned');
    if (!planned) { toast.info('No planned trip ready.'); return; }
    setBusyAction('start_trip');
    try { await api.post(`/trips/${planned.id}/start`); toast.success('Trip started'); await refresh(); }
    catch { toast.error('Failed to start trip'); }
    finally { setBusyAction(''); }
  };

  const endActiveTrip = async () => {
    const active = trips.find((t) => t.driver_id === me?.id && t.status === 'active');
    if (!active) return;
    setBusyAction('end_trip');
    try { await api.post(`/trips/${active.id}/end`); toast.success('Trip ended. Time for post-trip.'); await refresh(); }
    catch { toast.error('Failed to end trip'); }
    finally { setBusyAction(''); }
  };

  const startInspection = async (inspection_type) => {
    setBusyDvir(inspection_type);
    try {
      const r = await api.post('/inspections', { inspection_type });
      navigate(`/driver/inspection/${r.data.id}`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not start'); }
    finally { setBusyDvir(''); }
  };

  if (!me) return <div className="p-8 text-slate-500 text-center">Loading...</div>;

  const shift = computeDriverShift({ me, trips, inspections, reminders });
  const myAlerts = alerts.filter((a) => !a.driver_id || a.driver_id === me.id).slice(0, 3);
  const newAlertCount = myAlerts.filter((a) => !a.read).length;
  const dc = dutyColor[me.status] || dutyColor.off_duty;
  const pct = Math.max(0, Math.min(100, (me.hos_remaining_minutes / (11 * 60)) * 100));
  const barColor = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500';

  // ---------- PRIMARY ACTION RENDERER ----------
  const renderPrimary = () => {
    const k = shift.primary?.kind;
    if (k === 'pre_trip') {
      return (
        <div className="rounded-2xl p-5 bg-gradient-to-br from-sky-500/20 via-sky-500/10 to-transparent border-2 border-sky-500/40 hp-glow" data-testid="primary-pre-trip">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-sky-400/80"><Sun className="w-3 h-3" /> Step 1 — Start of shift</div>
          <div className="text-2xl font-bold text-white mt-2">Pre-Trip Inspection</div>
          <div className="text-sm text-slate-300 mt-1">FMCSA requires this before you turn the key. We'll walk you through it by voice.</div>
          {shift.maintWarning && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" /> {shift.maintWarning} maintenance reminder{shift.maintWarning === 1 ? '' : 's'} due — pay extra attention.
            </div>
          )}
          <Button onClick={() => startInspection('pre_trip')} disabled={busyDvir !== ''} className="w-full mt-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-6 text-base" data-testid="primary-pre-trip-btn">
            {busyDvir === 'pre_trip' ? 'Starting...' : <><ClipboardCheck className="w-5 h-5 mr-2" /> Start Pre-Trip</>}
          </Button>
          <div className="text-[10px] text-slate-500 text-center mt-2">Or say "Hey Co-Pilot, start my pre-trip"</div>
        </div>
      );
    }
    if (k === 'await_dispatch') {
      return (
        <div className="rounded-2xl p-5 hp-panel-bordered" data-testid="primary-await-dispatch">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-amber-400/80"><Inbox className="w-3 h-3" /> Step 2 — Awaiting load</div>
          <div className="text-2xl font-bold text-white mt-2">Pre-trip done. Watching for dispatch.</div>
          <div className="text-sm text-slate-400 mt-1">Your truck is cleared. We'll notify you the moment a load is assigned.</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => setDuty('on_duty')} disabled={busyAction !== ''} variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10" data-testid="go-on-duty-btn"><Play className="w-4 h-4 mr-1" /> Go on duty</Button>
            <Link to="/driver/copilot"><Button variant="outline" className="w-full border-sky-500/40 text-sky-300 hover:bg-sky-500/10" data-testid="ask-copilot-btn"><Bot className="w-4 h-4 mr-1" /> Ask Co-Pilot</Button></Link>
          </div>
        </div>
      );
    }
    if (k === 'planned_trip') {
      const t = shift.primary.trip;
      return (
        <div className="rounded-2xl p-5 bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent border-2 border-emerald-500/40 hp-glow" data-testid="primary-planned-trip">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-400/80"><Truck className="w-3 h-3" /> Step 3 — Load ready</div>
          <div className="text-xl font-bold text-white mt-2 leading-tight">{t.origin} → {t.destination}</div>
          <div className="text-xs text-slate-400 mt-1">{(t.miles || 0).toLocaleString()} miles · planned</div>
          <Button onClick={startNextTrip} disabled={busyAction !== ''} className="w-full mt-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-6 text-base" data-testid="primary-start-trip-btn">
            <Play className="w-5 h-5 mr-2" /> {busyAction === 'start_trip' ? 'Starting...' : 'Start Trip'}
          </Button>
          <Link to={`/driver/trips/${t.id}`} className="block mt-2 text-center text-xs text-slate-400 hover:text-white" data-testid="view-trip-link">View route map →</Link>
        </div>
      );
    }
    if (k === 'active_trip') {
      const t = shift.primary.trip;
      return (
        <div className="rounded-2xl p-5 bg-gradient-to-br from-sky-500/20 via-sky-500/10 to-transparent border-2 border-sky-500/40 hp-glow" data-testid="primary-active-trip">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-sky-400/80"><span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" /> ON THE ROAD</div>
            <span className="text-[10px] text-slate-500">{(t.miles || 0).toLocaleString()} mi</span>
          </div>
          <div className="text-xl font-bold text-white mt-2 leading-tight">{t.origin} → {t.destination}</div>
          <div className="mt-3 flex items-end gap-3">
            <div>
              <div className="text-3xl font-bold hp-chrome-text leading-none">{formatMinutes(me.hos_remaining_minutes)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">drive time remaining</div>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden"><div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to={`/driver/trips/${t.id}`}><Button variant="outline" className="w-full border-white/15 text-slate-200" data-testid="view-route-btn"><MapPin className="w-4 h-4 mr-1" /> Route map</Button></Link>
            <Button onClick={endActiveTrip} disabled={busyAction !== ''} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold" data-testid="end-trip-btn"><Square className="w-4 h-4 mr-1" /> End trip</Button>
          </div>
        </div>
      );
    }
    if (k === 'post_trip') {
      const t = shift.primary.trip;
      return (
        <div className="rounded-2xl p-5 bg-gradient-to-br from-purple-500/20 via-purple-500/10 to-transparent border-2 border-purple-500/40 hp-glow" data-testid="primary-post-trip">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-purple-400/80"><ClipboardX className="w-3 h-3" /> Step 5 — Wrap it up</div>
          <div className="text-xl font-bold text-white mt-2 leading-tight">Post-Trip Inspection</div>
          <div className="text-sm text-slate-300 mt-1">You finished {t.origin} → {t.destination}. FMCSA requires a post-trip before you can clock out.</div>
          <Button onClick={() => startInspection('post_trip')} disabled={busyDvir !== ''} className="w-full mt-4 bg-purple-500 hover:bg-purple-400 text-white font-bold py-6 text-base" data-testid="primary-post-trip-btn">
            {busyDvir === 'post_trip' ? 'Starting...' : <><ClipboardX className="w-5 h-5 mr-2" /> Start Post-Trip</>}
          </Button>
          <div className="text-[10px] text-slate-500 text-center mt-2">Or say "Hey Co-Pilot, post-trip"</div>
        </div>
      );
    }
    if (k === 'rest') {
      return (
        <div className="rounded-2xl p-5 hp-panel-bordered text-center" data-testid="primary-rest">
          <Moon className="w-10 h-10 text-purple-300 mx-auto" />
          <div className="text-[10px] uppercase tracking-widest text-purple-400/80 mt-2">Day complete</div>
          <div className="text-xl font-bold text-white mt-1">All clear. Get some rest, boss.</div>
          <div className="text-sm text-slate-400 mt-1">Pre-trip and post-trip done. We'll wake you up tomorrow.</div>
        </div>
      );
    }
    return null;
  };

  // ---------- SHIFT PROGRESS BAR ----------
  const SHIFT_STEPS = [
    { key: 'start_of_shift', label: 'Pre-trip', icon: Sun },
    { key: 'waiting_dispatch', label: 'Dispatch', icon: Inbox },
    { key: 'ready_to_roll', label: 'Load ready', icon: Truck },
    { key: 'driving', label: 'Driving', icon: Play },
    { key: 'needs_post_trip', label: 'Post-trip', icon: ClipboardX },
    { key: 'off_duty', label: 'Rest', icon: Moon },
  ];
  const stepIdx = SHIFT_STEPS.findIndex((s) => s.key === shift.state);

  return (
    <div className="p-5 space-y-4">
      {/* First-run wake-word tip */}
      {showWakeHint && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-3 bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2" data-testid="wake-hint-card">
          <Sparkles className="w-4 h-4 text-emerald-300 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-xs text-slate-300">
            <span className="font-semibold text-white">Tip:</span> tap the wake-word pill at the bottom, then say <span className="text-emerald-300">"Hey Co-Pilot"</span> for hands-free voice.
          </div>
          <button onClick={dismissWakeHint} className="text-slate-400 hover:text-white text-[10px] uppercase tracking-wider" data-testid="wake-hint-dismiss">Got it</button>
        </motion.div>
      )}

      {/* Shift progress dots */}
      <div className="flex items-center justify-between gap-1 px-1" data-testid="shift-progress">
        {SHIFT_STEPS.map((s, i) => {
          const Icon = s.icon;
          const reached = i <= stepIdx;
          const current = i === stepIdx;
          return (
            <div key={s.key} className="flex-1 flex flex-col items-center gap-1" data-testid={`shift-step-${s.key}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${current ? 'bg-sky-500 border-sky-300 text-slate-950 scale-110' : reached ? 'bg-sky-500/30 border-sky-500/50 text-sky-200' : 'bg-white/5 border-white/10 text-slate-600'} transition-transform`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className={`text-[9px] uppercase tracking-wider ${current ? 'text-white font-semibold' : reached ? 'text-slate-400' : 'text-slate-600'}`}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* PRIMARY ACTION CARD */}
      {renderPrimary()}

      {/* HOS quick read (always visible \u2014 compliance critical) */}
      {shift.state !== 'driving' && (
        <div className="rounded-2xl p-4 hp-panel" data-testid="hos-secondary">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-slate-400">Hours of service</div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${dc.bg} ${dc.text} uppercase tracking-wider`}>{dc.label}</span>
          </div>
          <div className="mt-2 flex items-end gap-3">
            <div className="text-3xl font-bold hp-chrome-text leading-none">{formatMinutes(me.hos_remaining_minutes)}</div>
            <div className="text-xs text-slate-500 mb-1">remaining today</div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden"><div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {/* Critical Alerts (show inline if any) */}
      {newAlertCount > 0 && (
        <Link to="/driver?tab=alerts" data-testid="alerts-banner">
          <div className="rounded-2xl p-3 bg-red-500/10 border border-red-500/30 flex items-center gap-3">
            <BellRing className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div className="flex-1 min-w-0 text-sm">
              <div className="text-white font-semibold">{newAlertCount} new alert{newAlertCount === 1 ? '' : 's'}</div>
              <div className="text-xs text-slate-400 truncate">{myAlerts[0]?.message}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-red-400" />
          </div>
        </Link>
      )}

      {/* Voice command quick-tap (always available) */}
      <div className="rounded-2xl p-4 hp-panel" data-testid="voice-card">
        <div className="flex items-center gap-3">
          <button onClick={startListening} disabled={listening || !me} className={`relative w-14 h-14 rounded-full flex items-center justify-center border-2 transition-colors ${listening ? 'bg-red-500/20 border-red-500/60 hp-voice-ring' : 'bg-sky-500/20 border-sky-500/40 hover:bg-sky-500/30'}`} data-testid="home-mic-btn">
            {listening ? <MicOff className="w-6 h-6 text-red-200" /> : <Mic className="w-6 h-6 text-sky-300" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-sky-400/80">Quick voice command</div>
            <div className="text-xs text-slate-400 mt-0.5">{listening ? 'Listening... speak now' : 'Tap and ask Co-Pilot anything.'}</div>
          </div>
        </div>
        <AnimatePresence>
          {(transcript || response) && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 pt-3 border-t border-white/5 overflow-hidden">
              {transcript && <div className="text-xs text-slate-300">"{transcript}"</div>}
              {response && <div className="mt-1 text-xs text-sky-300 inline-flex items-center gap-1"><Volume2 className="w-3 h-3" /> {response}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* COLLAPSIBLE "MORE TOOLS" DRAWER */}
      <button
        onClick={() => setMoreOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-white/5 hover:border-white/10 text-slate-400 hover:text-white text-sm transition-colors"
        data-testid="more-tools-toggle"
        aria-expanded={moreOpen}
      >
        <span className="flex items-center gap-2"><Wrench className="w-4 h-4" /> More tools</span>
        {moreOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      <AnimatePresence>
        {moreOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-3 pt-1">
              {/* Talk to Co-Pilot full screen */}
              <Link to="/driver/copilot" data-testid="more-copilot">
                <div className="rounded-2xl p-4 bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-3">
                  <Bot className="w-5 h-5 text-sky-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">Talk to Co-Pilot</div>
                    <div className="text-xs text-slate-400">Full conversation, hands-free mode</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                </div>
              </Link>
              {/* Roadside */}
              <Link to="/driver/roadside" data-testid="more-roadside">
                <div className="rounded-2xl p-4 bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 flex items-center gap-3">
                  <LifeBuoy className="w-5 h-5 text-amber-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">Roadside assistance</div>
                    <div className="text-xs text-slate-400">Tire, tow, fuel, mechanical</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                </div>
              </Link>
              {/* Manual DVIR triggers (so driver can re-do at any point) */}
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => startInspection('pre_trip')} disabled={busyDvir !== ''} variant="outline" className="border-white/10 text-slate-300 hover:bg-white/5" data-testid="more-pre-trip"><ClipboardCheck className="w-4 h-4 mr-1" /> Pre-Trip</Button>
                <Button onClick={() => startInspection('post_trip')} disabled={busyDvir !== ''} variant="outline" className="border-white/10 text-slate-300 hover:bg-white/5" data-testid="more-post-trip"><ClipboardX className="w-4 h-4 mr-1" /> Post-Trip</Button>
              </div>
              {/* Manual duty change grid */}
              <div className="rounded-2xl p-4 hp-panel">
                <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">Change duty status</div>
                <div className="grid grid-cols-4 gap-2">
                  {DUTY_OPTIONS.map((d) => (
                    <button key={d.key} onClick={() => setDuty(d.key)} disabled={busyAction !== '' || me.status === d.key} className={`p-2 rounded-lg border text-[10px] uppercase tracking-wider font-semibold ${me.status === d.key ? `${dutyStyle(d.color)} ring-1 ring-inset` : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`} data-testid={`duty-${d.key}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Maintenance reminders peek */}
              {reminders.length > 0 && (
                <Link to="/driver/truck" data-testid="more-maint">
                  <div className="rounded-2xl p-4 bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-3">
                    <Wrench className="w-5 h-5 text-amber-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">Maintenance ({reminders.length})</div>
                      <div className="text-xs text-slate-400 truncate">{reminders[0]?.label || reminders[0]?.service_type}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                  </div>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Iframe nudge — non-blocking */}
      {isInIframe() && sttSupported && (
        <div className="text-[10px] text-amber-400/80 text-center pt-1 flex items-center justify-center gap-1" data-testid="iframe-nudge">
          <ExternalLink className="w-3 h-3" />
          For voice features, <button onClick={() => window.open(window.location.href, '_blank')} className="underline">open in a real tab</button>
        </div>
      )}
    </div>
  );
}
