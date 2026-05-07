import React, { useEffect, useState, useCallback } from 'react';
import { api, getUser } from '@/lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, MapPin, Phone, Clock, ArrowRight, Truck, RefreshCw, AlertTriangle, CheckCircle2, Zap, Navigation, Radio } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { navUrl, NAV_APPS, getNavApp, setNavApp } from '@/lib/navPref';
import useDriverLocation from '@/hooks/useDriverLocation';

const STATUS_ORDER = ['assigned', 'en_route', 'on_scene', 'in_progress', 'completed'];
const STATUS_LABEL = { pending: 'Pending', assigned: 'Assigned', en_route: 'En Route', on_scene: 'On Scene', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_COLORS = {
  assigned: 'bg-sky-500/15 border-sky-500/30 text-sky-300',
  en_route: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
  on_scene: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  in_progress: 'bg-orange-500/15 border-orange-500/30 text-orange-300',
  completed: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
};

export default function WreckerDriverHome() {
  const navigate = useNavigate();
  const me = getUser();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Live GPS — auto-starts and pings backend every ~30s while on this page
  const loc = useDriverLocation({ autoStart: true });

  const load = useCallback(async () => {
    try {
      const r = await api.get('/wrecker/jobs');
      // Only active (not completed/cancelled) for driver focus
      setJobs(r.data);
    } catch (e) {
      toast.error('Could not load your calls');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const advance = async (jobId, status) => {
    try {
      await api.post(`/wrecker/jobs/${jobId}/status`, { status });
      toast.success(`Marked ${STATUS_LABEL[status]}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Status update failed');
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading your calls...</div>;

  const active = jobs.filter((j) => !['completed', 'cancelled'].includes(j.status))
    .sort((a, b) => {
      // Active first by priority then status order
      const pri = { emergency: 0, high: 1, normal: 2, low: 3 };
      const pdiff = (pri[a.priority] ?? 2) - (pri[b.priority] ?? 2);
      if (pdiff !== 0) return pdiff;
      return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    });
  const completed = jobs.filter((j) => j.status === 'completed').slice(0, 5);
  const current = active[0]; // The big "right now" card
  const rest = active.slice(1);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80">My Calls</div>
          <h1 className="text-3xl font-bold text-white mt-1" data-testid="driver-page-title">
            Welcome back, {(me?.name || 'Operator').split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Dispatch sends you the calls. Just update status as you work — no hunting, no picking.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <LocationStatusPill loc={loc} />
          <NavAppQuickPicker />
          <Button data-testid="driver-refresh" variant="outline" size="sm" onClick={load} className="border-white/10 text-slate-300">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </header>

      {/* CURRENT CALL — big card */}
      {current ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-500/[0.02] p-6"
          data-testid="current-call-card"
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold">Current Call</div>
              <h2 className="text-2xl font-bold text-white mt-1">{current.customer?.name}</h2>
              <div className="text-sm text-slate-300 mt-0.5">
                {(current.service_type || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                {current.motor_club_name && <span className="text-amber-300 ml-2">· {current.motor_club_name}</span>}
              </div>
            </div>
            <Badge className={`text-xs uppercase tracking-wider ${STATUS_COLORS[current.status] || ''}`}>
              {STATUS_LABEL[current.status]}
            </Badge>
          </div>

          {current.priority === 'emergency' && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-300 text-sm">
              <AlertTriangle className="w-4 h-4 animate-pulse" />
              <span className="font-semibold uppercase tracking-wider">Emergency Priority</span>
            </div>
          )}

          {current.vehicle && (
            <div className="text-base text-slate-200">
              {[current.vehicle.year, current.vehicle.color, current.vehicle.make, current.vehicle.model].filter(Boolean).join(' ')}
              {current.vehicle.plate && <span className="ml-2 text-slate-500">· {current.vehicle.plate}</span>}
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 text-sm text-slate-300">
            <MapPin className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
            <div className="flex-1">{current.pickup?.address}</div>
            {current.pickup?.address && (
              <a
                href={navUrl(current.pickup.address, current.pickup.lat, current.pickup.lng)}
                target="_blank"
                rel="noreferrer"
                data-testid="navigate-to-pickup"
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25 hover:text-sky-200 transition text-xs font-semibold"
                title={`Open in ${NAV_APPS.find((n) => n.key === getNavApp())?.label || 'Maps'}`}
              >
                <Navigation className="w-3.5 h-3.5" /> Navigate
              </a>
            )}
          </div>

          {/* Drop-off address with its OWN Navigate button — Mike: each
              destination gets its own one-tap nav, no scrolling. */}
          {current.dropoff?.address && (
            <div className="mt-2 flex items-start gap-2 text-sm text-slate-300">
              <Truck className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
              <div className="flex-1">{current.dropoff.address}</div>
              <a
                href={navUrl(current.dropoff.address, current.dropoff.lat, current.dropoff.lng)}
                target="_blank"
                rel="noreferrer"
                data-testid="navigate-to-dropoff"
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 hover:text-emerald-200 transition text-xs font-semibold"
                title={`Open in ${NAV_APPS.find((n) => n.key === getNavApp())?.label || 'Maps'}`}
              >
                <Navigation className="w-3.5 h-3.5" /> Navigate
              </a>
            </div>
          )}

          {current.notes && (
            <div className="mt-3 p-3 rounded-lg bg-black/30 border border-white/5 text-sm text-slate-300 leading-relaxed">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Dispatch Notes</span>
              {current.notes}
            </div>
          )}

          {/* Actions: only status update + call customer + open job. NO assign / reassign / cancel. */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
            {current.status === 'assigned' && (
              <Button data-testid="advance-en-route" onClick={() => advance(current.id, 'en_route')} className="bg-sky-500 hover:bg-sky-400 text-black">
                <Truck className="w-4 h-4 mr-1" /> En Route
              </Button>
            )}
            {current.status === 'en_route' && (
              <Button data-testid="advance-on-scene" onClick={() => advance(current.id, 'on_scene')} className="bg-amber-500 hover:bg-amber-400 text-black">
                <MapPin className="w-4 h-4 mr-1" /> On Scene
              </Button>
            )}
            {current.status === 'on_scene' && (
              <Button data-testid="advance-in-progress" onClick={() => advance(current.id, 'in_progress')} className="bg-orange-500 hover:bg-orange-400 text-black">
                <Zap className="w-4 h-4 mr-1" /> Hooking Up
              </Button>
            )}
            {(current.status === 'in_progress' || current.status === 'on_scene') && (
              <Button data-testid="advance-completed" onClick={() => advance(current.id, 'completed')} className="bg-emerald-500 hover:bg-emerald-400 text-black">
                <CheckCircle2 className="w-4 h-4 mr-1" /> Job Done
              </Button>
            )}
            {current.customer?.phone && (
              <a href={`tel:${current.customer.phone}`} className="contents">
                <Button data-testid="call-customer" variant="outline" className="border-white/15 text-slate-200 hover:bg-white/5">
                  <Phone className="w-4 h-4 mr-1" /> Call
                </Button>
              </a>
            )}
            <Button data-testid="open-job-detail" variant="outline" onClick={() => navigate(`/wrecker/jobs/${current.id}`)} className="border-white/15 text-slate-200 hover:bg-white/5">
              Details <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      ) : (
        <Card className="p-12 bg-[#0a0e14] border-white/5 text-center">
          <Truck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <div className="text-lg text-slate-300 font-semibold">No active calls right now</div>
          <div className="text-sm text-slate-500 mt-1">Dispatch will route the next one to you when you're up in rotation.</div>
        </Card>
      )}

      {/* Queue (the rest of MY active calls) */}
      {rest.length > 0 && (
        <section>
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Up Next ({rest.length})</div>
          <div className="space-y-2">
            {rest.map((j) => (
              <Card key={j.id} className="p-4 bg-[#0a0e14] border-white/5 hover:border-amber-500/30 transition cursor-pointer" onClick={() => navigate(`/wrecker/jobs/${j.id}`)} data-testid={`queued-${j.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{j.customer?.name}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {(j.service_type || '').replace(/_/g, ' ')} · {j.pickup?.address}
                    </div>
                  </div>
                  <Badge className={`text-[10px] uppercase tracking-wider shrink-0 ${STATUS_COLORS[j.status] || ''}`}>
                    {STATUS_LABEL[j.status]}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Recently completed */}
      {completed.length > 0 && (
        <section>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">Recently Completed</div>
          <div className="hp-panel rounded-xl divide-y divide-white/5">
            {completed.map((j) => (
              <Link to={`/wrecker/jobs/${j.id}`} key={j.id} className="flex items-center justify-between p-3 hover:bg-white/[0.02]">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-slate-200 truncate">{j.customer?.name}</div>
                    <div className="text-xs text-slate-500">{(j.service_type || '').replace(/_/g, ' ')}</div>
                  </div>
                </div>
                <div className="text-emerald-300 text-sm font-semibold shrink-0">${(j.final_price ?? j.quoted_price ?? 0).toFixed(0)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LocationStatusPill({ loc }) {
  const { status, lastSentAt, start } = loc;
  const colors = {
    on:         'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    requesting: 'border-amber-500/40 bg-amber-500/10 text-amber-300 animate-pulse',
    denied:     'border-red-500/40 bg-red-500/10 text-red-300',
    error:      'border-red-500/40 bg-red-500/10 text-red-300',
    idle:       'border-slate-500/30 bg-white/5 text-slate-300',
    unsupported: 'border-slate-500/30 bg-white/5 text-slate-500',
  };
  const labels = {
    on: 'GPS Live',
    requesting: 'Locating…',
    denied: 'GPS Blocked',
    error: 'GPS Error',
    idle: 'GPS Off',
    unsupported: 'No GPS',
  };
  const handleClick = () => {
    if (status === 'denied') {
      toast.error('Location is blocked. Open browser settings → Site Permissions → allow Location for this site.');
      return;
    }
    if (status !== 'on' && status !== 'requesting') start();
  };
  const ageText = lastSentAt
    ? `${Math.round((Date.now() - lastSentAt.getTime()) / 1000)}s ago`
    : null;
  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="driver-location-pill"
      title={status === 'on' ? `Last broadcast ${ageText}` : 'Tap to enable location sharing'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold transition ${colors[status] || colors.idle}`}
    >
      <Radio className={`w-3.5 h-3.5 ${status === 'on' ? 'animate-pulse' : ''}`} />
      <span>{labels[status] || 'GPS'}</span>
    </button>
  );
}


function NavAppQuickPicker() {
  const [current, setCurrent] = useState(getNavApp());
  useEffect(() => {
    const handler = (e) => setCurrent(e.detail);
    window.addEventListener('hp-nav-app-change', handler);
    return () => window.removeEventListener('hp-nav-app-change', handler);
  }, []);
  const cycle = () => {
    const idx = NAV_APPS.findIndex((n) => n.key === current);
    const next = NAV_APPS[(idx + 1) % NAV_APPS.length];
    setNavApp(next.key);
    setCurrent(next.key);
    toast.success(`Nav app: ${next.label}`);
  };
  const meta = NAV_APPS.find((n) => n.key === current) || NAV_APPS[0];
  return (
    <Button
      data-testid="driver-nav-picker"
      onClick={cycle}
      variant="outline"
      size="sm"
      className="border-white/10 text-slate-300 hover:text-white"
      title="Tap to change navigation app"
    >
      <Navigation className="w-4 h-4 mr-1 text-sky-300" /> {meta.short}
    </Button>
  );
}

