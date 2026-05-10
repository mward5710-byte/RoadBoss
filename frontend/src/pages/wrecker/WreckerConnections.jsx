import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CreditCard, CheckCircle2, AlertCircle, ExternalLink, Loader2, Power,
  Building2, MapPin, Shield, Plug, RefreshCw, Save, Briefcase, Phone, Mail, Hash, Percent, DollarSign as DollarIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function BusinessProfileCard() {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/wrecker/settings/business-profile');
      setProfile(r.data);
    } catch (e) {
      toast.error('Failed to load business profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put('/wrecker/settings/business-profile', profile);
      setProfile(r.data);
      toast.success('Business profile saved. This is what customers will see on receipts.');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const f = (k, v) => setProfile((p) => ({ ...(p || {}), [k]: v }));

  if (loading) {
    return (
      <Card className="bg-[#0d1218] border-white/5 p-5 mb-4">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading business profile…
        </div>
      </Card>
    );
  }

  return (
    <Card data-testid="business-profile-card" className="bg-[#0d1218] border-white/5 p-0 overflow-hidden mb-4">
      <div className="p-5 border-b border-white/5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white">Business Profile</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              This is the company info customers see on receipts, payment links, and damage forms. Edit it once — it propagates everywhere.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Identity */}
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Identity</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Legal Company Name" testid="bp-company-name">
              <Input value={profile?.company_name || ''} onChange={(e) => f('company_name', e.target.value)}
                     placeholder="Apex Epoxy & Flooring LLC" data-testid="bp-input-company-name" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
            <Field label="Operating As (DBA)" testid="bp-dba">
              <Input value={profile?.dba_name || ''} onChange={(e) => f('dba_name', e.target.value)}
                     placeholder="Wreckerlogix" data-testid="bp-input-dba" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
            <Field label="Owner / Primary Contact" testid="bp-owner">
              <Input value={profile?.owner_name || ''} onChange={(e) => f('owner_name', e.target.value)}
                     placeholder="Michael Ward" data-testid="bp-input-owner" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
            <Field label="State License / DOT #" testid="bp-license">
              <Input value={profile?.license_number || ''} onChange={(e) => f('license_number', e.target.value)}
                     placeholder="optional" data-testid="bp-input-license" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
          </div>
        </div>

        {/* Contact */}
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Contact (used on receipts &amp; SMS)</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Phone" icon={Phone} testid="bp-phone">
              <Input value={profile?.phone || ''} onChange={(e) => f('phone', e.target.value)}
                     placeholder="(765) 555-0100" data-testid="bp-input-phone" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
            <Field label="Email" icon={Mail} testid="bp-email">
              <Input type="email" value={profile?.email || ''} onChange={(e) => f('email', e.target.value)}
                     placeholder="dispatch@yourcompany.com" data-testid="bp-input-email" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
            <Field label="Website (optional)" testid="bp-website" full>
              <Input value={profile?.website || ''} onChange={(e) => f('website', e.target.value)}
                     placeholder="https://wrecker-logix.com" data-testid="bp-input-website" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
          </div>
        </div>

        {/* Address */}
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Address &amp; Storage Yard</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Street Address" testid="bp-street" full>
              <Input value={profile?.street || ''} onChange={(e) => f('street', e.target.value)}
                     placeholder="1200 W Markland Ave" data-testid="bp-input-street" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
            <Field label="City" testid="bp-city">
              <Input value={profile?.city || ''} onChange={(e) => f('city', e.target.value)}
                     placeholder="Kokomo" data-testid="bp-input-city" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State" testid="bp-state">
                <Input value={profile?.state || ''} onChange={(e) => f('state', e.target.value.toUpperCase().slice(0, 2))}
                       placeholder="IN" maxLength={2} data-testid="bp-input-state" className="bg-[#0a0e14] border-white/10 text-white" />
              </Field>
              <Field label="ZIP" testid="bp-zip">
                <Input value={profile?.zip_code || ''} onChange={(e) => f('zip_code', e.target.value)}
                       placeholder="46901" data-testid="bp-input-zip" className="bg-[#0a0e14] border-white/10 text-white" />
              </Field>
            </div>
            <Field label="Storage Yard Address (if different)" testid="bp-yard" full>
              <Input value={profile?.storage_yard_address || ''} onChange={(e) => f('storage_yard_address', e.target.value)}
                     placeholder="Where impounded vehicles are kept (optional)" data-testid="bp-input-yard" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
          </div>
        </div>

        {/* Rates */}
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Default Rates &amp; Hours</div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Daily Impound Rate" icon={DollarIcon} testid="bp-rate">
              <Input type="number" step="0.01" value={profile?.daily_impound_rate ?? 50}
                     onChange={(e) => f('daily_impound_rate', parseFloat(e.target.value) || 0)}
                     data-testid="bp-input-rate" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
            <Field label="Sales Tax %" icon={Percent} testid="bp-tax">
              <Input type="number" step="0.01" value={profile?.tax_rate_pct ?? 7}
                     onChange={(e) => f('tax_rate_pct', parseFloat(e.target.value) || 0)}
                     data-testid="bp-input-tax" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
            <Field label="Hours of Operation" testid="bp-hours">
              <Input value={profile?.hours_of_operation || ''} onChange={(e) => f('hours_of_operation', e.target.value)}
                     placeholder="24/7 or M-F 8a-6p" data-testid="bp-input-hours" className="bg-[#0a0e14] border-white/10 text-white" />
            </Field>
          </div>
        </div>

        <div className="pt-2 border-t border-white/5 flex items-center justify-between flex-wrap gap-2">
          <div className="text-[11px] text-slate-500">Changes save immediately and apply to all new receipts &amp; payment links.</div>
          <Button data-testid="bp-save-btn" onClick={save} disabled={saving} className="bg-amber-500 text-black hover:bg-amber-400 font-semibold">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-2" /> Save Profile</>}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, icon: Icon, children, testid, full }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''} data-testid={testid}>
      <Label className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3 text-slate-500" />} {label}
      </Label>
      {children}
    </div>
  );
}

