import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Users, Crown, Zap, CheckCircle2, MapPin, Wifi, WifiOff, Sun, Moon, Wand2, Edit3, Check, X } from 'lucide-react';
import { toast } from 'sonner';

// Haversine distance, miles
function milesBetween(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat); const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function formatAge(ts) {
  if (!ts) return null;
  const sec = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}

// Decide if right now is "business hours" given a config
function isBusinessHoursNow(cfg) {
  if (!cfg || !cfg.enabled) return true;
  const now = new Date();
  const dow = now.getDay();
  if (cfg.weekend_after_hours && (dow === 0 || dow === 6)) return false;
  const startMin = (cfg.start_hour ?? 8) * 60 + (cfg.start_minute ?? 30);
  const endMin = (cfg.end_hour ?? 17) * 60 + (cfg.end_minute ?? 0);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= startMin && nowMin < endMin;
}

const MODE_AUTO = 'auto';
const MODE_DAY = 'day';
const MODE_NIGHT = 'night';
const MODE_LABELS = {
  [MODE_AUTO]:  'Auto',
  [MODE_DAY]:   'Daytime · Closest',
  [MODE_NIGHT]: 'Night · Rotation',
};
const MODE_ICONS = { [MODE_AUTO]: Wand2, [MODE_DAY]: Sun, [MODE_NIGHT]: Moon };

/**
 * Drivers + Rotation panel for dispatchers/supervisors.
 *  - Daytime (8:30am-5pm): GPS distance to pickup wins
 *  - After-hours: rotation rank (1st-call, 2nd-call...) — busy drivers bumped to bottom,
 *    so the highest-rank AVAILABLE driver always gets the next call. Once they free up, they're back on top.
 */
