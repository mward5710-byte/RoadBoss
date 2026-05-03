import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wrench, Truck, Battery, Fuel, Key, AlertCircle, Phone, Star, Clock, ArrowLeft, ArrowRight, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const SERVICES = [
  { key: 'tire',       icon: Truck,       label: 'Flat tire',     prompt: 'Blew a tire / need a tire fix' },
  { key: 'tow',        icon: Truck,       label: 'Tow truck',     prompt: 'Need a wrecker / tow' },
  { key: 'jumpstart',  icon: Battery,     label: 'Jump start',    prompt: 'Battery dead' },
  { key: 'fuel',       icon: Fuel,        label: 'Out of fuel',   prompt: 'Fuel delivery' },
  { key: 'mechanical', icon: Wrench,      label: 'Mechanical',    prompt: 'Engine / mechanical issue' },
  { key: 'lockout',    icon: Key,         label: 'Lockout',       prompt: 'Locked out of cab' },
  { key: 'other',      icon: AlertCircle, label: 'Other',         prompt: 'Other roadside issue' },
];

const statusLabels = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  en_route: 'En route',
  arrived: 'Arrived',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function StatusPill({ status }) {
  const cls = ({
    requested: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    confirmed: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    en_route: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    arrived: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    completed: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    cancelled: 'bg-red-500/20 text-red-300 border-red-500/40',
  }[status]) || 'bg-white/5 text-slate-300 border-white/10';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${cls}`}>{statusLabels[status] || status}</span>;
}

export default function Roadside() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [activeService, setActiveService] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeDispatch, setActiveDispatch] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/roadside/providers'),
      api.get('/roadside/dispatch'),
    ]).then(([p, d]) => {
      setProviders(p.data || []);
      setHistory(d.data || []);
      const open = (d.data || []).find((x) => !['completed', 'cancelled'].includes(x.status));
      setActiveDispatch(open || null);
    }).finally(() => setLoading(false));
  }, []);

  const filteredProviders = useMemo(() => {
    if (!activeService) return providers;
    return providers.filter((p) => (p.services || []).includes(activeService));
  }, [providers, activeService]);

  const dispatch = async (provider_id) => {
    if (!activeService) { toast.error('Pick a service first'); return; }
    setSubmitting(true);
    try {
      let lat, lng;
      try {
        await new Promise((res) => navigator.geolocation?.getCurrentPosition(
          (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; res(); },
          () => res(),
          { timeout: 3000 }
        ));
      } catch {}
      const r = await api.post('/roadside/dispatch', {
        service_type: activeService,
        description: description || null,
        latitude: lat || null,
        longitude: lng || null,
        provider_id,
      });
      toast.success(`Dispatch sent — ${r.data.provider_name || 'provider'} ETA ${r.data.eta_minutes || '?'}min`);
      navigate(`/driver/roadside/${r.data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not dispatch');
    } finally { setSubmitting(false); }
  };

  const renderServiceIcon = (svc) => {
    const item = SERVICES.find((s) => s.key === svc) || SERVICES[0];
    const Icon = item.icon;
    return <Icon className="w-4 h-4" />;
  };

  if (loading) return <div className="p-6 text-center text-slate-500" data-testid="roadside-loading">Loading roadside...</div>;

  return (
    <div className="p-5 space-y-5" data-testid="roadside-page">
      <div className="flex items-center justify-between">
        <Link to="/driver" className="flex items-center gap-1.5 text-slate-400 hover:text-white" data-testid="roadside-back">
          <ArrowLeft className="w-4 h-4" /><span className="text-xs uppercase tracking-widest">Cab</span>
        </Link>
        <div className="text-xs uppercase tracking-widest text-sky-400/80">Roadside Assistance</div>
        <div className="w-12" />
      </div>

      {/* Active dispatch banner */}
      {activeDispatch && (
        <Link to={`/driver/roadside/${activeDispatch.id}`} data-testid="active-dispatch-banner">
          <div className="hp-panel-bordered rounded-2xl p-4 hp-glow flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
              {renderServiceIcon(activeDispatch.service_type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-400">Active dispatch</div>
              <div className="text-sm font-semibold text-white truncate">{activeDispatch.provider_name || 'Provider TBD'}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{activeDispatch.service_type} · ETA {activeDispatch.eta_minutes || '?'}min</div>
            </div>
            <StatusPill status={activeDispatch.status} />
            <ArrowRight className="w-4 h-4 text-slate-500" />
          </div>
        </Link>
      )}

      {/* Service picker */}
      <div className="hp-panel rounded-2xl p-5">
        <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">What do you need?</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            const active = activeService === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setActiveService(s.key)}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-colors ${active ? 'bg-sky-500/15 border-sky-500/50 text-sky-200' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
                data-testid={`svc-${s.key}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-medium">{s.label}</span>
              </button>
            );
          })}
        </div>
        {activeService && (
          <div className="mt-4">
            <label className="text-[11px] uppercase tracking-widest text-sky-400/80">Quick note (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`e.g., ${(SERVICES.find((s) => s.key === activeService) || {}).prompt || 'describe issue'}`}
              rows={2}
              className="mt-1 bg-white/5 border-white/10 text-slate-100"
              data-testid="roadside-note"
            />
          </div>
        )}
      </div>

      {/* Provider list */}
      <div className="hp-panel rounded-2xl p-5">
        <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">
          {activeService ? `Vetted providers for ${(SERVICES.find((s) => s.key === activeService) || {}).label}` : 'All vetted providers'}
        </div>
        {filteredProviders.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-6">No providers in your area for this service. Try "Other".</div>
        ) : (
          <div className="space-y-2">
            {filteredProviders.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3"
                data-testid={`provider-${p.id}`}
              >
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {p.logo_url ? <img src={p.logo_url} alt="" className="w-7 h-7 opacity-80" /> : <Wrench className="w-5 h-5 text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                    <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" /> {p.eta_avg_minutes}min</span>
                    <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3 text-amber-400" /> {p.rating}</span>
                    <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {p.region}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">{p.notes || ''}</div>
                </div>
                <Button
                  size="sm"
                  disabled={!activeService || submitting}
                  onClick={() => dispatch(p.id)}
                  className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold flex-shrink-0"
                  data-testid={`dispatch-${p.id}`}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Dispatch</>}
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="hp-panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 mb-3">Recent dispatches</div>
          <div className="space-y-2">
            {history.slice(0, 5).map((h) => (
              <Link key={h.id} to={`/driver/roadside/${h.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5" data-testid={`history-${h.id}`}>
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">{renderServiceIcon(h.service_type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{h.provider_name || h.service_type}</div>
                  <div className="text-[11px] text-slate-500">{new Date(h.created_at).toLocaleString()}</div>
                </div>
                <StatusPill status={h.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="text-[11px] text-slate-500 text-center pt-2">
        Or just say "<span className="text-sky-400">Hey Co-Pilot, I need a tire fixed</span>" — Co-Pilot will pick the fastest provider.
      </div>
    </div>
  );
}