export default function WreckerConnections() {
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
    <div className="p-6 max-w-5xl mx-auto" data-testid="wrecker-connections-page">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-500 mb-1">
          <Plug className="w-3.5 h-3.5" />
          Connections
        </div>
        <h1 className="text-2xl font-bold text-white">Connections & Integrations</h1>
        <p className="text-sm text-slate-400 mt-1">
          Connect your business accounts so WreckerLogix can process payments, send receipts, and route money straight to your bank. Personal app preferences live in <strong className="text-slate-300">Settings</strong>.
        </p>
      </div>

      {/* Business Profile (above Integrations) */}
      <BusinessProfileCard />

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

      {/* Pending integrations — paste API key when you're ready. Stored
          per-tenant under tenant_integrations. Disabled until backend
          OAuth/API-key plumbing is wired (Mike will add keys when he's
          got them). */}
      <PendingIntegrationCard
        testid="integration-fuelcloud"
        provider="fuelcloud"
        name="FuelCloud"
        tagline="Fuel-site dispenser data + driver fuel cards"
        description="Pulls dispense events, fuel costs, and driver-card activity from your FuelCloud sites into the Fuel page automatically."
        keyName="fuelcloud_api_key"
        keyPlaceholder="fc_live_xxxxxxxxxxxxxxxxxx"
        helpUrl="https://fuelcloud.com/api"
        accent="amber"
      />
      <PendingIntegrationCard
        testid="integration-twilio"
        provider="twilio"
        name="Twilio SMS"
        tagline="Send payment links + status texts to customers"
        description="When a job is dispatched or a receipt is ready, the customer gets an SMS with the link. Requires an Account SID + Auth Token + From-number."
        keyName="twilio_account_sid"
        keyPlaceholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        helpUrl="https://www.twilio.com/console"
        accent="rose"
      />
      <PendingIntegrationCard
        testid="integration-quickbooks"
        provider="quickbooks"
        name="QuickBooks Online"
        tagline="Push invoices + payments to your books"
        description="Auto-create invoices in QuickBooks when a job closes. Posts payments + tax. Paste your QuickBooks Realm ID here for now — full OAuth connect flow ships next session."
        keyName="quickbooks_realm_id"
        keyPlaceholder="Realm ID (Company ID) — long numeric string"
        helpUrl="https://developer.intuit.com/app/developer/qbo/docs/get-started"
        accent="emerald"
      />
      <PendingIntegrationCard
        testid="integration-mapbox"
        name="Mapbox"
        tagline="Live mileage + routing"
        description="Live wired in your backend env (server-side). Auto-calculates loaded + dead-head miles for every job. No key needed here."
        keyName="mapbox_token"
        keyPlaceholder="Already configured server-side"
        helpUrl="https://account.mapbox.com/"
        accent="sky"
        readOnly
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * PendingIntegrationCard
 *
 * Generic card for integrations that just need an API key/secret pasted
 * by Mike once. Each card writes to /api/wrecker/integrations/{name}/key
 * (POST). Backend is forgiving — if the route doesn't exist yet it
 * returns 404 and the toast surfaces it cleanly so we know what to
 * implement next. This UI is the SAME for every future integration so
 * Mike can tell at a glance what's wired vs pending.
 * ───────────────────────────────────────────────────────────────────── */
function PendingIntegrationCard({ testid, name, tagline, description, keyName, keyPlaceholder, helpUrl, accent = 'amber', readOnly = false, provider }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ connected: false, preview: null, saved_at: null });

  // Resolve which backend provider key this card hits. Caller can pass
  // `provider` explicitly; otherwise we derive it from keyName so the
  // card stays declarative.
  const providerKey = (provider || (keyName ? keyName.split('_')[0] : '')).toLowerCase();

  const tints = {
    amber: { dot: 'bg-amber-500/20 border-amber-500/30', icon: 'text-amber-300', btn: 'bg-amber-500 text-slate-950 hover:bg-amber-400' },
    rose: { dot: 'bg-rose-500/20 border-rose-500/30', icon: 'text-rose-300', btn: 'bg-rose-500 text-white hover:bg-rose-400' },
    emerald: { dot: 'bg-emerald-500/20 border-emerald-500/30', icon: 'text-emerald-300', btn: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' },
    sky: { dot: 'bg-sky-500/20 border-sky-500/30', icon: 'text-sky-300', btn: 'bg-sky-500 text-slate-950 hover:bg-sky-400' },
  }[accent] || { dot: 'bg-amber-500/20 border-amber-500/30', icon: 'text-amber-300', btn: 'bg-amber-500 text-slate-950 hover:bg-amber-400' };

  // Load existing status on mount so the badge reflects reality after a refresh.
  useEffect(() => {
    if (readOnly || !providerKey) { setLoading(false); return; }
    let cancelled = false;
    api.get(`/wrecker/integrations/${providerKey}/key`)
      .then((r) => { if (!cancelled && r?.data) setStatus(r.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [providerKey, readOnly]);

  const save = async () => {
    if (readOnly) return;
    if (!value.trim()) { toast.error(`Paste your ${name} key first.`); return; }
    setSaving(true);
    try {
      const r = await api.post(`/wrecker/integrations/${providerKey}/key`, {
        key_name: keyName, value,
      });
      toast.success(`${name} key saved.`);
      setStatus({
        connected: true,
        preview: r?.data?.preview || null,
        saved_at: r?.data?.saved_at || new Date().toISOString(),
      });
      setValue('');
    } catch (e) {
      const status_code = e?.response?.status;
      if (status_code === 404) {
        toast.info(`${name} provider not yet supported by this backend.`);
      } else {
        toast.error(e?.response?.data?.detail || `Failed to save ${name} key.`);
      }
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (readOnly || !status.connected) return;
    if (!window.confirm(`Disconnect ${name}? You'll need to paste the key again to reconnect.`)) return;
    try {
      await api.delete(`/wrecker/integrations/${providerKey}/key`);
      toast.success(`${name} disconnected.`);
      setStatus({ connected: false, preview: null, saved_at: null });
    } catch (e) {
      toast.error(`Failed to disconnect ${name}.`);
    }
  };

  return (
    <Card data-testid={testid} className="bg-[#0d1218] border-white/5 overflow-hidden mt-4">
      <div className="p-5 border-b border-white/5">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${tints.dot}`}>
            <Plug className={`w-5 h-5 ${tints.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-white">{name}</h2>
              {readOnly && <Badge className="bg-emerald-500/15 border-emerald-500/30 text-emerald-300 text-[10px]">Live</Badge>}
              {!readOnly && status.connected && <Badge className="bg-emerald-500/15 border-emerald-500/30 text-emerald-300 text-[10px]" data-testid={`${testid}-connected`}>Connected</Badge>}
              {!readOnly && !status.connected && !loading && <Badge className="bg-slate-500/15 border-slate-500/30 text-slate-300 text-[10px]">Pending</Badge>}
              {loading && <Badge className="bg-slate-500/15 border-slate-500/30 text-slate-400 text-[10px]">Loading…</Badge>}
            </div>
            <p className="text-[12px] text-slate-400 mt-0.5">{tagline}</p>
            {status.connected && status.preview && (
              <p className="text-[11px] text-emerald-300/80 mt-1 font-mono" data-testid={`${testid}-preview`}>
                Saved key: {status.preview}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-sm text-slate-300 leading-relaxed">{description}</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[260px]">
            <Label className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">
              {status.connected ? 'Replace API Key / Token' : 'API Key / Token'}
            </Label>
            <Input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={keyPlaceholder}
              disabled={readOnly}
              className="bg-[#07090d] border-white/10 text-white font-mono text-xs h-9"
              data-testid={`${testid}-input`}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={readOnly || saving}
            onClick={save}
            className={`${tints.btn} font-semibold`}
            data-testid={`${testid}-save`}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            {readOnly ? 'Configured' : status.connected ? 'Update' : 'Save key'}
          </Button>
          {status.connected && !readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={disconnect}
              className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
              data-testid={`${testid}-disconnect`}
            >
              <Power className="w-3.5 h-3.5 mr-1" /> Disconnect
            </Button>
          )}
          <a
            href={helpUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-400 hover:text-amber-300 inline-flex items-center gap-1 px-2 py-2"
            data-testid={`${testid}-help`}
          >
            Get key <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </Card>
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