export default function DriversPanel({ onAssign, selectedJobId, selectedJobPickup, refreshKey = 0 }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [businessHours, setBusinessHours] = useState(null);
  const [modeOverride, setModeOverride] = useState(MODE_AUTO);
  const [editingRankFor, setEditingRankFor] = useState(null); // driver id whose rank is being edited
  const [rankInput, setRankInput] = useState('');
  // Tick every minute to recalc business hours
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const [r, bh] = await Promise.all([
        api.get('/wrecker/drivers'),
        api.get('/wrecker/business-hours').catch(() => ({ data: null })),
      ]);
      setDrivers(r.data);
      setBusinessHours(bh.data);
    } catch (e) {
      // Silent fail (driver role can't see this anyway)
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch whenever the parent bumps refreshKey (e.g. after Quick Add Driver
  // fires inside the Pick Driver dialog so the new driver appears instantly).
  useEffect(() => { load(); }, [load, refreshKey]);

  const toggleDuty = async (d, on_duty) => {
    try {
      await api.post(`/wrecker/drivers/${d.id}/duty`, { on_duty });
      toast.success(`${d.name} marked ${on_duty ? 'ON DUTY' : 'OFF DUTY'}`);
      load();
    } catch (e) { toast.error('Could not update duty status'); }
  };

  const handleAssign = async (d) => {
    if (!selectedJobId) {
      toast.info('Pick a pending job first, then click a driver to assign.');
      return;
    }
    try {
      await api.post(`/wrecker/jobs/${selectedJobId}/assign`, { driver_id: d.id });
      toast.success(`Assigned to ${d.name}`);
      load();
      onAssign?.(d);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Assign failed');
    }
  };

  const saveRank = async (driverId) => {
    const n = parseInt(rankInput, 10);
    if (!n || n < 1 || n > 99) { toast.error('Rank must be 1-99'); return; }
    try {
      await api.post(`/wrecker/drivers/${driverId}/rank`, { rank: n });
      toast.success(`Rank set to ${n}`);
      setEditingRankFor(null);
      setRankInput('');
      load();
    } catch (e) { toast.error('Could not set rank'); }
  };

  const cycleMode = () => {
    const order = [MODE_AUTO, MODE_DAY, MODE_NIGHT];
    const i = order.indexOf(modeOverride);
    const next = order[(i + 1) % order.length];
    setModeOverride(next);
    toast.success(`Sort mode: ${MODE_LABELS[next]}`);
  };

  if (loading) return null;

  // Resolve effective mode: AUTO checks the clock; DAY/NIGHT force it
  const isDayByClock = isBusinessHoursNow(businessHours);
  const effectiveDay = modeOverride === MODE_AUTO ? isDayByClock : modeOverride === MODE_DAY;
  const ModeIcon = MODE_ICONS[modeOverride];

  // Map drivers with computed distance + flags
  const driversAnnotated = drivers.map((d) => {
    const driverPos = (d.last_known_lat != null && d.last_known_lng != null)
      ? { lat: d.last_known_lat, lng: d.last_known_lng } : null;
    const miles = (selectedJobPickup && driverPos) ? milesBetween(driverPos, selectedJobPickup) : null;
    const isBusy = (d.active_jobs || 0) > 0;
    return { ...d, _miles: miles, _hasGps: !!driverPos, _busy: isBusy };
  });

  // Sort logic depends on effective mode
  const sorted = [...driversAnnotated].sort((a, b) => {
    // Off-duty drivers always at bottom
    if (a.on_duty !== b.on_duty) return a.on_duty ? -1 : 1;
    if (effectiveDay) {
      // DAYTIME: GPS distance to pickup wins (busy drivers still shown but ranked lower)
      if (selectedJobPickup) {
        if (a._busy !== b._busy) return a._busy ? 1 : -1;
        if (a._miles != null && b._miles != null) return a._miles - b._miles;
        if (a._miles != null) return -1;
        if (b._miles != null) return 1;
      }
      return (a.rotation_rank ?? 99) - (b.rotation_rank ?? 99);
    } else {
      // AFTER-HOURS: rank rotation. Busy drivers go to bottom, then by rank ascending
      if (a._busy !== b._busy) return a._busy ? 1 : -1;
      const ar = a.rotation_rank ?? 99;
      const br = b.rotation_rank ?? 99;
      if (ar !== br) return ar - br;
      // Tie-break by miles if available
      if (a._miles != null && b._miles != null) return a._miles - b._miles;
      return 0;
    }
  });

  // Top driver gets a special badge
  const topDriverId = effectiveDay
    ? sorted.find((d) => d.on_duty && !d._busy && d._miles != null)?.id
    : sorted.find((d) => d.on_duty && !d._busy)?.id;

  return (
    <Card className="bg-[#0a0e14] border-white/5 p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs uppercase tracking-wider text-slate-300 font-semibold truncate">Drivers · Rotation</span>
        </div>
        <button
          type="button"
          onClick={cycleMode}
          data-testid="rotation-mode-toggle"
          title={`Currently: ${MODE_LABELS[modeOverride]}${modeOverride === MODE_AUTO ? ` (clock says ${effectiveDay ? 'Daytime' : 'After-Hours'})` : ''}. Tap to cycle.`}
          className={`shrink-0 flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border font-semibold transition ${
            effectiveDay
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
              : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25'
          }`}
        >
          <ModeIcon className="w-3 h-3" />
          {effectiveDay ? 'Daytime · Closest' : 'Night · Rotation'}
          {modeOverride !== MODE_AUTO && <span className="ml-0.5 opacity-70">(forced)</span>}
        </button>
      </div>
      {selectedJobId && (
        <div className="mb-2 text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-200" data-testid="dispatch-hint">
          {selectedJobPickup
            ? (effectiveDay ? '🟢 Click closest available driver to assign' : '🌙 Click highest-rank available driver to assign')
            : 'Click to assign'}
        </div>
      )}
      <div className="space-y-1.5">
        {sorted.map((d) => {
          const isTop = d.id === topDriverId;
          const milesText = d._miles != null
            ? (d._miles < 1 ? `${(d._miles * 5280).toFixed(0)} ft` : `${d._miles.toFixed(1)} mi`)
            : null;
          const milesColor = d._miles == null ? 'text-slate-500'
            : d._miles < 2 ? 'text-emerald-300'
            : d._miles < 8 ? 'text-amber-300'
            : 'text-slate-400';
          const ageText = formatAge(d.last_location_at);
          const stale = d.last_location_at ? (Date.now() - new Date(d.last_location_at).getTime() > 5 * 60 * 1000) : true;
          // Top-driver badge varies by mode
          const topBadgeLabel = effectiveDay ? 'Closest' : 'On Call';
          const topBadgeColor = effectiveDay ? 'bg-emerald-500/20 text-emerald-300' : 'bg-indigo-500/20 text-indigo-300';
          const topRingColor  = effectiveDay ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30' : 'bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/30';
          const topIcon = effectiveDay ? MapPin : Crown;
          const TopIconC = topIcon;
          return (
            <div
              key={d.id}
              data-testid={`driver-row-${d.id}`}
              className={`group rounded-lg p-2.5 border transition ${isTop ? topRingColor : d._busy ? 'bg-white/[0.01] border-white/5 opacity-70' : 'bg-white/[0.02] border-white/5'} ${selectedJobId ? 'cursor-pointer hover:bg-amber-500/15 hover:border-amber-500/40' : ''}`}
              onClick={() => selectedJobId && handleAssign(d)}
            >
              <div className="flex items-center gap-2">
                {isTop ? <TopIconC className={`w-3.5 h-3.5 shrink-0 ${effectiveDay ? 'text-emerald-300' : 'text-indigo-300'}`} /> : (
                  <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-slate-300" title={`Rank ${d.rotation_rank ?? '—'}`}>
                    #{d.rotation_rank ?? '—'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white truncate flex items-center gap-2 flex-wrap">
                    {d.name}
                    {d.truck_number && <span className="text-[10px] text-slate-400 font-normal">· Truck {d.truck_number}</span>}
                    {isTop && <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded font-bold ${topBadgeColor}`}>{topBadgeLabel}</span>}
                    {d._busy && <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">Busy</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                    <span>{d.active_jobs} active</span>
                    <span>·</span>
                    {milesText ? (
                      <span className={`font-semibold ${milesColor}`} data-testid={`driver-distance-${d.id}`}>📍 {milesText} from pickup</span>
                    ) : d._hasGps ? (
                      <span className="text-slate-500">GPS on</span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-600"><WifiOff className="w-3 h-3" /> no GPS yet</span>
                    )}
                    {ageText && d._hasGps && (
                      <>
                        <span>·</span>
                        <span className={stale ? 'text-amber-400' : 'text-emerald-400'}>{ageText}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {editingRankFor === d.id ? (
                    <>
                      <input
                        autoFocus
                        type="number"
                        min={1}
                        max={99}
                        value={rankInput}
                        onChange={(e) => setRankInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveRank(d.id); if (e.key === 'Escape') setEditingRankFor(null); }}
                        className="w-12 h-7 text-xs bg-[#07090d] border border-white/20 text-white rounded px-1 text-center"
                        data-testid={`rank-input-${d.id}`}
                      />
                      <button onClick={() => saveRank(d.id)} className="text-emerald-400 hover:text-emerald-300 p-1" data-testid={`rank-save-${d.id}`}>
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingRankFor(null)} className="text-slate-500 hover:text-slate-300 p-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingRankFor(d.id); setRankInput(String(d.rotation_rank || '')); }}
                        title="Set rotation rank"
                        data-testid={`rank-edit-${d.id}`}
                        className="text-slate-500 hover:text-amber-300 p-1 opacity-0 group-hover:opacity-100 transition"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <Switch
                        data-testid={`duty-toggle-${d.id}`}
                        checked={d.on_duty}
                        onCheckedChange={(v) => toggleDuty(d, v)}
                        className="scale-75"
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {drivers.length === 0 && (
          <div className="text-center text-xs text-slate-500 py-4">No drivers configured yet.</div>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-slate-500 leading-relaxed">
        {effectiveDay
          ? 'Daytime: closest available driver wins. Hover a row to set rotation rank.'
          : 'After-hours: rank #1 gets every call. Busy drivers drop to bottom; lowest-rank free driver = next call.'}
        {' '}
        <button onClick={cycleMode} className="underline text-slate-400 hover:text-white">Change mode</button>
      </div>
    </Card>
  );
}
