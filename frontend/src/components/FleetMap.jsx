import React, { useMemo } from 'react';
import { MapboxMap } from '@/components/MapboxMap';
import { dutyColor } from '@/lib/utils';

const statusColorMap = {
  driving: '#38bdf8', on_duty: '#f59e0b', off_duty: '#94a3b8', sleeper: '#a855f7',
};

export default function FleetMap({ drivers = [], height = 420, showTraffic = true }) {
  const markers = useMemo(() => (drivers || []).map((d) => ({
    id: d.id,
    lng: d.lng,
    lat: d.lat,
    color: statusColorMap[d.status] || '#38bdf8',
    label: d.name,
    popupHtml: `
      <div style="padding:8px 12px;color:#0a0e14;min-width:160px">
        <div style="font-weight:700;font-size:13px">${d.name || ''}</div>
        <div style="font-size:10px;color:#475569;margin-top:1px">${d.home_terminal || ''}</div>
        <div style="font-size:11px;margin-top:6px;color:#0f172a">
          Status: <strong>${(dutyColor[d.status]?.label) || d.status || 'unknown'}</strong>
        </div>
      </div>
    `,
  })).filter((m) => m.lng != null && m.lat != null), [drivers]);

  return (
    <MapboxMap
      markers={markers}
      height={height}
      style="dark"
      showTraffic={showTraffic}
      fitBounds={markers.length > 0}
      center={[-98.5, 39.5]}
      zoom={4}
      testId="fleet-map"
    />
  );
}
