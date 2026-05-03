import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getUser } from '@/lib/api';
import { Mic, MicOff, Volume2, Bell, Route as RouteIcon, BellRing, Bot, Play, Square, Wrench, ArrowRight, ClipboardCheck, ClipboardX } from 'lucide-react';
import { dutyColor, formatMinutes, severityColor, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1; u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) { console.error('TTS failed', e); }
}

const dutyOptions = [
  { value: 'driving', label: 'Driving', color: 'sky' },
  { value: 'on_duty', label: 'On Duty', color: 'amber' },
  { value: 'off_duty', label: 'Off Duty', color: 'zinc' },
  { value: 'sleeper', label: 'Sleeper', color: 'purple' },
];

const dutyBtn = {
  sky: 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20',
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20',
  zinc: 'bg-slate-500/10 border-slate-500/30 text-slate-300 hover:bg-slate-500/20',
  purple: 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20',
};

export default function DriverHome() {
  const user = getUser();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [trips, setTrips] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [busyDvir, setBusyDvir] = useState('');
  const recogRef = useRef(null);
  const supportsSTT = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const refresh = async () => {
    const drivers = (await api.get('/drivers')).data;
    const mine = drivers.find((d) => d.email === user.email) || drivers[0];
    setMe(mine);
    setTrips((await api.get('/trips')).data);
    setAlerts((await api.get('/alerts')).data);
    try { setReminders((await api.get('/maintenance/reminders')).data); } catch {}
  };
  useEffect(() => { refresh(); }, [user.email]);

  const handleVoice = async (text) => {
    setTranscript(text); setResponse('Thinking...');
    try {
      // Route through AI Co-Pilot — smarter intent + executes real actions
      const r = await api.post('/copilot/chat', { message: text });
      const reply = r.data?.reply || '';
      setResponse(reply);
      if (reply) speak(reply);
      const action = r.data?.action;
      if (action?.executed) {
        const t = action.type;
        if (t === 'duty_change') toast.success(`Status changed to ${action.new_status?.replace('_', ' ')}`);
        if (t === 'start_trip') toast.success(`Trip started: ${action.origin} → ${action.destination}`);
        if (t === 'end_trip') toast.success('Trip completed');
        if (t === 'log_fuel') toast.success('Fuel stop logged');
        if (t === 'start_inspection' && action.redirect) {
          toast.success('Pre-trip inspection started');
          setTimeout(() => navigate(action.redirect), 800);
          return;
        }
        // Refresh state since something changed
        await refresh();
      } else if (action && action.error) {
        toast.info(action.error);
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Co-Pilot is unavailable right now.';
      setResponse(msg);
      toast.error(msg);
    }
  };

  const startListening = () => {
    if (!supportsSTT) {
      const t = window.prompt('Type a command (e.g., "check HOS", "start trip", "on duty", "help"):');
      if (t) handleVoice(t);
      return;
    }
    const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new Recog();
    r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1;
    r.onstart = () => setListening(true);
    r.onerror = () => { setListening(false); toast.error('Could not capture audio.'); };
    r.onend = () => setListening(false);
    r.onresult = (e) => handleVoice(e.results[0][0].transcript);
    r.start();
    recogRef.current = r;
  };
  const stopListening = () => { recogRef.current?.stop(); setListening(false); };

  const changeDuty = async (status) => {
    if (!me) return;
    try {
      await api.post('/hos', { driver_id: me.id, duty_status: status });
      toast.success(`Status changed to ${status.replace('_', ' ')}`);
      await refresh();
    } catch { toast.error('Failed to change status'); }
  };

  const startNextTrip = async () => {
    if (!me) return;
    const planned = trips.find((t) => t.driver_id === me.id && t.status === 'planned');
    if (!planned) { toast.info('No planned trip ready to start.'); return; }
    try {
      await api.post(`/trips/${planned.id}/start`);
      toast.success('Trip started');
      await refresh();
    } catch { toast.error('Failed to start trip'); }
  };

  const startInspection = async (inspection_type) => {
    setBusyDvir(inspection_type);
    try {
      const r = await api.post('/inspections', { inspection_type });
      toast.success(`${inspection_type === 'pre_trip' ? 'Pre' : 'Post'}-trip inspection started`);
      navigate(`/driver/inspection/${r.data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not start inspection');
    } finally { setBusyDvir(''); }
  };

  const endActiveTrip = async () => {
    if (!me) return;
    const active = trips.find((t) => t.driver_id === me.id && t.status === 'active');
    if (!active) { toast.info('No active trip.'); return; }
    try {
      await api.post(`/trips/${active.id}/end`, {});
      toast.success('Trip completed');
      await refresh();
    } catch { toast.error('Failed to end trip'); }
  };

  if (!me) return <div className="p-6 text-slate-400">Loading cab...</div>;
  const dc = dutyColor[me.status] || dutyColor.off_duty;
  const pct = Math.min(100, Math.max(0, ((me.hos_remaining_minutes || 0) / 660) * 100));
  const barColor = pct < 15 ? 'bg-red-500' : pct < 35 ? 'bg-amber-500' : 'bg-sky-500';
  const activeTrip = trips.find((t) => t.driver_id === me.id && t.status === 'active');
  const plannedTrip = trips.find((t) => t.driver_id === me.id && t.status === 'planned');
  const recentAlerts = alerts.slice(0, 3);
  const myReminders = reminders.filter((r) => !me.vehicle_id || r.vehicle_id === me.vehicle_id);

  return (
    <div className="p-5 space-y-5">
      {/* HOS card */}
      <div className="hp-panel-bordered rounded-2xl p-5 hp-glow">
        <div className="flex items-center justify-between"><div className="text-xs uppercase tracking-widest text-sky-400/80">Hours of service</div><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${dc.bg} ${dc.text} uppercase tracking-wider`}>{dc.label}</span></div>
        <div className="mt-3 flex items-end gap-3">
          <div className="text-5xl font-bold hp-chrome-text leading-none">{formatMinutes(me.hos_remaining_minutes)}</div>
          <div className="text-xs text-slate-500 mb-1">remaining today</div>
        </div>
        <div className="mt-4 h-2 rounded-full bg-white/5 overflow-hidden"><div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} /></div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-1.5"><span>0h</span><span>11h cap</span></div>
      </div>

      {/* AI Copilot launcher (Stage 3) */}
      <Link to="/driver/copilot" data-testid="open-copilot-card" className="block">
        <div className="rounded-2xl p-5 bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent border border-sky-500/30 hover:border-sky-400/50 transition-colors hp-glow">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center flex-shrink-0">
              <Bot className="w-7 h-7 text-sky-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-sky-400/80 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" /> Co-Pilot AI · Online
              </div>
              <div className="text-base font-semibold text-white mt-0.5">Talk to Co-Pilot</div>
              <div className="text-xs text-slate-400 mt-0.5 truncate">Hands-free voice partner. Ask anything.</div>
            </div>
            <ArrowRight className="w-5 h-5 text-sky-400 flex-shrink-0" />
          </div>
        </div>
      </Link>

      {/* DVIR launchers (FMCSA pre-trip + post-trip inspections) */}
      <div className="hp-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 flex items-center gap-2"><ClipboardCheck className="w-3.5 h-3.5" /> DVIR Inspections</div>
          <span className="text-[10px] text-slate-500">FMCSA 49 CFR § 396.11</span>
        </div>
        <div className="text-xs text-slate-400 mb-3">Required before and after every shift. Voice walkthrough — no need to look at the screen.</div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            data-testid="start-pretrip-btn"
            onClick={() => startInspection('pre_trip')}
            disabled={busyDvir !== ''}
            className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"
          >
            {busyDvir === 'pre_trip' ? 'Starting...' : <><ClipboardCheck className="w-4 h-4 mr-1.5" /> Pre-Trip</>}
          </Button>
          <Button
            data-testid="start-posttrip-btn"
            onClick={() => startInspection('post_trip')}
            disabled={busyDvir !== ''}
            variant="outline"
            className="border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
          >
            {busyDvir === 'post_trip' ? 'Starting...' : <><ClipboardX className="w-4 h-4 mr-1.5" /> Post-Trip</>}
          </Button>
        </div>
        <div className="mt-2 text-[10px] text-slate-500 text-center">
          Or just say "Hey Co-Pilot, start my pre-trip"
        </div>
      </div>

      {/* Duty quick-change */}
      <div className="hp-panel rounded-2xl p-5">
        <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">Change duty status</div>
        <div className="grid grid-cols-2 gap-2">
          {dutyOptions.map((o) => (
            <button key={o.value} data-testid={`duty-${o.value}`} onClick={() => changeDuty(o.value)} disabled={me.status === o.value}
              className={`px-3 py-3 rounded-lg border text-sm font-medium transition ${dutyBtn[o.color]} ${me.status === o.value ? 'opacity-50 cursor-not-allowed ring-2 ring-current' : ''}`}>
              {o.label}{me.status === o.value && ' ✓'}
            </button>
          ))}
        </div>
      </div>

      {/* Voice command */}
      <div className="hp-panel rounded-2xl p-6 text-center">
        <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">Voice command</div>
        <div className="flex flex-col items-center gap-4">
          <button data-testid="voice-button" onClick={listening ? stopListening : startListening} className={`relative w-24 h-24 rounded-full flex items-center justify-center transition ${listening ? 'bg-red-500 hp-voice-ring' : 'bg-sky-500 hover:bg-sky-400'}`}>
            {listening ? <MicOff className="w-9 h-9 text-white" /> : <Mic className="w-9 h-9 text-slate-950" />}
          </button>
          <div className="text-xs text-slate-400">{listening ? 'Listening... speak now' : 'Tap to talk to Co-Pilot. Try: "switch me to sleeper", "start my pre-trip", "how much HOS time do I have".'}</div>
          <AnimatePresence>
            {transcript && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm mx-auto space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">You said</div>
                <div className="text-sm text-white bg-white/5 rounded-lg p-3">“{transcript}”</div>
                {response && <>
                  <div className="text-[11px] uppercase tracking-wider text-sky-400/80 flex items-center gap-1.5 justify-center"><Bot className="w-3 h-3" /> Pilot replied</div>
                  <div className="text-sm text-sky-100 bg-sky-500/10 border border-sky-500/30 rounded-lg p-3">{response}</div>
                  <button onClick={() => speak(response)} className="text-xs text-sky-400 inline-flex items-center gap-1"><Volume2 className="w-3 h-3" /> Repeat</button>
                </>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Trip control */}
      <div className="hp-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 flex items-center gap-2"><RouteIcon className="w-3.5 h-3.5" /> Trip control</div>
        </div>
        {activeTrip ? (
          <div className="space-y-3">
            <div className="text-lg text-white font-semibold">{activeTrip.origin} → {activeTrip.destination}</div>
            <div className="text-xs text-slate-500">{(activeTrip.miles || 0).toLocaleString()} mi · active</div>
            <div className="flex gap-2">
              <Link to={`/driver/trips/${activeTrip.id}`} className="flex-1"><Button variant="outline" className="w-full border-white/10 text-slate-200">Open <ArrowRight className="w-4 h-4 ml-1" /></Button></Link>
              <Button data-testid="end-trip-btn" onClick={endActiveTrip} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold"><Square className="w-4 h-4 mr-1" /> End trip</Button>
            </div>
          </div>
        ) : plannedTrip ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-400">Next planned trip</div>
            <div className="text-lg text-white font-semibold">{plannedTrip.origin} → {plannedTrip.destination}</div>
            <Button data-testid="start-trip-btn" onClick={startNextTrip} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"><Play className="w-4 h-4 mr-1" /> Start trip</Button>
          </div>
        ) : (
          <div className="text-sm text-slate-500">No trips scheduled. Ask dispatch to add one.</div>
        )}
      </div>

      {/* Maintenance reminders */}
      {myReminders.length > 0 && (
        <div className="hp-panel rounded-2xl">
          <div className="p-4 border-b border-white/5 text-sm font-semibold text-white flex items-center gap-2"><Wrench className="w-4 h-4 text-emerald-400" /> Maintenance reminders</div>
          <div className="divide-y divide-white/5">
            {myReminders.map((m) => (
              <div key={m.id} className="p-4">
                <div className="text-sm text-white">{m.service_type}</div>
                <div className="text-xs text-slate-500">{m.vehicle_name} · {m.miles_remaining != null ? `${m.miles_remaining.toLocaleString()} mi remaining` : (m.days_remaining != null ? `${m.days_remaining} days` : 'Soon')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inbound message demo */}
      <div className="hp-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3"><div className="text-xs uppercase tracking-widest text-sky-400/80 flex items-center gap-2"><Volume2 className="w-3.5 h-3.5" /> Inbound message demo</div></div>
        <div className="text-sm text-slate-200">From dispatch: "Load 447 ready for pickup at 3 PM at the Memphis terminal."</div>
        <Button data-testid="read-msg-btn" onClick={() => speak('From dispatch. Load four forty seven ready for pickup at 3 PM at the Memphis terminal. Reply with confirm or push back.')} className="mt-3 w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"><Volume2 className="w-4 h-4 mr-2" /> Read aloud</Button>
      </div>

      {/* Alerts strip */}
      <div className="hp-panel rounded-2xl">
        <div className="p-4 border-b border-white/5 text-sm font-semibold text-white flex items-center gap-2"><BellRing className="w-4 h-4 text-amber-400" /> Recent alerts</div>
        <div className="divide-y divide-white/5">
          {recentAlerts.length === 0 && <div className="p-4 text-sm text-slate-500">All clear.</div>}
          {recentAlerts.map((a) => {
            const sc = severityColor[a.severity] || severityColor.info;
            return (<div key={a.id} className="p-4"><div className="flex items-center gap-2 mb-1"><span className={`text-[10px] px-1.5 py-0.5 rounded ${sc.bg} ${sc.text} uppercase tracking-wider border ${sc.border}`}>{a.severity}</span><span className="text-[10px] text-slate-500">{timeAgo(a.created_at)}</span></div><div className="text-sm text-slate-200">{a.message}</div></div>);
          })}
        </div>
      </div>
    </div>
  );
}
