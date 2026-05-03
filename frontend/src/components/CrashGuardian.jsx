// CrashGuardian — listens to DeviceMotion sensors and triggers an 'I'm OK' modal
// when a possible crash is detected. If driver doesn't respond in 15s, files a confirmed
// crash event and creates a critical alert. Mounted at DriverShell so it runs everywhere.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ShieldCheck, Phone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// G-force threshold for a 'possible crash'. ~3.5G is harsh impact territory.
const G_THRESHOLD = 3.5;
const G_HIGH = 5.0;
const COOLDOWN_MS = 60_000;
const CONFIRM_SECONDS = 15;

function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0; u.pitch = 1; u.volume = 1; u.lang = 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}

function alarmTone() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [0, 0.4].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(440, now + delay);
      osc.frequency.linearRampToValueAtTime(880, now + delay + 0.25);
      osc.type = 'square';
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.18, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.4);
    });
    setTimeout(() => { try { ctx.close(); } catch {} }, 1200);
  } catch {}
}

export function CrashGuardian() {
  const navigate = useNavigate();
  const [armed, setArmed] = useState(false);
  const [supported, setSupported] = useState(true);
  const [permState, setPermState] = useState('idle'); // idle | requesting | granted | denied
  const [event, setEvent] = useState(null); // {gForce, ts}
  const [counter, setCounter] = useState(CONFIRM_SECONDS);
  const lastFireRef = useRef(0);
  const timerRef = useRef(null);
  const navRef = useRef(navigate);
  useEffect(() => { navRef.current = navigate; }, [navigate]);

  // Detect whether DeviceMotion is even possible
  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      setSupported(false);
    }
  }, []);

  const handleMotion = useCallback((e) => {
    if (Date.now() - lastFireRef.current < COOLDOWN_MS) return;
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;
    const ax = a.x || 0, ay = a.y || 0, az = a.z || 0;
    // Magnitude in g (1g = 9.81 m/s^2). Subtract 1g static gravity baseline.
    const magnitude = Math.sqrt(ax*ax + ay*ay + az*az) / 9.81;
    const dynamicG = Math.abs(magnitude - 1.0);
    if (dynamicG >= G_THRESHOLD) {
      lastFireRef.current = Date.now();
      setEvent({ gForce: dynamicG, ts: Date.now() });
      setCounter(CONFIRM_SECONDS);
      try { alarmTone(); } catch {}
      try { speak("I detected a possible impact. Are you OK? Tap I'm fine, or stay silent and I'll send help."); } catch {}
    }
  }, []);

  const requestPermission = async () => {
    setPermState('requesting');
    try {
      // iOS 13+ requires explicit permission via DeviceMotionEvent.requestPermission()
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r === 'granted') {
          window.addEventListener('devicemotion', handleMotion, { passive: true });
          setPermState('granted');
          setArmed(true);
          toast.success('Crash Guardian armed.');
          try { localStorage.setItem('roadboss.crash_guardian.v1', 'on'); } catch {}
        } else {
          setPermState('denied');
          toast.error('Motion sensors blocked. Crash detection cannot run.');
        }
      } else {
        // Android / desktop: no explicit permission, just attach
        window.addEventListener('devicemotion', handleMotion, { passive: true });
        setPermState('granted');
        setArmed(true);
        toast.success('Crash Guardian armed.');
        try { localStorage.setItem('roadboss.crash_guardian.v1', 'on'); } catch {}
      }
    } catch (e) {
      setPermState('denied');
      toast.error('Could not enable motion sensors.');
    }
  };

  const disarm = useCallback(() => {
    try { window.removeEventListener('devicemotion', handleMotion); } catch {}
    setArmed(false);
    setPermState('idle');
    try { localStorage.setItem('roadboss.crash_guardian.v1', 'off'); } catch {}
    toast.info('Crash Guardian disarmed.');
  }, [handleMotion]);

  // Auto-rearm if previously enabled
  useEffect(() => {
    try {
      const pref = localStorage.getItem('roadboss.crash_guardian.v1');
      if (pref === 'on' && supported) {
        // re-attach without re-prompting on platforms that don't require it
        if (!(typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function')) {
          window.addEventListener('devicemotion', handleMotion, { passive: true });
          setPermState('granted');
          setArmed(true);
        }
      }
    } catch {}
    return () => { try { window.removeEventListener('devicemotion', handleMotion); } catch {} };
  }, [supported, handleMotion]);

  // Countdown when event triggered
  useEffect(() => {
    if (!event) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(() => {
      setCounter((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          // Confirmed crash: file with backend
          fileConfirmedCrash(event);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  const fileConfirmedCrash = async (ev) => {
    try {
      let lat = null, lng = null;
      if (navigator.geolocation) {
        await new Promise((res) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; res(); },
            () => res(),
            { timeout: 3000 }
          );
        });
      }
      const r = await api.post('/crash-events', {
        severity: ev.gForce >= G_HIGH ? 'critical' : 'high',
        g_force: ev.gForce,
        latitude: lat,
        longitude: lng,
        auto_detected: true,
        confirmed: true,
        notes: 'Auto-filed: driver did not respond within 15 seconds of detected impact.',
      });
      toast.error('Crash filed — fleet manager and emergency contacts notified.', { duration: 12000 });
      try { speak('Help is on the way. Stay calm and stay where you are.'); } catch {}
      // Navigate to crash status page
      setTimeout(() => navRef.current?.(`/driver/roadside?crash=${r.data.id}`), 1500);
    } catch (e) {
      toast.error('Could not file crash event. Try the SOS button.');
    } finally {
      setEvent(null);
    }
  };

  const dismissAsFalseAlarm = async () => {
    try {
      await api.post('/crash-events', {
        severity: 'low',
        g_force: event?.gForce,
        auto_detected: true,
        confirmed: false,
        notes: 'Driver dismissed false-alarm impact.',
      });
    } catch {}
    toast.info("Glad you're OK, boss.");
    setEvent(null);
  };

  // Manual SOS (driver presses panic button)
  const triggerSOS = async () => {
    setEvent({ gForce: 6.0, ts: Date.now() });
    setCounter(CONFIRM_SECONDS);
    try { alarmTone(); } catch {}
  };

  // Visible toggle (only when not armed) — tiny pill sitting next to Wake-word bar
  return (
    <>
      {/* Floating arm/disarm pill */}
      {!event && (
        <div className="fixed bottom-[88px] right-3 z-[2147483600]" data-testid="crash-guardian-pill">
          <button
            onClick={() => {
              if (armed) { disarm(); }
              else if (permState === 'denied') { toast.error('Motion sensors are blocked. Reload and allow.'); }
              else { requestPermission(); }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border backdrop-blur transition-colors text-[11px] font-medium shadow-lg
              ${armed ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200' : 'bg-slate-900/80 border-white/10 text-slate-400 hover:bg-white/5'}
            `}
            data-testid="crash-guardian-toggle"
            aria-label={armed ? 'Crash Guardian armed' : 'Arm Crash Guardian'}
            title={armed ? 'Crash Guardian: ON — tap to disarm' : 'Tap to arm Crash Guardian'}
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${armed ? 'text-emerald-300' : 'text-slate-500'}`} />
            <span>{armed ? 'Guardian: ON' : 'Guardian: OFF'}</span>
          </button>
        </div>
      )}

      {/* Manual SOS triangle button (always visible above wake-word bar in driver pages) */}
      {!event && armed && (
        <button
          onClick={triggerSOS}
          className="fixed bottom-[140px] right-3 z-[2147483600] w-12 h-12 rounded-full bg-red-500/95 hover:bg-red-400 text-white flex items-center justify-center shadow-xl border-2 border-red-300/60"
          data-testid="sos-btn"
          aria-label="Emergency SOS"
          title="Emergency SOS — sends crash alert"
        >
          <AlertTriangle className="w-6 h-6" />
        </button>
      )}

      {/* Crash modal */}
      {event && (
        <div className="fixed inset-0 z-[2147483700] bg-red-950/95 backdrop-blur-sm flex items-center justify-center p-5" data-testid="crash-modal" role="alertdialog" aria-live="assertive">
          <div className="max-w-md w-full bg-gradient-to-br from-red-900/90 to-red-950/90 border-2 border-red-500/60 rounded-3xl p-6 text-white shadow-2xl">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-red-500/30 border-2 border-red-400 flex items-center justify-center animate-pulse">
                <AlertTriangle className="w-10 h-10 text-red-200" />
              </div>
            </div>
            <div className="text-center mt-4">
              <div className="text-[11px] uppercase tracking-widest text-red-300">Possible Impact Detected</div>
              <div className="text-3xl font-bold mt-1">Are you OK?</div>
              <div className="text-sm text-red-200 mt-2">G-force: {event.gForce?.toFixed(1)}g</div>
              <div className="text-xs text-red-300 mt-3">Stay silent or do nothing and I'll alert emergency services and your fleet in <span className="font-bold text-white">{counter}s</span>.</div>
              <div className="mt-3 h-1.5 rounded-full bg-red-500/30 overflow-hidden">
                <div className="h-full bg-red-400 transition-all" style={{ width: `${(counter / CONFIRM_SECONDS) * 100}%` }} />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-2">
              <Button onClick={dismissAsFalseAlarm} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-6 text-lg" data-testid="crash-im-fine-btn">
                <ShieldCheck className="w-5 h-5 mr-2" /> I'm Fine — False Alarm
              </Button>
              <Button onClick={() => fileConfirmedCrash(event)} variant="outline" className="border-red-300 text-red-200 hover:bg-red-500/20 py-4" data-testid="crash-send-help-btn">
                <Phone className="w-4 h-4 mr-2" /> Send help now
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
