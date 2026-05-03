import React, { useEffect, useRef, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { Mic, MicOff, Volume2, Bell, Route as RouteIcon, Activity, BellRing, Bot } from 'lucide-react';
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

export default function DriverHome() {
  const user = getUser();
  const [me, setMe] = useState(null);
  const [trips, setTrips] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const recogRef = useRef(null);
  const supportsSTT = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => { (async () => {
    const drivers = (await api.get('/drivers')).data;
    const mine = drivers.find((d) => d.email === user.email) || drivers[0];
    setMe(mine);
    setTrips((await api.get('/trips')).data);
    setAlerts((await api.get('/alerts')).data);
  })(); }, [user.email]);

  const handleVoice = async (text) => {
    setTranscript(text); setResponse('Thinking...');
    try {
      const r = await api.post('/voice/command', { transcript: text });
      setResponse(r.data.response);
      speak(r.data.response);
    } catch (e) { setResponse('Voice service unavailable.'); }
  };

  const startListening = () => {
    if (!supportsSTT) {
      toast.error('Voice recognition not supported in this browser. Try Chrome/Safari on iPhone.');
      // graceful demo: prompt for typed command
      const t = window.prompt('Type a command (e.g., "check HOS", "read alerts", "help"):');
      if (t) handleVoice(t);
      return;
    }
    const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new Recog();
    r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1;
    r.onstart = () => setListening(true);
    r.onerror = () => { setListening(false); toast.error('Could not capture audio.'); };
    r.onend = () => setListening(false);
    r.onresult = (e) => {
      const t = e.results[0][0].transcript;
      handleVoice(t);
    };
    r.start();
    recogRef.current = r;
  };
  const stopListening = () => { recogRef.current?.stop(); setListening(false); };

  if (!me) return <div className="p-6 text-slate-400">Loading cab...</div>;
  const dc = dutyColor[me.status] || dutyColor.off_duty;
  const pct = Math.min(100, Math.max(0, ((me.hos_remaining_minutes || 0) / 660) * 100));
  const barColor = pct < 15 ? 'bg-red-500' : pct < 35 ? 'bg-amber-500' : 'bg-sky-500';
  const activeTrip = trips.find((t) => t.driver_id === me.id && t.status === 'active');
  const recentAlerts = alerts.slice(0, 3);

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

      {/* Voice command */}
      <div className="hp-panel rounded-2xl p-6 text-center">
        <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">Voice command</div>
        <div className="flex flex-col items-center gap-4">
          <button data-testid="voice-button" onClick={listening ? stopListening : startListening} className={`relative w-24 h-24 rounded-full flex items-center justify-center transition ${listening ? 'bg-red-500 hp-voice-ring' : 'bg-sky-500 hover:bg-sky-400'}`}>
            {listening ? <MicOff className="w-9 h-9 text-white" /> : <Mic className="w-9 h-9 text-slate-950" />}
          </button>
          <div className="text-xs text-slate-400">{listening ? 'Listening... speak now' : 'Tap to speak. Try: "check HOS", "read alerts", "help".'}</div>
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

      {/* Active trip */}
      <div className="hp-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3"><div className="text-xs uppercase tracking-widest text-sky-400/80 flex items-center gap-2"><RouteIcon className="w-3.5 h-3.5" /> Active trip</div></div>
        {activeTrip ? (
          <div>
            <div className="text-lg text-white font-semibold">{activeTrip.origin} → {activeTrip.destination}</div>
            <div className="text-xs text-slate-500">{(activeTrip.miles || 0).toLocaleString()} mi · status: {activeTrip.status}</div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">No active trip. Say "start trip" to begin.</div>
        )}
      </div>

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
