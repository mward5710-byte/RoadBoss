import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Phone, MapPin, Clock, ShieldCheck, X, CheckCircle2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { setCopilotScreenContext, clearCopilotScreenContext } from '@/lib/copilotContext';
import { toast } from 'sonner';
import { MapboxMap } from '@/components/MapboxMap';

const FLOW = ['requested', 'confirmed', 'en_route', 'arrived', 'completed'];
const FLOW_LABELS = {
  requested: 'Request sent',
  confirmed: 'Provider confirmed',
  en_route: 'On the way',
  arrived: 'Arrived on scene',
  completed: 'Service completed',
};

export default function RoadsideDetail() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    api.get(`/roadside/dispatch/${id}`).then((r) => setDoc(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); /* poll for status updates */ const t = setInterval(refresh, 8000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    if (!doc) return;
    setCopilotScreenContext({
      screen_key: 'driver_roadside',
      screen_state: {
        dispatch_id: doc.id,
        status: doc.status,
        provider_name: doc.provider_name || null,
        eta_minutes: doc.eta_minutes || null,
      },
      draft_values: {
        service_type: doc.service_type || '',
        description: doc.description || '',
      },
    });
    return () => clearCopilotScreenContext('driver_roadside');
  }, [doc]);

  if (loading) return <div className="p-6 text-center text-slate-500">Loading dispatch...</div>;
  if (!doc) return <div className="p-6 text-center text-slate-500">Dispatch not found.</div>;

  const cancelled = doc.status === 'cancelled';
  const completed = doc.status === 'completed';
  const progressIdx = FLOW.indexOf(doc.status);

  const cancel = async () => {
    setBusy(true);
    try {
      await api.put(`/roadside/dispatch/${id}/status`, { status: 'cancelled', note: 'Cancelled by driver' });
      toast.info('Dispatch cancelled.');
      refresh();
    } catch (e) { toast.error('Could not cancel'); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-5 space-y-5" data-testid="roadside-detail">
      <div className="flex items-center justify-between">
        <Link to="/driver/roadside" className="flex items-center gap-1.5 text-slate-400 hover:text-white" data-testid="roadside-detail-back">
          <ArrowLeft className="w-4 h-4" /><span className="text-xs uppercase tracking-widest">Roadside</span>
        </Link>
        <div className="text-xs uppercase tracking-widest text-sky-400/80">Dispatch</div>
        <div className="w-16" />
      </div>

      <div className="hp-panel-bordered rounded-2xl p-5 hp-glow">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
            {doc.provider_logo ? <img src={doc.provider_logo} alt="" className="w-7 h-7" /> : <Truck className="w-6 h-6 text-sky-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{doc.provider_name || 'Provider being assigned...'}</div>
            <div className="text-[11px] text-slate-400 capitalize">{doc.service_type} · ETA {doc.eta_minutes || '?'} min</div>
          </div>
          {doc.provider_phone && !cancelled && !completed && (
            <a href={`tel:${doc.provider_phone}`} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs" data-testid="call-provider-btn">
              <Phone className="w-3.5 h-3.5" /> Call
            </a>
          )}
        </div>
        {doc.description && (
          <div className="mt-3 pt-3 border-t border-white/5 text-sm text-slate-300">"{doc.description}"</div>
        )}
      </div>

      {/* Location map (if we have driver coords) */}
      {(doc.latitude && doc.longitude) && (
        <div className="hp-panel rounded-2xl overflow-hidden">
          <div className="px-5 pt-4 pb-3 text-xs uppercase tracking-widest text-sky-400/80 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Your location
          </div>
          <MapboxMap
            height={200}
            showTraffic={false}
            fitBounds={false}
            center={[doc.longitude, doc.latitude]}
            zoom={13}
            markers={[{ id: 'me', lng: doc.longitude, lat: doc.latitude, color: '#38bdf8', label: 'You' }]}
            testId="roadside-location-map"
          />
        </div>
      )}

      {/* Status timeline */}
      <div className="hp-panel rounded-2xl p-5">
        <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-4">Status</div>
        {cancelled ? (
          <div className="flex items-center gap-3 text-red-300"><X className="w-5 h-5" /> <div><div className="text-sm font-semibold">Cancelled</div><div className="text-[11px] text-slate-500">Dispatch was cancelled.</div></div></div>
        ) : (
          <ol className="space-y-3">
            {FLOW.map((step, i) => {
              const reached = i <= progressIdx;
              const current = i === progressIdx;
              return (
                <li key={step} className="flex items-start gap-3" data-testid={`status-step-${step}`}>
                  <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${reached ? 'bg-sky-500 text-slate-950' : 'bg-white/5 border border-white/10 text-slate-500'}`}>
                    {reached ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="text-[10px]">{i + 1}</span>}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${current ? 'text-white' : reached ? 'text-slate-300' : 'text-slate-500'}`}>{FLOW_LABELS[step]}</div>
                    {current && step === 'requested' && <div className="text-[11px] text-slate-500">Waiting for provider to confirm...</div>}
                    {current && step === 'en_route' && <div className="text-[11px] text-emerald-400">{doc.provider_name} is on the way.</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Provider history */}
      {doc.history && doc.history.length > 1 && (
        <div className="hp-panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">Activity</div>
          <div className="space-y-2">
            {doc.history.slice().reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-3 text-xs">
                <Clock className="w-3 h-3 mt-1 text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-slate-300 capitalize">{h.status?.replace('_', ' ')}{h.note ? ` — ${h.note}` : ''}</div>
                  <div className="text-slate-500 text-[10px]">{h.at ? new Date(h.at).toLocaleString() : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!cancelled && !completed && (
        <Button onClick={cancel} disabled={busy} variant="outline" className="w-full border-red-500/40 text-red-300 hover:bg-red-500/10" data-testid="cancel-dispatch-btn">
          <X className="w-4 h-4 mr-1" /> Cancel dispatch
        </Button>
      )}

      <div className="text-[11px] text-slate-500 text-center pt-2 flex items-center justify-center gap-1">
        <ShieldCheck className="w-3 h-3" /> Status auto-updates every few seconds.
      </div>
    </div>
  );
}
