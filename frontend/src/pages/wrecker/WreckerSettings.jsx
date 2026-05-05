import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CreditCard, CheckCircle2, AlertCircle, ExternalLink, Loader2, Power,
  Building2, MapPin, Shield, Settings as SettingsIcon, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function WreckerSettings() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [squareStatus, setSquareStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  // Handle the OAuth callback bounce-back
  useEffect(() => {
    const sq = params.get('square');
    const msg = params.get('msg');
    if (sq === 'connected') {
      toast.success('Square connected successfully! 🎉');
      // Strip query params
      params.delete('square'); params.delete('msg');
      setParams(params, { replace: true });
    } else if (sq === 'error') {
      toast.error(msg || 'Square connection failed');
      params.delete('square'); params.delete('msg');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const r = await api.get('/wrecker/integrations/square/status');
      setSquareStatus(r.data);
    } catch (e) {
      toast.error('Failed to load payment integration status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const startConnect = async () => {
    setConnecting(true);
    try {
      const r = await api.get('/wrecker/integrations/square/connect');
      // Full redirect so Square's OAuth screen takes over.
      window.location.href = r.data.authorize_url;
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Could not start Square connect flow';
      toast.error(detail);
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post('/wrecker/integrations/square/disconnect');
      toast.success('Square disconnected');
      await loadStatus();
    } catch (e) {
      toast.error('Failed to disconnect Square');
    } finally {
      setDisconnecting(false);
    }
  };

  const changeLocation = async (locationId) => {
    setSavingLocation(true);
    try {
      await api.post('/wrecker/integrations/square/location', { location_id: locationId });
      toast.success('Active billing location updated');
      await loadStatus();
    } catch (e) {
      toast.error('Failed to update location');
    } finally {
      setSavingLocation(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
        </div>
      </div>
    );
  }

  const connected = !!squareStatus?.connected;
  const configured = !!squareStatus?.configured;
  const env = squareStatus?.environment || 'sandbox';

  return (
    <div className="p-6 max-w-5xl mx-auto" data-testid="wrecker-settings-page">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-500 mb-1">
          <SettingsIcon className="w-3.5 h-3.5" />
          Settings
        </div>
        <h1 className="text-2xl font-bold text-white">Integrations & Payments</h1>
        <p className="text-sm text-slate-400 mt-1">
          Connect your business accounts so Wreckerlogix can process payments, send receipts, and route money straight to your bank.
        </p>
      </div>

      {/* Square Card */}
      <Card data-testid="square-integration-card" className="bg-[#0d1218] border-white/5 p-0 overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-md">
            {/* Square mark — clean SVG, no external dependency */}
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-black" fill="currentColor" aria-hidden="true">
              <path d="M5.4 2A3.4 3.4 0 0 0 2 5.4v13.2A3.4 3.4 0 0 0 5.4 22h13.2A3.4 3.4 0 0 0 22 18.6V5.4A3.4 3.4 0 0 0 18.6 2H5.4Zm.6 4h12c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1Zm3 3v6h6V9H9Z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-white">Square — Card Processing</h2>
              {connected ? (
                <Badge data-testid="square-status-badge" className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                </Badge>
              ) : (
                <Badge data-testid="square-status-badge" variant="outline" className="border-slate-600 text-slate-400">
                  Not connected
                </Badge>
              )}
              {env === 'sandbox' ? (
                <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] uppercase tracking-wider">
                  Sandbox / Test mode
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px] uppercase tracking-wider">
                  Production / Live
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Take credit card, Apple Pay, and Google Pay payments. Funds land in <span className="text-white">your</span> Square account, not Wreckerlogix.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {!configured && (
            <div data-testid="square-not-configured" className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-amber-200">Square Developer App not configured on this server</div>
                <div className="text-amber-200/80 mt-1">
                  The Wreckerlogix admin needs to set <code className="text-xs bg-black/40 px-1 py-0.5 rounded">SQUARE_OAUTH_APPLICATION_ID</code> and <code className="text-xs bg-black/40 px-1 py-0.5 rounded">SQUARE_OAUTH_APPLICATION_SECRET</code> in the backend environment before tow companies can connect.
                </div>
              </div>
            </div>
          )}

          {configured && !connected && (
            <div data-testid="square-connect-section" className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Feature icon={Shield} title="PCI-Compliant" desc="Card data never touches Wreckerlogix servers — Square tokenizes everything." />
                <Feature icon={Building2} title="Your Bank" desc="Money lands directly in the Square account you connect." />
                <Feature icon={CreditCard} title="All Card Brands" desc="Visa, Mastercard, Amex, Discover, Apple Pay, Google Pay." />
                <Feature icon={ExternalLink} title="Payment Links" desc="Send the customer an SMS / email with a tap-to-pay link." />
              </div>
              <Button
                data-testid="square-connect-btn"
                onClick={startConnect}
                disabled={connecting}
                className="w-full sm:w-auto bg-white hover:bg-slate-100 text-black font-semibold h-11 px-6"
              >
                {connecting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting to Square…</>
                ) : (
                  <><svg viewBox="0 0 24 24" className="w-4 h-4 mr-2" fill="currentColor"><path d="M5.4 2A3.4 3.4 0 0 0 2 5.4v13.2A3.4 3.4 0 0 0 5.4 22h13.2A3.4 3.4 0 0 0 22 18.6V5.4A3.4 3.4 0 0 0 18.6 2H5.4Zm.6 4h12c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1Zm3 3v6h6V9H9Z" /></svg>Connect with Square</>
                )}
              </Button>
              <p className="text-[11px] text-slate-500">
                You will be redirected to Square to log in and authorize Wreckerlogix. We never see your password.
              </p>
            </div>
          )}

          {connected && (
            <div data-testid="square-connected-section" className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <DetailRow icon={Building2} label="Merchant" value={squareStatus.merchant_name || squareStatus.merchant_id || '—'} />
                <DetailRow icon={MapPin} label="Active Location" value={squareStatus.location_name || squareStatus.location_id || '—'} />
                <DetailRow icon={Shield} label="Environment" value={env === 'production' ? 'Production (live)' : 'Sandbox (test mode)'} />
                <DetailRow icon={CheckCircle2} label="Connected" value={squareStatus.connected_at ? new Date(squareStatus.connected_at).toLocaleString() : '—'} />
              </div>

              {/* Location switcher */}
              {(squareStatus.available_locations?.length > 1) && (
                <div className="pt-2">
                  <label className="text-[11px] uppercase tracking-widest text-slate-500 mb-1.5 block">Billing Location</label>
                  <Select value={squareStatus.location_id || ''} onValueChange={changeLocation} disabled={savingLocation}>
                    <SelectTrigger data-testid="square-location-select" className="w-full sm:w-80 bg-[#0a0e14] border-white/10 text-white">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {squareStatus.available_locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id} data-testid={`square-location-${loc.id}`}>
                          {loc.name} {loc.address ? `· ${loc.address}` : ''} {loc.status !== 'ACTIVE' ? `(${loc.status})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500 mt-1.5">All charges through Wreckerlogix will bill to this location.</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                <Button data-testid="square-refresh-btn" variant="outline" size="sm" onClick={loadStatus} className="border-white/10 text-slate-300 hover:bg-white/5">
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button data-testid="square-disconnect-btn" variant="outline" size="sm" className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10">
                      <Power className="w-3.5 h-3.5 mr-1.5" /> Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-[#0d1218] border-white/10 text-white">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Square?</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-400">
                        Wreckerlogix will no longer be able to charge cards or send payment links until you reconnect. Existing receipts and payment history are kept.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="square-disconnect-cancel" className="bg-transparent border-white/10 text-slate-300 hover:bg-white/5">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        data-testid="square-disconnect-confirm"
                        onClick={disconnect}
                        disabled={disconnecting}
                        className="bg-rose-500 hover:bg-rose-600 text-white"
                      >
                        {disconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Yes, disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Future integrations stub */}
      <Card className="bg-[#0d1218] border-white/5 p-5 mt-4 opacity-70" data-testid="future-integrations-stub">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <SettingsIcon className="w-4 h-4" />
          More integrations coming soon — Mapbox routing, Stripe (subscription billing), CB Talker network.
        </div>
      </Card>
    </div>
  );
}

const Feature = ({ icon: Icon, title, desc }) => (
  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.02] border border-white/5">
    <Icon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
    <div className="min-w-0">
      <div className="text-sm font-medium text-white">{title}</div>
      <div className="text-[12px] text-slate-400 leading-snug mt-0.5">{desc}</div>
    </div>
  </div>
);

const DetailRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.02] border border-white/5">
    <Icon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
    <div className="min-w-0 flex-1">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-sm text-white truncate mt-0.5">{value}</div>
    </div>
  </div>
);
