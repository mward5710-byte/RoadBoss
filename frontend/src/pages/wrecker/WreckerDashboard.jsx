import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { Truck, Lock, Activity, DollarSign, Clock, MapPin, Phone, Plus, RefreshCw, ArrowUpRight, Zap, UserPlus, Navigation, Mic, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import DriversPanel from './DriversPanel';
import QuickAddDriverForm from './QuickAddDriverForm';
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

function JobCard({ job, onAdvance, onPickDriver, isSelected }) {
  const navigate = useNavigate();
  const nextIdx = BOARD_STATUSES.indexOf(job.status);
  const next = nextIdx >= 0 && nextIdx < BOARD_STATUSES.length - 1 ? BOARD_STATUSES[nextIdx + 1] : null;
  const isPending = job.status === 'pending';
  // Prefer real road miles from backend (Mapbox Directions); fall back to
  // haversine ("as-the-crow-flies") only if the enrichment hasn't run yet.
  const loadedMi = (typeof job.loaded_miles === 'number' && job.loaded_miles > 0)
    ? job.loaded_miles
    : haversineMiles(job.pickup, job.dropoff);
  const deadheadMi = (typeof job.deadhead_miles === 'number' && job.deadhead_miles > 0)
    ? job.deadhead_miles
    : null;
  return (
    <div
      data-testid={`job-card-${job.id}`}
      className={`hp-panel rounded-lg p-3 transition cursor-pointer ${isSelected ? 'border-amber-500 ring-2 ring-amber-500/50' : 'hover:border-amber-500/30'}`}
      onClick={() => navigate(`/wrecker/jobs/${job.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500 uppercase tracking-wider truncate">{prettyService(job.service_type)}</div>
          <div className="text-sm font-semibold text-white truncate mt-0.5">{job.customer?.name}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold ${PRIORITY_COLORS[job.priority] || 'text-slate-300'}`}>
            {job.priority}
          </span>
          {/* Primary dispatch action — top-right of the card so it's always
              the first thing dispatch sees, never buried below the fold. */}
          {isPending && (
            <Button
              data-testid={`pick-driver-${job.id}`}
              size="sm"
              className="h-7 px-2.5 text-[10px] uppercase tracking-wider font-bold bg-amber-500 text-slate-950 hover:bg-amber-400"
              onClick={(e) => { e.stopPropagation(); onPickDriver?.(job); }}
            >
              <UserPlus className="w-3 h-3 mr-1" /> Dispatch
            </Button>
          )}
        </div>
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
      {/* Mileage strip — two real numbers dispatchers quote against. */}
      {(deadheadMi != null || loadedMi != null) && (
        <div className="mt-2 grid grid-cols-2 gap-2" data-testid={`tow-distances-${job.id}`}>
          <div className="rounded border border-sky-500/20 bg-sky-500/5 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-sky-300/80 font-semibold">To Pickup</div>
            <div className="text-sm font-bold text-sky-200" data-testid={`mi-deadhead-${job.id}`}>
              {deadheadMi != null ? `${deadheadMi.toFixed(1)} mi` : <span className="text-slate-500 font-normal text-xs">—</span>}
            </div>
          </div>
          <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-emerald-300/80 font-semibold">Loaded</div>
            <div className="text-sm font-bold text-emerald-200" data-testid={`mi-loaded-${job.id}`}>
              {loadedMi != null ? `${loadedMi.toFixed(1)} mi` : <span className="text-slate-500 font-normal text-xs">—</span>}
            </div>
          </div>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-emerald-300">${(job.final_price ?? job.quoted_price ?? 0).toFixed(0)}</div>
        {job.motor_club_name && <div className="text-[10px] uppercase tracking-wider text-amber-300/80 truncate">{job.motor_club_name}</div>}
      </div>
      {/* Pick Driver moved to top-right of card — see header. Bottom of
          card now reserved for status-advance only. */}
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
  // Pick-Driver sheet — opens directly when dispatcher taps "Pick Driver"
  // on any pending job. No more "select first, then click panel" guesswork.
  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  // When dispatcher taps "+ Quick Add" inside the Pick Driver dialog, we
  // expand a small inline form right above the rotation list. Submit →
  // bump driversRefreshKey so DriversPanel refetches and the new driver
  // shows up instantly, ready to assign.
  const [inlineQuickAddOpen, setInlineQuickAddOpen] = useState(false);
  const [driversRefreshKey, setDriversRefreshKey] = useState(0);
  // Quick Add Driver dialog (top-right "Add Driver" button)
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [qaForm, setQaForm] = useState({ name: '', truck_number: '', phone: '', email: '' });
  const [qaSaving, setQaSaving] = useState(false);

  // Towbook-style top tabs. Each maps to a job filter predicate so the
  // existing kanban below auto-filters when a tab is selected.
  const [activeTab, setActiveTab] = useState('active');
  const tabPredicates = useMemo(() => ({
    active: (j) => !['completed', 'paid', 'cancelled', 'quote', 'scheduled'].includes(j.status),
    completed: (j) => j.status === 'completed' || j.status === 'paid',
    scheduled: (j) => j.status === 'scheduled' || (j.eta && new Date(j.eta) > new Date() && j.status === 'pending'),
    cancelled: (j) => j.status === 'cancelled',
    quotes: (j) => j.status === 'quote',
  }), []);
  // Counts (always reflect the full jobs list, not the filtered slice)
  const tabCounts = useMemo(() => {
    const out = {};
    Object.entries(tabPredicates).forEach(([k, fn]) => {
      out[k] = jobs.filter(fn).length;
    });
    return out;
  }, [jobs, tabPredicates]);
  const filteredJobs = useMemo(() => jobs.filter(tabPredicates[activeTab] || (() => true)), [jobs, activeTab, tabPredicates]);

  const submitQuickAddDriver = async (e) => {
    e?.preventDefault?.();
    const name = (qaForm.name || '').trim();
    if (name.length < 2) {
      toast.error('Driver name is required.');
      return;
    }
    setQaSaving(true);
    try {
      const r = await api.post('/wrecker/drivers/quick-add', {
        name,
        truck_number: qaForm.truck_number || null,
        phone: qaForm.phone || null,
        email: qaForm.email || null,
      });
      const drv = r.data?.driver;
      toast.success(`${drv?.name || 'Driver'} added to rotation${drv?.truck_number ? ' (Truck #' + drv.truck_number + ')' : ''}`);
      setQuickAddOpen(false);
      setQaForm({ name: '', truck_number: '', phone: '', email: '' });
      // Bump DriversPanel refresh so the new driver appears immediately
      // in the side-rail rotation without a full page reload.
      setDriversRefreshKey((k) => k + 1);
      load(); // refresh dispatch board so new driver appears immediately
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not add driver.');
    } finally {
      setQaSaving(false);
    }
  };

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

  const pickDriver = (job) => {
    setSelectedJobId(job.id);
    setAssignSheetOpen(true);
  };

  const onAssigned = () => {
    setSelectedJobId(null);
    setAssignSheetOpen(false);
    load();
  };

  if (loading) return <div className="p-8 text-slate-400">Loading dispatch board...</div>;

  const grouped = BOARD_STATUSES.reduce((acc, s) => {
    acc[s] = filteredJobs.filter((j) => j.status === s);
    return acc;
  }, {});

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80">RoadBoss · Wrecker Mode</div>
          <h1 className="text-3xl font-bold text-white mt-1" data-testid="wrecker-page-title">Dispatch Board</h1>
          <p className="text-sm text-slate-400 mt-1">
            Tap <span className="text-amber-300 font-semibold">Pick Driver</span> on any pending job to assign it from the rotation. Drivers can't pick — only dispatch dispatches.
          </p>
        </div>
        {/* Action bar — 2x2 grid on mobile so nothing is cut off, single row on desktop. */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
          <div className="col-span-2 sm:col-auto sm:hidden">
            <NavAppPicker />
          </div>
          <div className="hidden sm:block">
            <NavAppPicker />
          </div>
          <Button data-testid="refresh-board" variant="outline" size="sm" onClick={load} className="border-white/10 text-slate-300 w-full sm:w-auto">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button
            type="button"
            data-testid="quick-add-driver-cta"
            size="sm"
            variant="outline"
            onClick={() => setQuickAddOpen(true)}
            className="border-sky-500/40 text-sky-300 hover:bg-sky-500/10 hover:text-sky-200 w-full sm:w-auto"
          >
            <UserPlus className="w-4 h-4 mr-1" /> Add Driver
          </Button>
          <Link to="/wrecker/jobs/new" className="w-full sm:w-auto">
            <Button data-testid="new-job-cta" size="sm" className="bg-amber-500 text-black hover:bg-amber-400 w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-1" /> New Tow Job
            </Button>
          </Link>
        </div>
      </header>

      {/* Towbook-style horizontally scrollable tab bar — Active / Completed
          / Scheduled / Cancelled / Quotes. Each tab shows a live count badge
          and instantly filters the kanban below. Search icon stays right. */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0" data-testid="dispatch-tab-bar">
        <div className="flex items-center gap-1 overflow-x-auto pb-1.5 -mb-1.5 [&::-webkit-scrollbar]:hidden">
          {[
            { key: 'active',    label: 'Active' },
            { key: 'completed', label: 'Completed' },
            { key: 'scheduled', label: 'Scheduled' },
            { key: 'cancelled', label: 'Cancelled' },
            { key: 'quotes',    label: 'Quotes' },
          ].map((tab) => {
            const sel = activeTab === tab.key;
            const count = tabCounts[tab.key] || 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                data-testid={`dispatch-tab-${tab.key}`}
                className={`shrink-0 px-3.5 h-9 rounded-full inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition ${
                  sel
                    ? 'bg-sky-500 text-white shadow shadow-sky-500/30'
                    : 'bg-slate-900 border border-white/10 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${sel ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-300'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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
        {/* KANBAN — shown only for Active tab. Other tabs show a flat list. */}
        {activeTab === 'active' && (
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
                      onPickDriver={pickDriver}
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
        )}

        {/* Flat-list view for non-active tabs */}
        {activeTab !== 'active' && (
          <div className="space-y-3" data-testid={`dispatch-flatlist-${activeTab}`}>
            {filteredJobs.length === 0 ? (
              <div className="hp-panel rounded-xl p-12 text-center">
                <div className="text-base text-slate-300 font-semibold mb-1">No {activeTab} jobs</div>
                <div className="text-sm text-slate-500">
                  {activeTab === 'completed' && 'Finished jobs will land here.'}
                  {activeTab === 'scheduled' && 'Calls with a future ETA will appear here.'}
                  {activeTab === 'cancelled' && 'Voided jobs are kept here for audit.'}
                  {activeTab === 'quotes' && 'Quoted but not-yet-dispatched calls will live here.'}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredJobs.map((j) => (
                  <JobCard
                    key={j.id}
                    job={j}
                    onAdvance={advanceJob}
                    onPickDriver={pickDriver}
                    isSelected={selectedJobId === j.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* DRIVERS + ROTATION (desktop side-rail; on mobile the same panel
            also lives inside the Pick Driver dialog so it's always reachable) */}
        <div className="hidden xl:block space-y-3">
          <DriversPanel
            onAssign={onAssigned}
            selectedJobId={selectedJobId}
            selectedJobPickup={(() => {
              const j = jobs.find((x) => x.id === selectedJobId);
              return j?.pickup ? { lat: j.pickup.lat, lng: j.pickup.lng } : null;
            })()}
            refreshKey={driversRefreshKey}
          />
        </div>
      </div>

      {/* Pick Driver dialog — opens when dispatcher taps "Pick Driver" on a card.
          Tapping a driver inside fires onAssign which closes the sheet. */}
      <Dialog open={assignSheetOpen} onOpenChange={(v) => { if (!v) { setAssignSheetOpen(false); setSelectedJobId(null); setInlineQuickAddOpen(false); } }}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-lg max-h-[85vh] overflow-y-auto" data-testid="pick-driver-dialog">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-amber-400" /> Pick a Driver
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              {(() => {
                const j = jobs.find((x) => x.id === selectedJobId);
                if (!j) return 'Tap a driver in rotation to assign this job.';
                return (
                  <>
                    Assigning <span className="text-amber-300 font-semibold">{j.customer?.name || 'this job'}</span>
                    {j.pickup?.address && <> · pickup at <span className="text-slate-300">{j.pickup.address}</span></>}
                  </>
                );
              })()}
            </DialogDescription>
          </DialogHeader>

          {/* Inline Quick Add — Mike's "stay on the board" rule. Driver
              missing from the rotation? Tap "+ Quick Add", fill name,
              submit, and they appear in the list below — ready to assign. */}
          <div className="mt-3 space-y-2">
            {!inlineQuickAddOpen ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-sky-500/30 bg-sky-500/[0.03] px-3 py-2">
                <div className="text-xs text-slate-400">
                  Driver not in the list?
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setInlineQuickAddOpen(true)}
                  data-testid="open-inline-quick-add"
                  className="border-sky-500/40 text-sky-300 hover:bg-sky-500/10 hover:text-sky-200 h-8"
                >
                  <UserPlus className="w-4 h-4 mr-1" /> Quick Add
                </Button>
              </div>
            ) : (
              <QuickAddDriverForm
                onAdded={() => {
                  setInlineQuickAddOpen(false);
                  setDriversRefreshKey((k) => k + 1);
                }}
                onCancel={() => setInlineQuickAddOpen(false)}
                submitLabel="Add & Show in List"
              />
            )}
          </div>

          <div className="mt-2">
            <DriversPanel
              onAssign={onAssigned}
              selectedJobId={selectedJobId}
              selectedJobPickup={(() => {
                const j = jobs.find((x) => x.id === selectedJobId);
                return j?.pickup ? { lat: j.pickup.lat, lng: j.pickup.lng } : null;
              })()}
              refreshKey={driversRefreshKey}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Add Driver dialog — Mike's "zip around" play. Add a driver
          straight from the dispatch board, no Settings detour. */}
      <Dialog open={quickAddOpen} onOpenChange={(v) => { if (!v) { setQuickAddOpen(false); } }}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-md" data-testid="quick-add-driver-dialog">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-sky-400" /> Quick Add Driver
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Adds the driver to your rotation immediately. Only the name is required — fill the rest later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitQuickAddDriver} className="space-y-3 mt-2">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Driver Name *</label>
              <input
                value={qaForm.name}
                onChange={(e) => setQaForm({ ...qaForm, name: e.target.value })}
                autoFocus
                placeholder="e.g. John Smith"
                className="w-full bg-[#07090d] border border-white/10 text-white text-sm rounded-md h-10 px-3 focus:outline-none focus:border-sky-500/50"
                data-testid="qa-driver-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Truck #</label>
                <input
                  value={qaForm.truck_number}
                  onChange={(e) => setQaForm({ ...qaForm, truck_number: e.target.value })}
                  placeholder="e.g. 7"
                  className="w-full bg-[#07090d] border border-white/10 text-white text-sm rounded-md h-10 px-3 focus:outline-none focus:border-sky-500/50"
                  data-testid="qa-driver-truck"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Phone</label>
                <input
                  value={qaForm.phone}
                  onChange={(e) => setQaForm({ ...qaForm, phone: e.target.value })}
                  placeholder="555-123-4567"
                  className="w-full bg-[#07090d] border border-white/10 text-white text-sm rounded-md h-10 px-3 focus:outline-none focus:border-sky-500/50"
                  data-testid="qa-driver-phone"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Email <span className="text-slate-600 normal-case font-normal">(optional)</span></label>
              <input
                value={qaForm.email}
                onChange={(e) => setQaForm({ ...qaForm, email: e.target.value })}
                placeholder="Auto-generated if blank"
                className="w-full bg-[#07090d] border border-white/10 text-white text-sm rounded-md h-10 px-3 focus:outline-none focus:border-sky-500/50"
                data-testid="qa-driver-email"
              />
              <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                Used for driver login. Leave blank for cash-only / non-app drivers — we'll generate a placeholder.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuickAddOpen(false)}
                className="border-white/10 text-slate-300"
                data-testid="qa-driver-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={qaSaving || !qaForm.name.trim()}
                className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-semibold"
                data-testid="qa-driver-submit"
              >
                <UserPlus className="w-4 h-4 mr-1" /> {qaSaving ? 'Adding…' : 'Add to Rotation'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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

