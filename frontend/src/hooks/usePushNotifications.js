// usePushNotifications — wraps the browser Push Manager + RoadBoss backend push endpoints.
//
// Lifecycle:
//   1. On first use the hook will (lazily) register `/sw.js` (scope '/').
//   2. It fetches the server's VAPID public key from /api/push/config.
//   3. `subscribe()` asks for Notification permission, then creates a PushSubscription
//      and POSTs it to /api/push/subscribe (the backend ties it to the current user).
//   4. `unsubscribe()` removes the subscription locally and tells the backend to forget it.
//   5. `sendTest()` calls /api/push/test which fans out to every device subscribed by the user.
//
// Returns { supported, permission, enabled, subscribed, loading, error, subscribe, unsubscribe, sendTest, refresh }.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof window !== 'undefined' ? window.atob(base64) : '';
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

const SW_URL = '/sw.js';

export function isPushSupported() {
  try {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  } catch {
    return false;
  }
}

async function ensureRegistration() {
  if (!isPushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: '/' });
}

export function usePushNotifications() {
  const supported = isPushSupported();
  const [permission, setPermission] = useState(() =>
    supported && typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [enabled, setEnabled] = useState(false); // server says VAPID is configured
  const [subscribed, setSubscribed] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const vapidKeyRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!supported) return;
    setError(null);
    try {
      const cfg = (await api.get('/push/config')).data;
      setEnabled(!!cfg.enabled);
      vapidKeyRef.current = cfg.public_key || null;
      try {
        const status = (await api.get('/push/status')).data;
        setSubscribed(!!status.subscribed);
        setDeviceCount(status.device_count || 0);
      } catch {}
      if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load push status.');
    }
  }, [supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!supported) {
      setError('This browser does not support push notifications.');
      return { ok: false };
    }
    setLoading(true);
    setError(null);
    try {
      const cfg = enabled && vapidKeyRef.current
        ? { public_key: vapidKeyRef.current }
        : (await api.get('/push/config')).data;
      if (!cfg.public_key) {
        throw new Error('Server has not configured push notifications yet.');
      }
      vapidKeyRef.current = cfg.public_key;

      // 1) Permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setLoading(false);
        setError(perm === 'denied' ? 'Notifications were blocked by the browser.' : 'Permission was not granted.');
        return { ok: false, permission: perm };
      }

      // 2) SW registration
      const reg = await ensureRegistration();
      if (!reg) throw new Error('Service worker registration failed.');
      await navigator.serviceWorker.ready;

      // 3) Subscribe
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(cfg.public_key),
        });
      }

      // 4) Persist server-side
      const json = sub.toJSON();
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: json.keys,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      });

      setSubscribed(true);
      setDeviceCount((c) => Math.max(1, c + 1));
      setLoading(false);
      return { ok: true };
    } catch (e) {
      setLoading(false);
      const msg = e?.response?.data?.detail || e?.message || 'Failed to enable push notifications.';
      setError(msg);
      return { ok: false, error: msg };
    }
  }, [supported, enabled]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return { ok: false };
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        try {
          await sub.unsubscribe();
        } catch {}
        try {
          await api.post('/push/unsubscribe', { endpoint });
        } catch {}
      }
      setSubscribed(false);
      setDeviceCount(0);
      setLoading(false);
      return { ok: true };
    } catch (e) {
      setLoading(false);
      setError(e?.message || 'Failed to disable push notifications.');
      return { ok: false };
    }
  }, [supported]);

  const sendTest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = (await api.post('/push/test', {})).data;
      setLoading(false);
      return { ok: true, ...r };
    } catch (e) {
      setLoading(false);
      const msg = e?.response?.data?.detail || 'Failed to send test push.';
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  return {
    supported,
    permission,
    enabled,
    subscribed,
    deviceCount,
    loading,
    error,
    subscribe,
    unsubscribe,
    sendTest,
    refresh,
  };
}

export default usePushNotifications;
