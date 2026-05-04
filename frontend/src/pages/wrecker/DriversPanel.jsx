import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Users, Crown, Zap, CheckCircle2, MapPin, Wifi, WifiOff } from 'lucide-react';
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

/**
 * Drivers + Rotation panel for dispatchers/supervisors.
 * Shows the rotation queue + LIVE GPS distance to the selected job's pickup
 * so dispatcher can pick the closest driver, not just the oldest in rotation.
 */
export default function DriversPanel({ onAssign, selectedJobId, selectedJobPickup }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/wrecker/drivers');
      setDrivers(r.data);
    } catch (e) {
      // Silent fail (driver role can't see this anyway)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  if (loading) return null;

  // When a job is selected, compute distance to pickup for each driver and re-sort by closest
  const driversWithDistance = drivers.map((d) => {
    const driverPos = (d.last_known_lat != null && d.last_known_lng != null)
      ? { lat: d.last_known_lat, lng: d.last_known_lng } : null;
    const miles = (selectedJobPickup && driverPos) ? milesBetween(driverPos, selectedJobPickup) : null;
    return { ...d, _miles: miles, _hasGps: !!driverPos };
  });
  const sorted = selectedJobPickup
    ? [...driversWithDistance].sort((a, b) => {
        // On-duty + has GPS first, then by distance ascending
        const aRank = (a.on_duty ? 0 : 2) + (a._hasGps ? 0 : 1);
        const bRank = (b.on_duty ? 0 : 2) + (b._hasGps ? 0 : 1);
        if (aRank !== bRank) return aRank - bRank;
        if (a._miles != null && b._miles != null) return a._miles - b._miles;
        if (a._miles != null) return -1;
        if (b._miles != null) return 1;
        return 0;
      })
    : driversWithDistance;
  const closestDriverId = selectedJobPickup ? sorted.find((d) => d.on_duty && d._miles != null)?.id : null;

  return (
    <Card className="bg-[#0a0e14] border-white/5 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400" />
          <span className="text-xs uppercase tracking-wider text-slate-300 font-semibold">Drivers · Rotation</span>
        </div>
        {selectedJobId && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
            {selectedJobPickup ? 'Sorted by distance' : 'Click to assign'}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {sorted.map((d) => {
          const isClosest = d.id === closestDriverId;
          const milesText = d._miles != null
            ? (d._miles < 1 ? `${(d._miles * 5280).toFixed(0)} ft` : `${d._miles.toFixed(1)} mi`)
            : null;
          const milesColor = d._miles == null ? 'text-slate-500'
            : d._miles < 2 ? 'text-emerald-300'
            : d._miles < 8 ? 'text-amber-300'
            : 'text-slate-400';
          const ageText = formatAge(d.last_location_at);
          const stale = d.last_location_at ? (Date.now() - new Date(d.last_location_at).getTime() > 5 * 60 * 1000) : true;
          return (
            <div
              key={d.id}
              data-testid={`driver-row-${d.id}`}
              className={`group rounded-lg p-2.5 border transition ${isClosest ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30' : d.next_in_rotation ? 'bg-amber-500/10 border-amber-500/40' : 'bg-white/[0.02] border-white/5'} ${selectedJobId ? 'cursor-pointer hover:bg-amber-500/15 hover:border-amber-500/40' : ''}`}
              onClick={() => selectedJobId && handleAssign(d)}
            >
              <div className="flex items-center gap-2">
                {isClosest ? <MapPin className="w-3.5 h-3.5 text-emerald-300 shrink-0" /> : d.next_in_rotation && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white truncate flex items-center gap-2 flex-wrap">
                    {d.name}
                    {d.truck_number && <span className="text-[10px] text-slate-400 font-normal">· Truck {d.truck_number}</span>}
                    {isClosest && <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">Closest</span>}
                    {d.next_in_rotation && !isClosest && (
                      <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">Next Up</span>
                    )}
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
                  <Switch
                    data-testid={`duty-toggle-${d.id}`}
                    checked={d.on_duty}
                    onCheckedChange={(v) => toggleDuty(d, v)}
                    className="scale-75"
                  />
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
        Rotation defaults to oldest dispatched. With GPS, drivers are re-sorted by distance to the selected pickup.
      </div>
    </Card>
  );
}
