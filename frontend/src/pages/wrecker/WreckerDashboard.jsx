import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Truck, Lock, Activity, DollarSign, Clock, MapPin, Phone, Plus, RefreshCw, ArrowUpRight, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

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

function Kpi({ icon: Icon, label, value, sub, accent = 'amber' }) {
  const accents = {
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    sky: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
    red: 'text-red-300 bg-red-500/10 border-red-500/30',
    green: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  };
  return (
    <div className="hp-panel rounded-xl p-4" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${accents[accent]}`}><Icon className="w-4 h-4" /></div>
        <ArrowUpRight className="w-4 h-4 text-slate-600" />
      </div>
      <div className="mt-4 text-3xl font-semibold text-white">{value}</div>
      <div className="text-xs uppercase tracking-wider text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function prettyStatus(s) { return (s || '').replace(/_/g, ' '); }
function prettyService(s) { return (s || '').replace(/_/g, ' '); }

function JobCard({ job, onAdvance }) {
  const navigate = useNavigate();
  const nextIdx = BOARD_STATUSES.indexOf(job.status);
  const next = nextIdx >= 0 && nextIdx < BOARD_STATUSES.length - 1 ? BOARD_STATUSES[nextIdx + 1] : null;
  return (
    <div
      data-testid={`job-card-${job.id}`}
      className="hp-panel rounded-lg p-3 hover:border-amber-500/30 transition cursor-pointer"
      onClick={() => navigate(`/wrecker/jobs/${job.id}`)}
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
          <MapPin className="w-3 h-3" /> {job.pickup.address}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-emerald-300">${(job.final_price ?? job.quoted_price ?? 0).toFixed(0)}</div>
        {job.motor_club_name && <div className="text-[10px] uppercase tracking-wider text-amber-300/80">{job.motor_club_name}</div>}
      </div>
      {next && (
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
  const [overview, setOverview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

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
          <p className="text-sm text-slate-400 mt-1">Voice-first towing operations. Say “Hey Co-Pilot, I’m on scene” while driving.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="refresh-board" variant="outline" size="sm" onClick={load} className="border-white/10 text-slate-300">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Link to="/wrecker/jobs/new">
            <Button data-testid="new-job-cta" size="sm" className="bg-amber-500 text-black hover:bg-amber-400">
              <Plus className="w-4 h-4 mr-1" /> New Tow Job
            </Button>
          </Link>
        </div>
      </header>

      {overview && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={Activity} label="Active jobs" value={overview.active_jobs?.length || 0} sub="in progress now" accent="amber" />
          <Kpi icon={Truck} label="Today completed" value={overview.today_completed} sub="jobs delivered" accent="green" />
          <Kpi icon={DollarSign} label="Today revenue" value={`$${(overview.today_revenue || 0).toFixed(0)}`} sub="from completed jobs" accent="sky" />
          <Kpi icon={Lock} label="Active impounds" value={overview.active_impounds} sub="vehicles stored" accent="red" />
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="dispatch-board">
        {BOARD_STATUSES.map((s) => (
          <div key={s} className="hp-panel rounded-xl p-3 min-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border ${STATUS_COLORS[s]}`}>{prettyStatus(s)}</div>
              <span className="text-xs text-slate-500">{grouped[s]?.length || 0}</span>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto">
              {(grouped[s] || []).map((j) => (
                <JobCard key={j.id} job={j} onAdvance={advanceJob} />
              ))}
              {(!grouped[s] || grouped[s].length === 0) && (
                <div className="text-center text-xs text-slate-600 py-6">— empty —</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
