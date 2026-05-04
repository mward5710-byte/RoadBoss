import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Camera,
  Play,
  RefreshCw,
  Zap,
  Filter,
  Gauge,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { timeAgo } from '@/lib/utils';

const SEVERITY_STYLES = {
  critical: {
    badge: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
    label: 'Critical',
    icon: ShieldAlert,
    ring: 'ring-rose-500/40',
  },
  warning: {
    badge: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
    label: 'Warning',
    icon: AlertTriangle,
    ring: 'ring-amber-500/30',
  },
  info: {
    badge: 'bg-sky-500/15 text-sky-200 border-sky-500/30',
    label: 'Info',
    icon: Camera,
    ring: 'ring-sky-500/20',
  },
};

const SEVERITY_ORDER = ['critical', 'warning', 'info'];

function Initials({ name }) {
  const letters = (name || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="h-7 w-7 shrink-0 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-[10px] font-semibold text-sky-200">
      {letters}
    </div>
  );
}

export default function DashcamPage() {
  const [events, setEvents] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [vendorFilter, setVendorFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: ev }, { data: v }] = await Promise.all([
        api.get('/dashcam-events?limit=200'),
        api.get('/dashcam/vendors'),
      ]);
      setEvents(ev || []);
      setVendors(v || []);
    } catch (e) {
      toast.error('Could not load dashcam events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (vendorFilter !== 'all' && e.vendor !== vendorFilter) return false;
      if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
      return true;
    });
  }, [events, vendorFilter, severityFilter]);

  const stats = useMemo(() => {
    const by = { critical: 0, warning: 0, info: 0 };
    for (const e of events) by[e.severity] = (by[e.severity] || 0) + 1;
    return { total: events.length, ...by };
  }, [events]);

  const simulate = async () => {
    setSimulating(true);
    try {
      const { data } = await api.post('/dashcam/simulate-live', {});
      toast.success(
        `${data.vendor} · ${data.event} — ${data.driver_name} @ ${data.speed_mph} mph`,
        { description: `${data.location_road}, ${data.location_city} · ${data.confidence_pct}% confidence` }
      );
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to simulate event');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="dashcam-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-400 font-semibold">
            FLEET COMMAND CENTER
          </div>
          <h1 className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
            Dashcam events
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live feed
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Unified feed from Samsara, Lytx, Verizon Connect, and the RoadBoss native in-cab camera.
            Mock adapters are marked <em>mock</em> — swap them with real vendor keys to go live.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={simulate}
            disabled={simulating}
            data-testid="dashcam-simulate-btn"
            className="bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            <Zap className="h-4 w-4 mr-1.5" />
            {simulating ? 'Injecting…' : 'Simulate live event'}
          </Button>
          <Button
            onClick={load}
            variant="outline"
            disabled={loading}
            data-testid="dashcam-refresh-btn"
            className="border-white/10 bg-transparent text-slate-200 hover:bg-white/5"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-400 uppercase tracking-wide">Total events</div>
            <div className="text-2xl font-bold text-white mt-1" data-testid="stat-total">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-rose-300" /> Critical
            </div>
            <div className="text-2xl font-bold text-rose-300 mt-1" data-testid="stat-critical">{stats.critical}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-300" /> Warning
            </div>
            <div className="text-2xl font-bold text-amber-200 mt-1" data-testid="stat-warning">{stats.warning}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
              <Camera className="h-3 w-3 text-sky-300" /> Info
            </div>
            <div className="text-2xl font-bold text-sky-200 mt-1" data-testid="stat-info">{stats.info}</div>
          </CardContent>
        </Card>
      </div>

      {/* Vendor chips */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-400">
          <Filter className="h-3.5 w-3.5" /> Vendor
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setVendorFilter('all')}
            data-testid="vendor-filter-all"
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              vendorFilter === 'all'
                ? 'bg-white text-slate-950 border-white'
                : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/5'
            }`}
          >
            All vendors · {events.length}
          </button>
          {vendors.map((v) => {
            const active = vendorFilter === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setVendorFilter(v.key)}
                data-testid={`vendor-filter-${v.key.toLowerCase().replace(/\s+/g, '-')}`}
                style={active ? { borderColor: v.accent, color: v.accent } : {}}
                className={`rounded-full border px-3 py-1.5 text-xs transition flex items-center gap-2 ${
                  active
                    ? 'bg-white/[0.04]'
                    : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/5'
                }`}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: v.accent }}
                />
                {v.label}
                <span className="text-[10px] text-slate-500">· {v.event_count}</span>
                {v.status === 'mock' ? (
                  <span className="text-[9px] uppercase tracking-widest text-slate-500 border border-white/10 rounded px-1 py-[1px]">
                    mock
                  </span>
                ) : (
                  <span className="text-[9px] uppercase tracking-widest text-emerald-300 border border-emerald-500/30 rounded px-1 py-[1px]">
                    live
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-400 pt-1">
          <Filter className="h-3.5 w-3.5" /> Severity
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSeverityFilter('all')}
            data-testid="severity-filter-all"
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              severityFilter === 'all'
                ? 'bg-white text-slate-950 border-white'
                : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/5'
            }`}
          >
            All
          </button>
          {SEVERITY_ORDER.map((sev) => {
            const style = SEVERITY_STYLES[sev];
            const active = severityFilter === sev;
            return (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                data-testid={`severity-filter-${sev}`}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  active
                    ? style.badge
                    : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/5'
                }`}
              >
                {style.label} · {stats[sev] || 0}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {filtered.map((e) => {
          const style = SEVERITY_STYLES[e.severity] || SEVERITY_STYLES.info;
          const Icon = style.icon;
          const vendor = vendors.find((v) => v.key === e.vendor);
          const accent = vendor?.accent || '#64748b';
          return (
            <div
              key={e.id}
              data-testid={`dashcam-card-${e.id}`}
              className={`group overflow-hidden rounded-2xl border border-white/10 bg-[#0b1017] hover:border-white/20 transition ring-0 ${
                e.severity === 'critical' ? `ring-1 ${style.ring}` : ''
              }`}
            >
              {/* Thumb */}
              <div className="relative aspect-video bg-gradient-to-br from-[#0a0e14] to-[#1a2332]">
                {e.thumbnail ? (
                  <img
                    src={e.thumbnail}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover opacity-70 group-hover:opacity-90 transition"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-700">
                    <Camera className="h-10 w-10" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                {/* Vendor badge */}
                <div
                  className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider"
                  style={{
                    borderColor: `${accent}55`,
                    backgroundColor: `${accent}22`,
                    color: accent,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  {e.vendor}
                </div>
                {/* Severity badge */}
                <Badge className={`absolute top-2 right-2 ${style.badge}`}>
                  <Icon className="h-3 w-3 mr-1" />
                  {style.label}
                </Badge>
                {/* Speed + duration */}
                {e.speed_mph != null ? (
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 border border-white/10 px-2 py-0.5 text-[10px] text-slate-200 backdrop-blur">
                    <Gauge className="h-3 w-3 text-sky-300" /> {e.speed_mph} mph
                  </div>
                ) : null}
                {e.clip_duration_sec ? (
                  <div className="absolute bottom-2 right-2 rounded bg-black/60 border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-200 backdrop-blur">
                    {e.clip_duration_sec}s
                  </div>
                ) : null}
                {/* Play button */}
                <button
                  type="button"
                  aria-label={`Play ${e.event} clip`}
                  className="absolute inset-0 m-auto h-12 w-12 rounded-full bg-sky-500/90 hover:bg-sky-400 flex items-center justify-center text-slate-950 shadow-lg shadow-sky-500/30 transition opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0"
                  onClick={() => toast('Mock clip — integrate vendor video URL to play.', { description: `${e.vendor} · ${e.event}` })}
                >
                  <Play className="h-5 w-5 ml-0.5" />
                </button>
              </div>
              {/* Body */}
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Initials name={e.driver_name} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">
                      {e.driver_name || 'Unknown driver'}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {e.vehicle_name || '—'}
                    </div>
                  </div>
                  <div className="flex items-center text-[10px] text-slate-500 gap-1">
                    <Clock className="h-3 w-3" /> {timeAgo(e.created_at)}
                  </div>
                </div>
                <div className="text-sm text-white">{e.event}</div>
                <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                  {e.location_road ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-slate-500" />
                      {e.location_road}
                      {e.location_city ? ` · ${e.location_city}` : ''}
                    </span>
                  ) : null}
                  {e.confidence_pct != null ? (
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <CheckCircle2 className="h-3 w-3" /> {e.confidence_pct}% confidence
                    </span>
                  ) : null}
                </div>
                {(e.coach_tag || e.reviewed) && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {e.coach_tag ? (
                      <Badge className="bg-white/[0.04] border-white/10 text-slate-300 text-[10px]">
                        {e.coach_tag}
                      </Badge>
                    ) : null}
                    {e.reviewed ? (
                      <Badge className="bg-emerald-500/10 border-emerald-500/30 text-emerald-200 text-[10px]">
                        Reviewed
                      </Badge>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div
            data-testid="dashcam-empty"
            className="col-span-full rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center"
          >
            <Camera className="h-8 w-8 text-zinc-500 mx-auto mb-3" />
            <div className="text-sm text-white">No dashcam events match these filters.</div>
            <p className="text-xs text-zinc-500 mt-1">
              Try widening the filters or click <strong>Simulate live event</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
