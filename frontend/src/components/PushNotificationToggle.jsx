// PushNotificationToggle — reusable card for enabling/disabling + testing Web Push.
// Mounted inside Driver Settings and the Admin Notifications page.
import React from 'react';
import { BellRing, BellOff, Zap, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import usePushNotifications from '@/hooks/usePushNotifications';

export default function PushNotificationToggle({ variant = 'driver' }) {
  const push = usePushNotifications();

  if (!push.supported) {
    return (
      <div
        data-testid="push-unsupported"
        className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200"
      >
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" /> Push notifications unavailable
        </div>
        <p className="mt-1 text-xs text-amber-200/80">
          This browser doesn&apos;t support Web Push. Install RoadBoss to your home screen (iOS 16.4+)
          or use Chrome/Edge/Firefox on desktop.
        </p>
      </div>
    );
  }

  if (!push.enabled) {
    return (
      <div
        data-testid="push-not-configured"
        className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4 text-sm text-slate-300"
      >
        <div className="flex items-center gap-2 font-semibold">
          <BellOff className="h-4 w-4" /> Push not configured on the server
        </div>
        <p className="mt-1 text-xs text-slate-400">Ask an admin to set VAPID keys.</p>
      </div>
    );
  }

  const handleToggle = async () => {
    if (push.subscribed) {
      const res = await push.unsubscribe();
      if (res.ok) toast.success('Push notifications disabled on this device');
      else toast.error(res.error || 'Failed to disable');
      return;
    }
    const res = await push.subscribe();
    if (res.ok) {
      toast.success('Push notifications enabled');
    } else if (res.permission === 'denied') {
      toast.error('Notifications are blocked. Allow them in your browser settings to enable push.');
    } else {
      toast.error(res.error || 'Could not enable push notifications');
    }
  };

  const handleTest = async () => {
    const res = await push.sendTest();
    if (res.ok) {
      toast.success(
        res.delivered
          ? `Test push delivered to ${res.delivered} device${res.delivered === 1 ? '' : 's'}`
          : 'Test push attempted (no active devices found)'
      );
    } else {
      toast.error(res.error || 'Failed to send test push');
    }
  };

  const accent = variant === 'admin' ? 'text-amber-300' : 'text-emerald-300';
  const badgeColor = push.subscribed
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : 'bg-slate-500/15 text-slate-300 border-slate-500/30';

  return (
    <div
      data-testid="push-toggle-card"
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <BellRing className={`h-5 w-5 ${accent}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-white">Push notifications</div>
            <span
              data-testid="push-status-badge"
              className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${badgeColor}`}
            >
              {push.subscribed ? `On · ${push.deviceCount || 1} device${(push.deviceCount || 1) === 1 ? '' : 's'}` : 'Off'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {variant === 'admin'
              ? 'Crash alerts, roadside dispatch, and inbound driver replies — delivered even when this tab is closed.'
              : 'Get dispatch messages and safety alerts even when the app is closed. Free — no SMS needed.'}
          </p>
          {push.permission === 'denied' ? (
            <p
              data-testid="push-permission-denied"
              className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-200"
            >
              Browser blocked notifications. Open site settings and allow notifications, then try again.
            </p>
          ) : null}
          {push.error ? (
            <p
              data-testid="push-error"
              className="mt-2 rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-200"
            >
              {push.error}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleToggle}
          disabled={push.loading}
          data-testid="push-toggle-button"
          className={
            push.subscribed
              ? 'bg-slate-800 text-slate-100 hover:bg-slate-700'
              : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
          }
        >
          {push.loading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : push.subscribed ? (
            <BellOff className="mr-1.5 h-4 w-4" />
          ) : (
            <BellRing className="mr-1.5 h-4 w-4" />
          )}
          {push.subscribed ? 'Turn off push' : 'Enable push'}
        </Button>
        {push.subscribed ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={push.loading}
            data-testid="push-test-button"
            className="border-white/10 bg-transparent text-slate-200 hover:bg-white/5"
          >
            <Zap className="mr-1.5 h-4 w-4 text-amber-300" /> Send test push
          </Button>
        ) : null}
      </div>
    </div>
  );
}
