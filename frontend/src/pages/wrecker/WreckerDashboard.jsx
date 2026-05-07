import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Truck, Lock, Activity, DollarSign, Clock, MapPin, Phone, Plus, RefreshCw, ArrowUpRight, Zap, UserPlus, Navigation, Mic } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import DriversPanel from './DriversPanel';
import { navUrl, NAV_APPS, getNavApp, setNavApp } from '@/lib/navPref';

// Haversine distance between two lat/lng pairs, in miles. Returns null if any coord is missing.
function haversineMiles(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

const STATUS_COLORS = {
  pending:     'bg-slate-500/15 border-slate-500/30 text-slate-300',
  assigned:    'bg-sky-500/15 border-sky-500/30 text-sky-300',
  en_route:    'bg-blue-500/15 border-blue-500/30 text-blue-300',
  on_scene:    'bg-amber-500/15 border-amber-500/30 text-amber-300',
  in_progress: 'bg-orange-500/15 border-orange-500/30 text-orange-300',
  completed:   'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  cancelled:   'bg-red-500/15 border-red-500/30 text-red-300',
};

const PRIORITY_COLORS = {
  low:       'text-slate-400',
  normal:    'text-slate-200',
  high:      'text-amber-300',
  emergency: 'text-red-400 animate-pulse',
};

const BOARD_STATUSES = ['pending', 'assigned', 'en_route', 'on_scene', 'in_progress', 'completed'];

function Kpi({ icon: Icon, label, value, sub, accent = 'amber', onClick }) {
  const accents = {
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    sky: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
    red: 'text-red-300 bg-red-500/10 border-red-500/30',
    green: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  };
  const isClickable = typeof onClick === 'function';
  const interactiveClasses = isClickable
    ? 'cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 hover:border-amber-500/40 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 group'
    : '';
  const handleKey = (e) => {
    if (!isClickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={handleKey}
      className={`hp-panel rounded-xl p-4 ${interactiveClasses}`}
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${accents[accent]}`}><Icon className="w-4 h-4" /></div>
        {isClickable && (
          <ArrowUpRight className="w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-amber-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        )}
      </div>
      <div className="mt-4 text-3xl font-semibold text-white">{value}</div>
      <div className="text-xs uppercase tracking-wider text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function prettyStatus(s) { return (s || '').replace(/_/g, ' '); }
function prettyService(s) { return (s || '').replace(/_/g, ' '); }

function JobCard({ job, onAdvance, onSelectForAssign, isSelected }) {
  const navigate = useNavigate();
  const nextIdx = BOARD_STATUSES.indexOf(job.status);
  const next = nextIdx >= 0 && nextIdx < BOARD_STATUSES.length - 1 ? BOARD_STATUSES[nextIdx + 1] : null;
  const isPending = job.status === 'pending';
  return (
    <div
      data-testid={`job-card-${job.id}`}
      className={`hp-panel rounded-lg p-3 transition cursor-pointer ${isSelected ? 'border-amber-500 ring-2 ring-amber-500/50' : 'hover:border-amber-500/30'}`}
      onClick={() => isPending && onSelectForAssign ? onSelectForAssign(job) : navigate(`/wrecker/jobs/${job.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500 uppercase tracking-wider truncate">{prettyService(job.service_type)}</div>
          <div className="text-sm font-semibold text-white truncate mt-0.5">{job.customer?.name}</div>
        </div>
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold ${PRIORITY_COLORS[job.priority] || 'text-slate-300'}`}>
          {job.priority}
        </span>
      </div>
      {job.vehicle && (
        <div className="mt-2 text-xs text-slate-400 truncate">
          {[job.vehicle.year, job.vehicle.color, job.vehicle.make, job.vehicle.model].filter(Boolean).join(' ')}
          {job.vehicle.plate && <span className="ml-1 text-slate-500">· {job.vehicle.plate}</span>}
        </div>
      )}
      {job.pickup?.address && (
        <div className="mt-1 text-xs text-slate-500 truncate flex items-center gap-1">
          <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{job.pickup.address}</span>
        </div>
      )}
      {job.dropoff?.address && (
        <div className="mt-0.5 text-xs text-slate-500 truncate flex items-center gap-1">
          <Truck className="w-3 h-3 shrink-0 text-emerald-400/70" /> <span className="truncate">{job.dropoff.address}</span>
        </div>
      )}
      {(() => {
        const miles = haversineMiles(job.pickup, job.dropoff);
        if (miles == null) return null;
        return (
          <div className="mt-1 text-[10px] uppercase tracking-wider text-sky-300/80 flex items-center gap-1" data-testid={`tow-distance-${job.id}`}>
            <ArrowUpRight className="w-3 h-3" /> {miles.toFixed(1)} mi tow
          </div>
        );
      })()}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-emerald-300">${(job.final_price ?? job.quoted_price ?? 0).toFixed(0)}</div>
        {job.motor_club_name && <div className="text-[10px] uppercase tracking-wider text-amber-300/80 truncate">{job.motor_club_name}</div>}
      </div>
      {job.pickup?.address && (
        <a
          href={navUrl(job.pickup.address, job.pickup.lat, job.pickup.lng)}
          target="_blank"
          rel="noreferrer"
          data-testid={`navigate-${job.id}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 w-full h-7 flex items-center justify-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-[10px] uppercase tracking-wider font-semibold transition"
        >
          <Navigation className="w-3 h-3" /> Navigate to Pickup
        </a>
      )}
      {isPending && (
        <Button
          data-testid={`select-${job.id}`}
          size="sm"
          variant="outline"
          className={`w-full mt-2 h-7 text-[10px] uppercase tracking-wider ${isSelected ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-amber-500/30 text-amber-200 hover:bg-amber-500/10'}`}
          onClick={(e) => { e.stopPropagation(); onSelectForAssign?.(job); }}
        >
          <UserPlus className="w-3 h-3 mr-1" /> {isSelected ? 'Pick Driver →' : 'Select to Assign'}
        </Button>
      )}
      {!isPending && next && (
        <Button
          data-testid={`advance-${job.id}`}
          size="sm"
          variant="outline"
          className="w-full mt-2 h-7 text-[10px] uppercase tracking-wider border-amber-500/30 text-amber-200 hover:bg-amber-500/10"
          onClick={(e) => { e.stopPropagation(); onAdvance(job, next); }}
        >
          <Zap className="w-3 h-3 mr-1" /> Mark {prettyStatus(next)}
        </Button>
      )}
    </div>
  );
}

export default function WreckerDashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [ov, jb] = await Promise.all([
        api.get('/wrecker/overview'),
        api.get('/wrecker/jobs'),
      ]);
      setOverview(ov.data);
      setJobs(jb.data);
    } catch (e) {
      toast.error('Failed to load dispatch board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const advanceJob = async (job, nextStatus) => {
    try {
      await api.post(`/wrecker/jobs/${job.id}/status`, { status: nextStatus });
      toast.success(`${job.customer?.name} → ${prettyStatus(nextStatus)}`);
      load();
    } catch (e) {
      toast.error('Could not update status');
    }
  };

  const selectForAssign = (job) => {
    if (selectedJobId === job.id) {
      setSelectedJobId(null);
    } else {
      setSelectedJobId(job.id);
      toast.info(`Pick a driver in the rotation panel →`);
    }
  };

  const onAssigned = () => {
    setSelectedJobId(null);
    load();
  };

  if (loading) return <div className="p-8 text-slate-400">Loading dispatch board...</div>;

  const grouped = BOARD_STATUSES.reduce((acc, s) => {
    acc[s] = jobs.filter((j) => j.status === s);
    return acc;
  }, {});

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80">RoadBoss · Wrecker Mode</div>
          <h1 className="text-3xl font-bold text-white mt-1" data-testid="wrecker-page-title">Dispatch Board</h1>
          <p className="text-sm text-slate-400 mt-1">
            Select a pending job, then click a driver in rotation to assign. Drivers can't pick — only dispatch dispatches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NavAppPicker />
          <Button data-testid="refresh-board" variant="outline" size="sm" onClick={load} className="border-white/10 text-slate-300">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Link to="/wrecker/voice-job-wizard">
            <Button data-testid="hands-free-cta" size="sm" className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-semibold">
              <Mic className="w-4 h-4 mr-1" /> Hands-Free
            </Button>
          </Link>
          <Link to="/wrecker/jobs/new">
            <Button data-testid="new-job-cta" size="sm" className="bg-amber-500 text-black hover:bg-amber-400">
              <Plus className="w-4 h-4 mr-1" /> New Tow Job
            </Button>
          </Link>
        </div>
      </header>

      {overview && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            icon={Activity}
            label="Active jobs"
            value={overview.active_jobs?.length || 0}
            sub="in progress now — view board"
            accent="amber"
            onClick={() => {
              const el = document.querySelector('[data-testid="dispatch-board"]');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
          <Kpi
            icon={Truck}
            label="Today completed"
            value={overview.today_completed}
            sub="jobs delivered — open billing"
            accent="green"
            onClick={() => navigate('/wrecker/billing')}
          />
          <Kpi
            icon={DollarSign}
            label="Today revenue"
            value={`$${(overview.today_revenue || 0).toFixed(0)}`}
            sub="from completed jobs — open billing"
            accent="sky"
            onClick={() => navigate('/wrecker/billing')}
          />
          <Kpi
            icon={Lock}
            label="Active impounds"
            value={overview.active_impounds}
            sub="vehicles stored — open impound"
            accent="red"
            onClick={() => navigate('/wrecker/impound')}
          />
        </motion.div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
        {/* KANBAN */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3" data-testid="dispatch-board">
          {BOARD_STATUSES.map((s) => (
            <div key={s} className="hp-panel rounded-xl p-3 min-h-[40vh] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border ${STATUS_COLORS[s]}`}>{prettyStatus(s)}</div>
                <span className="text-xs text-slate-500">{grouped[s]?.length || 0}</span>
              </div>
              <div className="space-y-2 flex-1 overflow-y-auto">
                {(grouped[s] || []).map((j) => (
                  <JobCard
                    key={j.id}
                    job={j}
                    onAdvance={advanceJob}
                    onSelectForAssign={selectForAssign}
                    isSelected={selectedJobId === j.id}
                  />
                ))}
                {(!grouped[s] || grouped[s].length === 0) && (
                  <div className="text-center text-xs text-slate-600 py-6">— empty —</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* DRIVERS + ROTATION */}
        <div className="space-y-3">
          <DriversPanel
            onAssign={onAssigned}
            selectedJobId={selectedJobId}
            selectedJobPickup={(() => {
              const j = jobs.find((x) => x.id === selectedJobId);
              return j?.pickup ? { lat: j.pickup.lat, lng: j.pickup.lng } : null;
            })()}
          />
        </div>
      </div>
    </div>
  );
}

function NavAppPicker() {
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
      data-testid="board-nav-picker"
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

