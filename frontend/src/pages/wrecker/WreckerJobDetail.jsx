import React, { useEffect, useState, useCallback } from 'react';
import { api, getUser } from '@/lib/api';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Phone, MapPin, MessageSquare, CheckCircle2, Clock, DollarSign, Truck, AlertTriangle, UserPlus, Crown } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_FLOW = ['pending', 'assigned', 'en_route', 'on_scene', 'in_progress', 'completed'];
const STATUS_LABEL = { pending: 'Pending', assigned: 'Assigned', en_route: 'En Route', on_scene: 'On Scene', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };

export default function WreckerJobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = getUser();
  const role = me?.role;
  const isDriver = role === 'wrecker_operator';
  const canDispatch = ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'dispatcher'].includes(role);
  const canReassign = ['wrecker_supervisor', 'fleet_admin', 'super_admin'].includes(role);
  const [job, setJob] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reassignTo, setReassignTo] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/wrecker/jobs/${id}`);
      setJob(r.data);
      // Drivers list (only available to dispatcher+)
      if (canDispatch) {
        try {
          const dr = await api.get('/wrecker/drivers');
          setDrivers(dr.data);
        } catch (e) { /* silent */ }
      }
    } catch (e) {
      toast.error('Job not found');
      navigate(isDriver ? '/wrecker/me' : '/wrecker');
    } finally { setLoading(false); }
  }, [id, navigate, canDispatch, isDriver]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (newStatus) => {
    try {
      await api.post(`/wrecker/jobs/${id}/status`, { status: newStatus });
      toast.success(`Status → ${STATUS_LABEL[newStatus]}`);
      load();
    } catch (e) { toast.error('Status update failed'); }
  };

  const cancelJob = async () => {
    if (!window.confirm('Cancel this job?')) return;
    try {
      await api.post(`/wrecker/jobs/${id}/status`, { status: 'cancelled' });
      toast.success('Job cancelled');
      navigate(isDriver ? '/wrecker/me' : '/wrecker');
    } catch (e) { toast.error('Cancel failed'); }
  };

  const handleAssign = async () => {
    if (!reassignTo) { toast.error('Pick a driver first'); return; }
    try {
      await api.post(`/wrecker/jobs/${id}/assign`, { driver_id: reassignTo });
      toast.success('Driver assigned');
      setReassignTo('');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Assign failed');
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading job...</div>;
  if (!job) return null;

  const idx = STATUS_FLOW.indexOf(job.status);
  const next = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
  const assignedDriver = drivers.find((d) => d.id === job.assigned_driver_id);
  const canShowReassign = canDispatch && (
    !job.assigned_driver_id || canReassign
  );
  const reassignLabel = job.assigned_driver_id
    ? (canReassign ? 'Reassign Driver' : 'Already Assigned')
    : 'Assign Driver';

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link to={isDriver ? '/wrecker/me' : '/wrecker'}><Button variant="ghost" size="sm" data-testid="back-to-board"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <div className="text-xs uppercase tracking-widest text-amber-400/80">{(job.service_type || '').replace(/_/g, ' ')}</div>
            <h1 className="text-2xl font-bold text-white mt-1" data-testid="job-customer-name">{job.customer?.name}</h1>
            <div className="text-sm text-slate-400 mt-0.5">
              {[job.vehicle?.year, job.vehicle?.color, job.vehicle?.make, job.vehicle?.model].filter(Boolean).join(' ')}
              {job.vehicle?.plate && <span className="ml-1 text-slate-500">· {job.vehicle.plate}</span>}
            </div>
          </div>
        </div>
        <Badge data-testid="job-status-badge" className="text-xs uppercase tracking-wider bg-amber-500/15 text-amber-200 border border-amber-500/30">
          {STATUS_LABEL[job.status] || job.status}
        </Badge>
      </header>

      {/* Status pipeline */}
      <Card className="p-5 bg-[#0a0e14] border-white/5">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-4">Status Pipeline</div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {STATUS_FLOW.map((s, i) => {
            const isCurrent = s === job.status;
            const isPast = idx > i;
            return (
              <React.Fragment key={s}>
                <button
                  data-testid={`set-status-${s}`}
                  onClick={() => setStatus(s)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs uppercase tracking-wider transition border
                    ${isCurrent ? 'bg-amber-500 text-black border-amber-400 font-semibold' : isPast ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'}`}
                >
                  {STATUS_LABEL[s]}
                </button>
                {i < STATUS_FLOW.length - 1 && <div className={`h-0.5 w-4 ${isPast ? 'bg-emerald-400/50' : 'bg-white/10'}`} />}
              </React.Fragment>
            );
          })}
        </div>
        {next && (
          <Button data-testid="advance-status" onClick={() => setStatus(next)} className="mt-4 bg-amber-500 text-black hover:bg-amber-400" size="sm">
            <CheckCircle2 className="w-4 h-4 mr-1" /> Mark {STATUS_LABEL[next]}
          </Button>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-3">
          <div className="text-xs uppercase tracking-wider text-slate-400">Customer</div>
          <div className="text-white">{job.customer?.name}</div>
          {job.customer?.phone && (
            <a href={`tel:${job.customer.phone}`} className="flex items-center gap-2 text-sky-300 text-sm hover:text-sky-200">
              <Phone className="w-4 h-4" /> {job.customer.phone}
            </a>
          )}
          {job.customer?.email && <div className="text-sm text-slate-400">{job.customer.email}</div>}
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-3">
          <div className="text-xs uppercase tracking-wider text-slate-400">Billing</div>
          <div className="flex items-center gap-2 text-emerald-300 text-2xl font-bold">
            <DollarSign className="w-5 h-5" /> {(job.final_price ?? job.quoted_price ?? 0).toFixed(2)}
          </div>
          <div className="text-xs text-slate-400">Payment method: <span className="text-slate-200 uppercase">{(job.payment_method || 'invoice').replace('_', ' ')}</span></div>
          {job.motor_club_name && <div className="text-xs text-amber-300">Motor Club: {job.motor_club_name}</div>}
        </Card>
      </div>

      {/* Assignment / Reassignment — visible to dispatcher+ only */}
      {canDispatch && (
        <Card className="p-5 bg-[#0a0e14] border-white/5" data-testid="assignment-card">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400 mb-3">
            <UserPlus className="w-3 h-3" /> Driver Assignment
          </div>
          {assignedDriver ? (
            <div className="flex items-center gap-3 mb-3">
              <Crown className="w-4 h-4 text-amber-400" />
              <div className="flex-1">
                <div className="text-sm text-white font-semibold">{assignedDriver.name}</div>
                <div className="text-[11px] text-slate-500 uppercase tracking-wider">Currently assigned</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 mb-3">Unassigned. Pick a driver from rotation:</div>
          )}
          {canShowReassign && job.status !== 'completed' && job.status !== 'cancelled' ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select value={reassignTo} onValueChange={setReassignTo}>
                  <SelectTrigger data-testid="reassign-select" className="bg-[#07090d] border-white/10 text-white">
                    <SelectValue placeholder="Select driver..." />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} {d.next_in_rotation ? '👑 NEXT UP' : ''} {!d.on_duty ? '(off duty)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                data-testid="confirm-assign"
                onClick={handleAssign}
                disabled={!reassignTo || reassignTo === job.assigned_driver_id}
                className="bg-amber-500 text-black hover:bg-amber-400"
              >
                {job.assigned_driver_id ? 'Reassign' : 'Assign'}
              </Button>
            </div>
          ) : job.assigned_driver_id && !canReassign ? (
            <div className="text-[11px] text-slate-500 italic">Only a foreman can reassign an already-assigned job.</div>
          ) : null}
        </Card>
      )}

      <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-3">
        <div className="text-xs uppercase tracking-wider text-slate-400">Locations</div>
        <div className="flex items-start gap-3"><MapPin className="w-4 h-4 text-amber-300 mt-0.5" /><div className="text-sm text-white">{job.pickup?.address || 'No pickup set'}</div></div>
        {job.dropoff?.address && (
          <div className="flex items-start gap-3"><Truck className="w-4 h-4 text-emerald-300 mt-0.5" /><div className="text-sm text-slate-300">{job.dropoff.address}</div></div>
        )}
      </Card>

      {job.notes && (
        <Card className="p-5 bg-[#0a0e14] border-white/5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400 mb-2">
            <MessageSquare className="w-3 h-3" /> Dispatch Notes
          </div>
          <div className="text-sm text-slate-200 whitespace-pre-wrap">{job.notes}</div>
        </Card>
      )}

      {job.status_history?.length > 0 && (
        <Card className="p-5 bg-[#0a0e14] border-white/5">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Activity</div>
          <div className="space-y-2">
            {job.status_history.slice().reverse().map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                <span className="text-slate-300">{STATUS_LABEL[h.status] || h.status}</span>
                <span>→</span>
                <span>{h.at ? new Date(h.at).toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {canDispatch && (
        <div className="flex justify-end">
          <Button data-testid="cancel-job" variant="outline" onClick={cancelJob} className="border-red-500/30 text-red-300 hover:bg-red-500/10">
            <AlertTriangle className="w-4 h-4 mr-1" /> Cancel Job
          </Button>
        </div>
      )}
    </div>
  );
}
