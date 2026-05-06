import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation as NavIcon, Truck, AlertTriangle, ShieldCheck, Search,
  ArrowRight, Loader2, Fuel, Clock, Route as RouteIcon, X, Layers, Wrench,
  Mountain, Construction, Ban, ChevronRight, ChevronUp, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// Mapbox dark style for a polished, investor-ready look.
// Token is fetched from /api/mapbox/config — already configured server-side.
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';

const HAZARD_ICONS = {
  low_bridge:        { icon: Mountain,      color: '#f43f5e', label: 'Low Bridge' },
  weight_limit:      { icon: Construction,  color: '#f59e0b', label: 'Weight Limit' },
  width_limit:       { icon: ChevronRight,  color: '#8b5cf6', label: 'Narrow Road' },
  hazmat_restricted: { icon: Ban,           color: '#ef4444', label: 'Hazmat Restricted' },
  tight_turn:        { icon: Wrench,        color: '#06b6d4', label: 'Tight Turn' },
};

// Default truck profiles drivers/dispatchers can pick
const TRUCK_PRESETS = [
  { id: 'light',  name: 'Light-Duty (Wheel-lift)',     height_ft: 11.5, width_ft: 8.0, weight_tons: 8,  length_ft: 24 },
  { id: 'medium', name: 'Medium-Duty Flatbed',          height_ft: 12.5, width_ft: 8.5, weight_tons: 14, length_ft: 30 },
  { id: 'heavy',  name: 'Heavy Wrecker (25-ton)',       height_ft: 13.0, width_ft: 8.5, weight_tons: 25, length_ft: 36 },
  { id: 'rotator', name: 'Rotator / Heavy Recovery',    height_ft: 13.6, width_ft: 8.5, weight_tons: 50, length_ft: 45 },
];

