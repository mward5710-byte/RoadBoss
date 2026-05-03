// MapboxMap \u2014 reusable Mapbox GL JS wrapper for RoadBoss.
// Used by fleet overview, trip detail, crash event detail, roadside detail, etc.
//
// Props:
//   markers       \u2014 [{id, lng, lat, color, label, popupHtml, onClick}]
//   route         \u2014 GeoJSON LineString | null  (renders the route polyline)
//   center        \u2014 [lng, lat] (defaults: continental US center)
//   zoom          \u2014 number (defaults: 4)
//   height        \u2014 number | string (defaults: 420)
//   style         \u2014 'dark' | 'streets' | 'satellite' (default 'dark')
//   showTraffic   \u2014 boolean (overlay live traffic layer; default false)
//   fitBounds     \u2014 boolean (auto-fit to markers + route; default true)
//   onLoad        \u2014 (map) => void
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { api } from '@/lib/api';

const STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  streets: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

let _tokenPromise = null;
function getMapboxToken() {
  if (!_tokenPromise) {
    _tokenPromise = api.get('/mapbox/config').then((r) => r.data?.token || '');
  }
  return _tokenPromise;
}

export function MapboxMap({
  markers = [],
  route = null,
  center = [-98.5, 39.5],
  zoom = 4,
  height = 420,
  style = 'dark',
  showTraffic = false,
  fitBounds = true,
  onLoad,
  className = '',
  testId = 'mapbox-map',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerObjsRef = useRef([]);
  const [tokenReady, setTokenReady] = useState(Boolean(mapboxgl.accessToken));
  const [error, setError] = useState(null);

  // Acquire token from backend once
  useEffect(() => {
    let cancelled = false;
    if (mapboxgl.accessToken) { setTokenReady(true); return; }
    getMapboxToken().then((tok) => {
      if (cancelled) return;
      if (!tok) { setError('Mapbox not configured'); return; }
      mapboxgl.accessToken = tok;
      setTokenReady(true);
    }).catch(() => { if (!cancelled) setError('Could not load Mapbox config'); });
    return () => { cancelled = true; };
  }, []);

  // Initialize map once
  useEffect(() => {
    if (!tokenReady || !containerRef.current || mapRef.current) return;
    try {
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLES[style] || STYLES.dark,
        center,
        zoom,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
      map.on('load', () => {
        if (showTraffic) {
          map.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
          map.addLayer({
            id: 'traffic',
            source: 'mapbox-traffic',
            'source-layer': 'traffic',
            type: 'line',
            paint: {
              'line-width': 2,
              'line-color': ['match', ['get', 'congestion'],
                'low', '#10b981', 'moderate', '#f59e0b', 'heavy', '#f97316', 'severe', '#ef4444', '#94a3b8'],
            },
          });
        }
        if (onLoad) try { onLoad(map); } catch {}
      });
      mapRef.current = map;
    } catch (e) {
      setError(String(e.message || e));
    }
    return () => {
      try {
        markerObjsRef.current.forEach((m) => m.remove());
        markerObjsRef.current = [];
        mapRef.current?.remove();
        mapRef.current = null;
      } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenReady]);

  // Sync markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      markerObjsRef.current.forEach((m) => m.remove());
      markerObjsRef.current = [];
      (markers || []).forEach((m) => {
        if (m.lng == null || m.lat == null) return;
        const el = document.createElement('div');
        el.style.cssText = `position:relative;width:22px;height:22px;cursor:pointer;`;
        const color = m.color || '#38bdf8';
        el.innerHTML = `
          <div style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:0.32;animation:hp-pulse 1.6s ease-in-out infinite"></div>
          <div style="position:absolute;inset:5px;border-radius:9999px;background:${color};box-shadow:0 0 12px ${color};border:1.5px solid rgba(255,255,255,0.4)"></div>
        `;
        if (m.onClick) el.addEventListener('click', m.onClick);
        const marker = new mapboxgl.Marker(el).setLngLat([m.lng, m.lat]);
        if (m.popupHtml || m.label) {
          const popup = new mapboxgl.Popup({ offset: 14, closeButton: false, className: 'roadboss-popup' })
            .setHTML(m.popupHtml || `<div style="padding:6px 10px;color:#0a0e14;font-size:12px;font-weight:600">${m.label}</div>`);
          marker.setPopup(popup);
        }
        marker.addTo(map);
        markerObjsRef.current.push(marker);
      });
      // Auto-fit bounds if requested
      if (fitBounds && (markers?.length || route)) {
        try {
          const bounds = new mapboxgl.LngLatBounds();
          (markers || []).forEach((m) => { if (m.lng != null && m.lat != null) bounds.extend([m.lng, m.lat]); });
          if (route?.coordinates) route.coordinates.forEach((c) => bounds.extend(c));
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 600 });
        } catch {}
      }
    };
    if (map.loaded()) apply(); else map.once('load', apply);
  }, [markers, fitBounds, route]);

  // Sync route
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const sourceId = 'rb-route';
      if (map.getLayer('rb-route-line')) map.removeLayer('rb-route-line');
      if (map.getLayer('rb-route-glow')) map.removeLayer('rb-route-glow');
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      if (route && route.coordinates && route.coordinates.length >= 2) {
        map.addSource(sourceId, { type: 'geojson', data: { type: 'Feature', geometry: route, properties: {} } });
        map.addLayer({
          id: 'rb-route-glow', type: 'line', source: sourceId,
          paint: { 'line-color': '#38bdf8', 'line-width': 8, 'line-opacity': 0.18, 'line-blur': 3 },
        });
        map.addLayer({
          id: 'rb-route-line', type: 'line', source: sourceId,
          paint: { 'line-color': '#38bdf8', 'line-width': 4, 'line-opacity': 0.95 },
        });
      }
    };
    if (map.loaded()) apply(); else map.once('load', apply);
  }, [route]);

  if (error) {
    return (
      <div className={`rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 text-sm ${className}`} style={{ height }} data-testid={`${testId}-error`}>
        Map unavailable: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`rounded-xl overflow-hidden border border-white/5 hp-panel ${className}`}
      style={{ height, width: '100%' }}
      data-testid={testId}
    />
  );
}

