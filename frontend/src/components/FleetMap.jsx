import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { dutyColor } from '@/lib/utils';

// Custom divIcon for drivers
function driverIcon(color) {
  return L.divIcon({
    className: 'hp-driver-icon',
    html: `<div style="position:relative;width:24px;height:24px">
      <div style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:0.35;animation:hp-pulse 1.6s ease-in-out infinite"></div>
      <div style="position:absolute;inset:6px;border-radius:9999px;background:${color};box-shadow:0 0 12px ${color}"></div>
    </div>`,
    iconSize: [24, 24], iconAnchor: [12, 12],
  });
}

const statusColorMap = {
  driving: '#38bdf8', on_duty: '#f59e0b', off_duty: '#94a3b8', sleeper: '#a855f7',
};

export default function FleetMap({ drivers = [], height = 420 }) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/5 hp-panel" style={{ height }}>
      <MapContainer center={[37.5, -95]} zoom={4} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {drivers.map((d) => (
          <Marker key={d.id} position={[d.lat || 39.5, d.lng || -98.5]} icon={driverIcon(statusColorMap[d.status] || '#38bdf8')}>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 600, color: '#0a0e14' }}>{d.name}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>{d.home_terminal || '—'}</div>
                <div style={{ fontSize: 12, marginTop: 6, color: '#0f172a' }}>
                  Status: <strong>{(dutyColor[d.status]?.label) || d.status}</strong>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