export default function WreckerNavigation() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const [hazards, setHazards] = useState([]);
  const [trucks, setTrucks] = useState([]);

  // Route planning state
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [origin, setOrigin] = useState(null);   // {label, lat, lng}
  const [destination, setDestination] = useState(null);

  const [presetId, setPresetId] = useState('heavy');
  const [profile, setProfile] = useState({ ...TRUCK_PRESETS[2] });
  const [selectedTruck, setSelectedTruck] = useState('preset');

  const [planning, setPlanning] = useState(false);
  const [route, setRoute] = useState(null);
  const [showSteps, setShowSteps] = useState(true);
  const [showHazards, setShowHazards] = useState(true);

  // ---- Init map -----------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      // Fetch the public Mapbox token from backend (set in /app/backend/.env)
      try {
        const cfg = await api.get('/mapbox/config');
        if (cancelled) return;
        if (!cfg.data?.token) {
          toast.error('Mapbox token not configured. Add MAPBOX_PUBLIC_TOKEN to backend env.');
          return;
        }
        mapboxgl.accessToken = cfg.data.token;
      } catch (e) {
        toast.error('Could not load map token from server.');
        return;
      }
      if (cancelled || !mapContainerRef.current) return;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLE,
        center: [-86.1336, 40.4865], // Kokomo, IN
        zoom: 10,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
      map.on('load', () => {
        // Force size recompute in case container measured 0 during init
        setTimeout(() => map.resize(), 100);
        setTimeout(() => map.resize(), 500);
        // Empty source for the route line — populated when user plans
        map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'route-glow', type: 'line', source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#fbbf24', 'line-width': 12, 'line-blur': 8, 'line-opacity': 0.45 },
        });
        map.addLayer({
          id: 'route-core', type: 'line', source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#fbbf24', 'line-width': 5 },
        });
        // Origin/destination pins source
        map.addSource('endpoints', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'endpoints-pin', type: 'circle', source: 'endpoints',
          paint: {
            'circle-radius': 10,
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#0a0e14',
            'circle-stroke-width': 3,
          },
        });
        setMapReady(true);
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // ---- Load hazards + trucks ---------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const [h, t] = await Promise.all([
          api.get('/wrecker/navigate/hazards'),
          api.get('/wrecker/trucks').catch(() => ({ data: { items: [] } })),
        ]);
        setHazards(h.data.hazards || []);
        setTrucks(t.data.items || t.data.trucks || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // ---- Render hazard pins on map -----------------------------------------
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const features = (showHazards ? hazards : []).map((h) => ({
      type: 'Feature',
      properties: {
        id: h.id, kind: h.kind, name: h.name, severity: h.severity,
        color: HAZARD_ICONS[h.kind]?.color || '#94a3b8',
      },
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
    }));
    if (map.getSource('hazards')) {
      map.getSource('hazards').setData({ type: 'FeatureCollection', features });
    } else {
      map.addSource('hazards', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({
        id: 'hazards-halo', type: 'circle', source: 'hazards',
        paint: {
          'circle-radius': ['match', ['get', 'severity'], 'high', 16, 'medium', 12, 8],
          'circle-color': ['get', 'color'], 'circle-opacity': 0.18,
        },
      });
      map.addLayer({
        id: 'hazards-core', type: 'circle', source: 'hazards',
        paint: {
          'circle-radius': 5, 'circle-color': ['get', 'color'],
          'circle-stroke-color': '#0a0e14', 'circle-stroke-width': 1.5,
        },
      });
      // Click popup
      map.on('click', 'hazards-core', (e) => {
        const f = e.features[0];
        const haz = hazards.find((h) => h.id === f.properties.id);
        if (!haz) return;
        const meta = HAZARD_ICONS[haz.kind] || {};
        const detail = haz.max_height_ft ? `Max height: ${haz.max_height_ft}'`
                       : haz.max_weight_tons ? `Max weight: ${haz.max_weight_tons} tons`
                       : haz.max_width_ft ? `Max width: ${haz.max_width_ft}'`
                       : haz.max_length_ft ? `Max length: ${haz.max_length_ft}'`
                       : 'No commercial trucks';
        new mapboxgl.Popup({ offset: 14, className: 'hp-haz-popup' })
          .setLngLat([haz.lng, haz.lat])
          .setHTML(`
            <div style="background:#0d1218;border:1px solid rgba(255,255,255,.08);padding:10px 12px;border-radius:8px;color:#fff;min-width:200px;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:${meta.color};">${meta.label || haz.kind}</div>
              <div style="font-weight:600;margin-top:2px;">${haz.name}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${detail}</div>
              <div style="font-size:10px;color:#64748b;margin-top:4px;text-transform:uppercase;">Severity: ${haz.severity}</div>
            </div>`)
          .addTo(map);
      });
      map.on('mouseenter', 'hazards-core', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'hazards-core', () => { map.getCanvas().style.cursor = ''; });
    }
  }, [hazards, mapReady, showHazards]);

  // ---- Geocode helpers ----------------------------------------------------
  const geocode = useCallback(async (q, setter) => {
    if (!q || q.length < 3) { setter([]); return; }
    try {
      const r = await api.post('/wrecker/navigate/geocode', { query: q });
      setter(r.data.results || []);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => geocode(originText, setOriginSuggestions), 400);
    return () => clearTimeout(t);
  }, [originText, geocode]);
  useEffect(() => {
    const t = setTimeout(() => geocode(destText, setDestSuggestions), 400);
    return () => clearTimeout(t);
  }, [destText, geocode]);

  const pickOrigin = (s) => { setOrigin(s); setOriginText(s.label.split(',').slice(0, 2).join(',')); setOriginSuggestions([]); };
  const pickDest = (s) => { setDestination(s); setDestText(s.label.split(',').slice(0, 2).join(',')); setDestSuggestions([]); };

  // ---- Profile sync ------------------------------------------------------
  useEffect(() => {
    if (selectedTruck === 'preset') {
      const p = TRUCK_PRESETS.find((x) => x.id === presetId) || TRUCK_PRESETS[2];
      setProfile({ ...p });
    } else {
      const t = trucks.find((x) => x.id === selectedTruck);
      if (t) {
        setProfile({
          truck_id: t.id, truck_name: `${t.year || ''} ${t.make || ''} ${t.model || ''}`.trim() || t.name || 'Truck',
          height_ft: parseFloat(t.height_ft) || 13,
          width_ft: parseFloat(t.width_ft) || 8.5,
          weight_tons: parseFloat(t.weight_tons) || parseFloat(t.gvwr_lbs ? t.gvwr_lbs / 2000 : 14),
          length_ft: parseFloat(t.length_ft) || 32,
          hazmat: !!t.hazmat,
        });
      }
    }
  }, [selectedTruck, presetId, trucks]);

  // ---- Plan route --------------------------------------------------------
  const planRoute = async () => {
    if (!origin || !destination) {
      toast.error('Pick a pickup and a destination first.');
      return;
    }
    setPlanning(true);
    try {
      const r = await api.post('/wrecker/navigate/plan', {
        origin: [origin.lng, origin.lat],
        destination: [destination.lng, destination.lat],
        profile,
      });
      setRoute(r.data);
      drawRoute(r.data);
      const restrictionMsg = r.data.restriction_count > 0
        ? `Route avoided ${r.data.restriction_count} truck restriction${r.data.restriction_count === 1 ? '' : 's'}.`
        : 'Clean corridor — no restrictions in your path.';
      toast.success(restrictionMsg, { duration: 6000 });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not plan route');
    } finally {
      setPlanning(false);
    }
  };

  const drawRoute = (data) => {
    const map = mapRef.current;
    if (!map) return;
    const coords = data.geometry.coordinates;
    map.getSource('route').setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: data.geometry }],
    });
    map.getSource('endpoints').setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { color: '#22c55e' }, geometry: { type: 'Point', coordinates: coords[0] } },
        { type: 'Feature', properties: { color: '#f43f5e' }, geometry: { type: 'Point', coordinates: coords[coords.length - 1] } },
      ],
    });
    // Fit map to route
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
      padding: { top: 80, bottom: 80, left: 460, right: 80 }, duration: 900,
    });
  };

  // ---- Render -----------------------------------------------------------
  const profileSummary = useMemo(() => {
    return `${profile.height_ft}' H · ${profile.width_ft}' W · ${profile.weight_tons}T · ${profile.length_ft}' L${profile.hazmat ? ' · HAZMAT' : ''}`;
  }, [profile]);

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 0px)', minHeight: '600px' }} data-testid="wrecker-navigation-page">
      {/* MAP */}
      <div ref={mapContainerRef} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />

      {/* TOP BANNER — engine status */}
      {route && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <Badge className="bg-amber-500/15 border border-amber-500/40 text-amber-200 backdrop-blur-md py-1.5 px-3 text-[11px] uppercase tracking-widest">
            <NavIcon className="w-3 h-3 mr-1.5" />
            Truck-Aware Routing · Engine: {route.engine}{route.demo_mode && ' · Demo'}
          </Badge>
        </div>
      )}

      {/* LEFT PANEL */}
      <div className="absolute left-4 top-4 bottom-4 w-[420px] z-10 flex flex-col gap-3 max-w-[calc(100vw-2rem)]">
        <Card className="bg-[#0d1218]/95 backdrop-blur-xl border-white/10 p-4 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <NavIcon className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber-400/80">RoadBoss · Wreckerlogix</div>
              <div className="text-base font-bold text-white leading-tight">Truck-Aware Navigation</div>
            </div>
          </div>

          {/* TRUCK PROFILE */}
          <div className="space-y-2.5 mb-3 pb-3 border-b border-white/5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-widest text-slate-400">Truck Profile</Label>
              <Badge variant="outline" className="border-white/10 text-slate-300 text-[10px]">{profileSummary}</Badge>
            </div>
            <Select value={selectedTruck} onValueChange={setSelectedTruck}>
              <SelectTrigger data-testid="nav-truck-select" className="bg-[#0a0e14] border-white/10 text-white h-9 text-sm">
                <Truck className="w-3.5 h-3.5 mr-2 text-slate-500" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preset">Use a quick preset…</SelectItem>
                {trucks.length > 0 && <div className="text-[10px] uppercase tracking-widest text-slate-500 px-2 py-1.5">Your fleet</div>}
                {trucks.map((t) => (
                  <SelectItem key={t.id} value={t.id} data-testid={`nav-truck-${t.id}`}>
                    {(t.year ? `${t.year} ` : '') + (t.make || '') + ' ' + (t.model || '') + (t.unit_number ? ` · #${t.unit_number}` : '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTruck === 'preset' && (
              <Select value={presetId} onValueChange={setPresetId}>
                <SelectTrigger data-testid="nav-preset-select" className="bg-[#0a0e14] border-white/10 text-white h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRUCK_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} data-testid={`nav-preset-${p.id}`}>
                      {p.name} · {p.height_ft}' · {p.weight_tons}T
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ORIGIN / DESTINATION */}
          <div className="space-y-2.5 mb-3 pb-3 border-b border-white/5">
            <GeocodeField
              label="Pickup"
              value={originText}
              onChange={setOriginText}
              suggestions={originSuggestions}
              onPick={pickOrigin}
              testid="nav-origin"
              dotColor="#22c55e"
            />
            <GeocodeField
              label="Destination"
              value={destText}
              onChange={setDestText}
              suggestions={destSuggestions}
              onPick={pickDest}
              testid="nav-dest"
              dotColor="#f43f5e"
            />
          </div>

          <Button
            onClick={planRoute}
            disabled={planning || !origin || !destination}
            data-testid="nav-plan-btn"
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
          >
            {planning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Computing truck-safe route…</> : <><RouteIcon className="w-4 h-4 mr-2" /> Plan Truck-Aware Route</>}
          </Button>
        </Card>

        {/* RESULTS */}
        {route && (
          <Card data-testid="nav-route-summary" className="bg-[#0d1218]/95 backdrop-blur-xl border-white/10 overflow-hidden shadow-2xl shadow-black/40 flex flex-col min-h-0">
            <div className="p-4 border-b border-white/5">
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Stat icon={RouteIcon} label="Distance" value={`${route.distance_mi} mi`} accent="amber" />
                <Stat icon={Clock} label="ETA (truck)" value={`${route.duration_min_truck}m`} sub={`car: ${route.duration_min_car}m`} accent="sky" />
                <Stat icon={Fuel} label="Diesel" value={`$${route.fuel.diesel_cost_usd}`} sub={`${route.fuel.gallons} gal · ${route.fuel.mpg} mpg`} accent="emerald" />
              </div>
              <div className={`p-2.5 rounded-lg border text-xs leading-relaxed ${
                route.restriction_count > 0
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-100'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100'
              }`} data-testid="nav-avoidance-summary">
                {route.restriction_count > 0
                  ? <ShieldCheck className="inline w-3.5 h-3.5 mr-1.5 text-amber-300" />
                  : <ShieldCheck className="inline w-3.5 h-3.5 mr-1.5 text-emerald-300" />}
                {route.avoidance_summary}
              </div>
            </div>

            {/* Tabs: Steps / Hazards */}
            <Tabs defaultValue="steps" className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-4 mt-3 bg-[#0a0e14] border border-white/10 grid grid-cols-2">
                <TabsTrigger value="steps" data-testid="nav-tab-steps">
                  Turn-by-Turn ({route.steps.length})
                </TabsTrigger>
                <TabsTrigger value="hazards" data-testid="nav-tab-hazards">
                  Restrictions ({route.blocking_hazards.length + route.advisory_hazards.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="steps" className="flex-1 overflow-y-auto p-4 space-y-2 mt-2 min-h-0" data-testid="nav-steps-list">
                {route.steps.map((s, i) => (
                  <div key={i} className="flex gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="w-7 h-7 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-[10px] font-semibold text-amber-200 shrink-0">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">{s.instruction}</div>
                      {(s.distance_m > 0) && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {(s.distance_m / 1609.34).toFixed(1)} mi · {Math.round(s.duration_s / 60)} min
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {route.synthetic && (
                  <div className="p-2.5 rounded-lg bg-slate-500/10 border border-slate-500/20 text-[11px] text-slate-400">
                    Note: Routing service was unreachable so a straight-line preview is shown. Full turn-by-turn returns when OSRM/Mapbox is reachable.
                  </div>
                )}
              </TabsContent>
              <TabsContent value="hazards" className="flex-1 overflow-y-auto p-4 space-y-2 mt-2 min-h-0" data-testid="nav-hazards-list">
                {route.blocking_hazards.length === 0 && route.advisory_hazards.length === 0 && (
                  <div className="text-center text-slate-500 text-sm py-8">
                    <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                    No restrictions in your corridor — straight shot, boss.
                  </div>
                )}
                {route.blocking_hazards.map((h) => <HazardCard key={h.id} hazard={h} blocked />)}
                {route.advisory_hazards.map((h) => <HazardCard key={h.id} hazard={h} />)}
              </TabsContent>
            </Tabs>
          </Card>
        )}
      </div>

      {/* MAP CONTROLS (right) */}
      <div className="absolute right-4 bottom-4 z-10 flex flex-col gap-2">
        <Button
          onClick={() => setShowHazards((v) => !v)}
          variant="outline"
          size="sm"
          data-testid="nav-toggle-hazards"
          className="bg-[#0d1218]/90 backdrop-blur-md border-white/10 text-slate-200 hover:bg-white/5"
        >
          <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
          {showHazards ? 'Hide' : 'Show'} Restrictions
        </Button>
      </div>

      {/* LEGEND */}
      <div className="absolute right-4 top-20 z-10">
        <Card className="bg-[#0d1218]/90 backdrop-blur-md border-white/10 p-3 w-44 shadow-xl">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <Layers className="w-3 h-3" /> Map Legend
          </div>
          <div className="space-y-1.5">
            {Object.entries(HAZARD_ICONS).map(([k, v]) => {
              const Ic = v.icon;
              return (
                <div key={k} className="flex items-center gap-2 text-[11px] text-slate-300">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: v.color }} />
                  <Ic className="w-3 h-3 text-slate-500" />
                  <span>{v.label}</span>
                </div>
              );
            })}
            <div className="pt-1.5 mt-1.5 border-t border-white/5 flex items-center gap-2 text-[11px] text-slate-300">
              <div className="w-4 h-0.5 bg-amber-400" />
              <span>Truck-safe route</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function GeocodeField({ label, value, onChange, suggestions, onPick, testid, dotColor }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <Label className="text-[10px] uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} /> {label}
      </Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Address, city, or coordinates…"
          data-testid={testid}
          className="pl-8 bg-[#0a0e14] border-white/10 text-white text-sm h-9"
        />
      </div>
      <AnimatePresence>
        {focused && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 top-full mt-1 bg-[#0d1218] border border-white/10 rounded-lg shadow-2xl shadow-black/50 z-20 max-h-64 overflow-y-auto"
          >
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPick(s)}
                data-testid={`${testid}-result-${i}`}
                className="w-full text-left px-3 py-2 hover:bg-white/[0.04] flex items-start gap-2 border-b border-white/5 last:border-b-0"
              >
                <MapPin className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs text-white truncate">{s.label}</div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, accent }) {
  const a = {
    amber:   'text-amber-300 border-amber-500/30 bg-amber-500/10',
    sky:     'text-sky-300 border-sky-500/30 bg-sky-500/10',
    emerald: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  }[accent] || 'text-slate-300 border-white/10 bg-white/[0.04]';
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
      <div className={`w-7 h-7 rounded-md border flex items-center justify-center ${a} mb-1.5`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="text-base font-semibold text-white tabular-nums leading-none">{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function HazardCard({ hazard, blocked }) {
  const meta = HAZARD_ICONS[hazard.kind] || { icon: AlertTriangle, color: '#94a3b8', label: hazard.kind };
  const Ic = meta.icon;
  const detail = hazard.max_height_ft ? `Max height: ${hazard.max_height_ft}'`
                 : hazard.max_weight_tons ? `Max weight: ${hazard.max_weight_tons} tons`
                 : hazard.max_width_ft ? `Max width: ${hazard.max_width_ft}'`
                 : hazard.max_length_ft ? `Max length: ${hazard.max_length_ft}'`
                 : 'No commercial trucks';
  return (
    <div
      data-testid={`hazard-${hazard.id}`}
      className={`p-2.5 rounded-lg border ${blocked ? 'bg-rose-500/5 border-rose-500/25' : 'bg-amber-500/5 border-amber-500/20'}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `${meta.color}25`, border: `1px solid ${meta.color}55` }}>
          <Ic className="w-3.5 h-3.5" style={{ color: meta.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: meta.color }}>{meta.label}</div>
            {blocked && (
              <Badge className="bg-rose-500/20 text-rose-200 border-rose-500/30 text-[9px] px-1.5 py-0 uppercase tracking-wider">
                Rerouted Around
              </Badge>
            )}
          </div>
          <div className="text-sm text-white mt-0.5 leading-tight">{hazard.name}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{detail} · {hazard.distance_from_route_mi} mi from route</div>
        </div>
      </div>
    </div>
  );
}