// Helper: fetch a truck-aware driving route from Mapbox Directions API.
// Note: Mapbox's standard `driving-traffic` profile is used. True truck dimension routing
// (avoid bridges < height, weight-restricted roads) is in their Optimization v2 / Truck SDK
// tier \u2014 marked here for upgrade.
export async function fetchTruckRoute({ origin, destination, profile = 'driving-traffic' }) {
  if (!mapboxgl.accessToken) {
    const tok = await getMapboxToken();
    if (!tok) throw new Error('Mapbox token missing');
    mapboxgl.accessToken = tok;
  }
  const coords = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?geometries=geojson&overview=full&steps=true&annotations=duration,distance,congestion&access_token=${mapboxgl.accessToken}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Mapbox directions HTTP ${r.status}`);
  const j = await r.json();
  if (!j.routes || !j.routes.length) throw new Error('No route found');
  const route = j.routes[0];
  return {
    geometry: route.geometry,
    distance_meters: route.distance,
    duration_seconds: route.duration,
    distance_miles: route.distance / 1609.34,
    duration_minutes: route.duration / 60,
    legs: route.legs,
  };
}

// Helper: forward geocode (address \u2192 lng,lat)
export async function geocodeAddress(query) {
  if (!query) return null;
  if (!mapboxgl.accessToken) {
    const tok = await getMapboxToken();
    if (!tok) throw new Error('Mapbox token missing');
    mapboxgl.accessToken = tok;
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=us&limit=1&access_token=${mapboxgl.accessToken}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const feat = j.features?.[0];
  return feat ? { lng: feat.center[0], lat: feat.center[1], place_name: feat.place_name } : null;
}
