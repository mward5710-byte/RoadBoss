import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';

/**
 * Driver location hook — uses browser geolocation (no 3rd-party API needed).
 * Pushes the driver's GPS to the backend every PING_INTERVAL_MS while enabled.
 * The driver just needs to grant the browser's "Allow Location?" prompt once.
 *
 * States:
 *   'unsupported'    — browser has no geolocation API
 *   'idle'           — not started
 *   'requesting'     — waiting for permission prompt response
 *   'on'             — actively streaming
 *   'denied'         — user blocked permission
 *   'error'          — gps unavailable / hardware off
 */
const PING_INTERVAL_MS = 30_000;        // 30s
const MIN_MOVE_M = 25;                  // only ping if moved 25m

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat); const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function useDriverLocation({ autoStart = true } = {}) {
  const [status, setStatus] = useState(typeof navigator !== 'undefined' && navigator.geolocation ? 'idle' : 'unsupported');
  const [position, setPosition] = useState(null);   // {lat, lng, accuracy, speed, heading, timestamp}
  const [lastSentAt, setLastSentAt] = useState(null);
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);
  const lastSentPosRef = useRef(null);
  const intervalRef = useRef(null);

  const sendPing = useCallback(async (pos) => {
    try {
      await api.post('/wrecker/drivers/me/location', {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy ?? null,
        speed: pos.speed ?? null,
        heading: pos.heading ?? null,
      });
      lastSentPosRef.current = pos;
      setLastSentAt(new Date());
    } catch (e) { /* silent — driver doesn't need to see network errors */ }
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) { setStatus('unsupported'); return; }
    setStatus('requesting');
    setError(null);
    const onSuccess = (geo) => {
      const p = {
        lat: geo.coords.latitude,
        lng: geo.coords.longitude,
        accuracy: geo.coords.accuracy,
        speed: geo.coords.speed,
        heading: geo.coords.heading,
        timestamp: geo.timestamp,
      };
      setPosition(p);
      setStatus('on');
      // First fix → ping immediately
      if (!lastSentPosRef.current) {
        sendPing(p);
      } else {
        // Otherwise only ping if moved enough
        const moved = distanceMeters(lastSentPosRef.current, p);
        if (moved >= MIN_MOVE_M) sendPing(p);
      }
    };
    const onError = (err) => {
      if (err.code === err.PERMISSION_DENIED) setStatus('denied');
      else setStatus('error');
      setError(err.message);
    };
    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    });
    // Heartbeat: even when not moving, ping every PING_INTERVAL_MS so the dispatcher knows we're alive
    intervalRef.current = setInterval(() => {
      const p = lastSentPosRef.current;
      if (p) sendPing(p);
    }, PING_INTERVAL_MS);
  }, [sendPing]);

  const stop = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (autoStart && status === 'idle') start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, position, lastSentAt, error, start, stop };
}

export default useDriverLocation;
