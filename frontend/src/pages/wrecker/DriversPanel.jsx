import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Users, Crown, Zap, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Drivers + Rotation panel for dispatchers/supervisors.
 * Shows the rotation queue: who's up next, who's on/off duty, active job count.
 */
export default function DriversPanel({ onAssign, selectedJobId }) {
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

  return (
    <Card className="bg-[#0a0e14] border-white/5 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400" />
          <span className="text-xs uppercase tracking-wider text-slate-300 font-semibold">Drivers · Rotation</span>
        </div>
        {selectedJobId && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
            Click to assign
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {drivers.map((d) => (
          <div
            key={d.id}
            data-testid={`driver-row-${d.id}`}
            className={`group rounded-lg p-2.5 border transition ${d.next_in_rotation ? 'bg-amber-500/10 border-amber-500/40' : 'bg-white/[0.02] border-white/5'} ${selectedJobId ? 'cursor-pointer hover:bg-amber-500/15 hover:border-amber-500/40' : ''}`}
            onClick={() => selectedJobId && handleAssign(d)}
          >
            <div className="flex items-center gap-2">
              {d.next_in_rotation && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate flex items-center gap-2">
                  {d.name}
                  {d.next_in_rotation && (
                    <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">Next Up</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                  <span>{d.active_jobs} active</span>
                  <span>·</span>
                  <span>{d.last_dispatched_at ? `last ${new Date(d.last_dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'never dispatched'}</span>
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
        ))}
        {drivers.length === 0 && (
          <div className="text-center text-xs text-slate-500 py-4">No drivers configured yet.</div>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-slate-500 leading-relaxed">
        Rotation is automatic: oldest dispatched on-duty driver gets the next call.
      </div>
    </Card>
  );
}
