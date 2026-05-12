import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { ArrowLeft, MapPin, Plus, Play, Square, Trash2, Truck, Clock, Route as RouteIcon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { MapboxMap, fetchTruckRoute, geocodeAddress } from '@/components/MapboxMap';
import { setCopilotScreenContext, clearCopilotScreenContext } from '@/lib/copilotContext';

const statusStyle = {
  planned: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  active: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export default function DriverTripDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [trip, setTrip] = useState(null);
  const [mileage, setMileage] = useState([]);
  const [state, setState] = useState('');
  const [miles, setMiles] = useState('');
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [routeMeta, setRouteMeta] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);

  const load = async () => {
    const all = (await api.get('/trips')).data;
    setTrip(all.find((t) => t.id === id) || null);
    setMileage((await api.get(`/trips/${id}/mileage`)).data);
  };
  useEffect(() => { load(); }, [id]);

  // Geocode + fetch truck-aware route once we have the trip
  useEffect(() => {
    if (!trip?.origin || !trip?.destination) return;
    let cancelled = false;
    (async () => {
      setRouteLoading(true);
      setRouteError(null);
      try {
        const [o, d] = await Promise.all([
          geocodeAddress(trip.origin),
          geocodeAddress(trip.destination),
        ]);
        if (cancelled) return;
        if (!o || !d) { setRouteError('Could not geocode trip endpoints.'); setRouteLoading(false); return; }
        setOrigin(o); setDestination(d);
        try {
          const r = await fetchTruckRoute({ origin: [o.lng, o.lat], destination: [d.lng, d.lat] });
          if (cancelled) return;
          setRouteGeometry(r.geometry);
          setRouteMeta({ miles: r.distance_miles, minutes: r.duration_minutes });
        } catch (e) {
          if (!cancelled) setRouteError('Could not load route — endpoints shown only.');
        }
      } catch (e) {
        if (!cancelled) setRouteError('Mapbox unavailable.');
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [trip?.origin, trip?.destination]);

  const start = async () => { try { await api.post(`/trips/${id}/start`); toast.success('Trip started'); await load(); } catch { toast.error('Failed'); } };
  const end = async () => { try { await api.post(`/trips/${id}/end`, {}); toast.success('Trip completed'); await load(); } catch { toast.error('Failed'); } };
  const addMileage = async (e) => {
    e.preventDefault();
    if (!state || !miles) { toast.error('State and miles required'); return; }
    try { await api.post(`/trips/${id}/mileage`, { state, miles: Number(miles) }); setState(''); setMiles(''); toast.success('Mileage added'); await load(); } catch { toast.error('Failed'); }
  };
  const delMileage = async (mid) => { try { await api.delete(`/trips/${id}/mileage/${mid}`); await load(); } catch {} };

  useEffect(() => {
    if (!trip) return;
    setCopilotScreenContext({
      screen_key: 'driver_trip',
      screen_state: {
        trip_id: trip.id,
        trip_status: trip.status,
        route_loading: routeLoading,
        route_error: !!routeError,
      },
      draft_values: {
        origin: trip.origin || '',
        destination: trip.destination || '',
      },
    });
    return () => clearCopilotScreenContext('driver_trip');
  }, [trip, routeLoading, routeError]);

  if (!trip) return <div className="p-5 text-slate-400">Loading...</div>;
  const totalState = mileage.reduce((a, m) => a + (m.miles || 0), 0);

  return (
    <div className="p-5 space-y-4">
      <Link to="/driver/trips" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> All trips</Link>
      <div className="hp-panel-bordered rounded-2xl p-5 hp-glow">
        <div className="flex items-center justify-between">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${statusStyle[trip.status]}`}>{trip.status}</span>
          <span className="text-xs text-slate-500">{(trip.miles || 0).toLocaleString()} mi</span>
        </div>
        <div className="mt-2 text-2xl font-bold text-white leading-tight">{trip.origin} → {trip.destination}</div>
        <div className="hp-divider my-3" />
        {trip.status === 'planned' && <Button data-testid="trip-start-btn" onClick={start} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"><Play className="w-4 h-4 mr-1" /> Start trip</Button>}
        {trip.status === 'active' && <Button data-testid="trip-end-btn" onClick={end} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold"><Square className="w-4 h-4 mr-1" /> End trip</Button>}
      </div>

      {/* Truck-aware route map (Mapbox) */}
      <div className="hp-panel rounded-2xl overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-sky-400/80 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" /> Truck-aware route
          </div>
          {routeMeta && (
            <div className="flex items-center gap-3 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1"><RouteIcon className="w-3 h-3 text-sky-400" /> {routeMeta.miles.toFixed(0)} mi</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-sky-400" /> {Math.round(routeMeta.minutes / 60)}h {Math.round(routeMeta.minutes % 60)}m</span>
            </div>
          )}
        </div>
        <MapboxMap
          height={260}
          showTraffic={true}
          fitBounds={true}
          markers={[
            origin && { id: 'origin', lng: origin.lng, lat: origin.lat, color: '#10b981', label: `Origin: ${trip.origin}` },
            destination && { id: 'dest', lng: destination.lng, lat: destination.lat, color: '#f59e0b', label: `Destination: ${trip.destination}` },
          ].filter(Boolean)}
          route={routeGeometry}
          testId="trip-route-map"
        />
        <div className="px-5 py-3 text-[11px] text-slate-500 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500/80" /> Routes avoid known low-clearance and weight-restricted segments via Mapbox.</span>
          {routeLoading && <span className="text-sky-400">loading...</span>}
          {routeError && <span className="text-red-400">{routeError}</span>}
        </div>
      </div>

      <div className="hp-panel rounded-2xl p-5">
        <div className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><MapPin className="w-4 h-4 text-sky-400" /> Mileage by state (IFTA)</div>
        <form onSubmit={addMileage} className="flex gap-2 mb-3">
          <Input data-testid="mileage-state" placeholder="State (e.g. TX)" value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} className="bg-[#0a0e14] border-white/10 w-24" />
          <Input data-testid="mileage-miles" placeholder="Miles" type="number" step="0.1" value={miles} onChange={(e) => setMiles(e.target.value)} className="bg-[#0a0e14] border-white/10 flex-1" />
          <Button data-testid="mileage-add" type="submit" size="icon" className="bg-sky-500 hover:bg-sky-400 text-slate-950"><Plus className="w-4 h-4" /></Button>
        </form>
        <div className="divide-y divide-white/5">
          {mileage.length === 0 && <div className="text-xs text-slate-500">No mileage logged yet. Add a state to track for IFTA.</div>}
          {mileage.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3"><span className="text-xs px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono">{m.state}</span><span className="text-sm text-white">{m.miles} mi</span></div>
              <button onClick={() => delMileage(m.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        {mileage.length > 0 && <div className="mt-3 pt-3 border-t border-white/5 flex justify-between text-sm"><span className="text-slate-400">Total tracked</span><span className="text-white font-semibold">{totalState.toFixed(1)} mi</span></div>}
      </div>
    </div>
  );
}
