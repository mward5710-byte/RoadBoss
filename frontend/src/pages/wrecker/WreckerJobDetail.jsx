import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Phone, MapPin, MessageSquare, CheckCircle2, Clock, DollarSign, Truck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_FLOW = ['pending', 'assigned', 'en_route', 'on_scene', 'in_progress', 'completed'];
const STATUS_LABEL = { pending: 'Pending', assigned: 'Assigned', en_route: 'En Route', on_scene: 'On Scene', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };

export default function WreckerJobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/wrecker/jobs/${id}`);
      setJob(r.data);
    } catch (e) {
      toast.error('Job not found');
      navigate('/wrecker');
    } finally { setLoading(false); }
  }, [id, navigate]);

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
      navigate('/wrecker');
    } catch (e) { toast.error('Cancel failed'); }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading job...</div>;
  if (!job) return null;

  const idx = STATUS_FLOW.indexOf(job.status);
  const next = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link to="/wrecker"><Button variant="ghost" size="sm" data-testid="back-to-board"><ArrowLeft className="w-4 h-4" /></Button></Link>
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

      <div className="flex justify-end">
        <Button data-testid="cancel-job" variant="outline" onClick={cancelJob} className="border-red-500/30 text-red-300 hover:bg-red-500/10">
          <AlertTriangle className="w-4 h-4 mr-1" /> Cancel Job
        </Button>
      </div>
    </div>
  );
}
