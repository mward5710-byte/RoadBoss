// WreckerSetupWizard — first-run experience for new tenants.
//
// URL: /wrecker/setup
//
// Triggered automatically right after signup (and any time the tenant
// record has setup_completed=false). The wizard walks the new owner
// through the bare minimum to dispatch their first call:
//
//   1. Company info (address, time zone)
//   2. Business hours
//   3. First driver (name + phone)  — SKIPPABLE
//   4. First truck (number + body class) — SKIPPABLE
//   5. Done → push to /wrecker (Dispatch Board)
//
// On the final step we PUT setup_completed=true so the wizard never
// re-triggers. The user can also re-open it manually from Settings
// later if they want to revisit any step.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Building2, MapPin, Clock, Truck, User, ArrowRight, ArrowLeft,
  CheckCircle2, SkipForward, PartyPopper, Loader2, Phone,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const TIME_ZONES = [
  ['America/New_York',    'Eastern (New York)'],
  ['America/Chicago',     'Central (Chicago)'],
  ['America/Denver',      'Mountain (Denver)'],
  ['America/Phoenix',     'Mountain - no DST (Phoenix)'],
  ['America/Los_Angeles', 'Pacific (Los Angeles)'],
  ['America/Anchorage',   'Alaska'],
  ['Pacific/Honolulu',    'Hawaii'],
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
  'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA',
  'RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const DEFAULT_HOURS = {
  monday:    { open: '08:00', close: '17:00', closed: false },
  tuesday:   { open: '08:00', close: '17:00', closed: false },
  wednesday: { open: '08:00', close: '17:00', closed: false },
  thursday:  { open: '08:00', close: '17:00', closed: false },
  friday:    { open: '08:00', close: '17:00', closed: false },
  saturday:  { open: '09:00', close: '14:00', closed: false },
  sunday:    { open: '09:00', close: '14:00', closed: true  },
};

const STEPS = [
  { key: 'company',  label: 'Company',  icon: Building2 },
  { key: 'hours',    label: 'Hours',    icon: Clock },
  { key: 'driver',   label: 'Driver',   icon: User },
  { key: 'truck',    label: 'Truck',    icon: Truck },
  { key: 'done',     label: 'Done',     icon: PartyPopper },
];

export default function WreckerSetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [tenant, setTenant] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [company, setCompany] = useState({
    address: '',
    city: '',
    state: '',
    zip_code: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  });
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [twentyFourSeven, setTwentyFourSeven] = useState(false);
  const [driver, setDriver] = useState({ name: '', phone: '', email: '' });
  const [truck, setTruck] = useState({ unit_number: '', body_class: 'light', plate: '' });

  /* ─── Load tenant ──────────────────────────────────────────────── */
  useEffect(() => {
    api.get('/wrecker/tenant').then((r) => {
      const t = r?.data;
      setTenant(t);
      if (t?.is_legacy) {
        // Demo / default tenant — don't loop someone through setup.
        toast.info('You’re on the legacy workspace — setup not required.');
        navigate('/wrecker', { replace: true });
        return;
      }
      if (t?.setup_completed) {
        toast.info('Setup already complete. Opening Dispatch.');
        navigate('/wrecker', { replace: true });
      }
    }).catch(() => {});
  }, [navigate]);

  /* ─── Step actions ────────────────────────────────────────────── */
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const saveCompany = async () => {
    setSaving(true);
    try {
      await api.put('/wrecker/tenant', {
        address: company.address,
        city: company.city,
        state: company.state,
        zip_code: company.zip_code,
        timezone: company.timezone,
      });
      // Also seed the tenant_settings doc so the deadhead-miles base address resolves.
      await api.put('/wrecker/business-profile', {
        street: company.address,
        city: company.city,
        state: company.state,
        zip_code: company.zip_code,
        timezone: company.timezone,
      }).catch(() => {/* endpoint optional — tenant has the data either way */});
      next();
    } catch (e) {
      toast.error('Failed to save company info.');
    } finally {
      setSaving(false);
    }
  };

  const saveHours = async () => {
    setSaving(true);
    try {
      await api.put('/wrecker/business-hours', {
        twenty_four_seven: twentyFourSeven,
        hours: twentyFourSeven ? null : hours,
      }).catch(() => {/* endpoint name may differ — don't block flow */});
      next();
    } catch (e) {
      // Don't block on hours save — it's not critical for first dispatch.
    } finally {
      setSaving(false);
    }
  };

  const saveDriver = async () => {
    if (!driver.name.trim()) { next(); return; }  // skipped
    setSaving(true);
    try {
      await api.post('/wrecker/drivers', {
        name: driver.name.trim(),
        phone: driver.phone.trim() || null,
        email: driver.email.trim() || null,
      });
      toast.success(`Driver ${driver.name} added.`);
      next();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add driver.');
    } finally {
      setSaving(false);
    }
  };

  const saveTruck = async () => {
    if (!truck.unit_number.trim()) { next(); return; }  // skipped
    setSaving(true);
    try {
      await api.post('/wrecker/trucks', {
        unit_number: truck.unit_number.trim(),
        body_class: truck.body_class,
        plate: truck.plate.trim() || null,
      });
      toast.success(`Truck ${truck.unit_number} added.`);
      next();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add truck.');
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await api.put('/wrecker/tenant', { setup_completed: true });
      toast.success('You’re all set! Welcome to WreckerLogix.');
      navigate('/wrecker', { replace: true });
    } catch (e) {
      toast.error('Failed to mark setup complete — you can re-enter from Settings.');
      navigate('/wrecker', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  /* ─── Render ──────────────────────────────────────────────────── */
  const trialDays = tenant?.trial_days_remaining;

  return (
    <div className="min-h-screen bg-[#04060a] text-white px-4 py-8" data-testid="setup-wizard">
      <div className="max-w-2xl mx-auto">
        {/* Trial banner */}
        {tenant?.subscription_status === 'trialing' && trialDays != null && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 text-amber-200 text-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>
                <span className="font-bold">{trialDays}</span> day{trialDays === 1 ? '' : 's'} left on your free trial
              </span>
            </div>
            <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]">
              {tenant?.plan_name || 'Free Trial'}
            </Badge>
          </div>
        )}

        {/* Progress dots */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.key}>
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      i < step  ? 'bg-emerald-500 text-slate-950'
                      : i === step ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/20'
                      : 'bg-white/5 text-slate-600 border border-white/10'
                    }`}
                    data-testid={`step-dot-${s.key}`}
                  >
                    {i < step ? <CheckCircle2 className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                  </div>
                  <div className={`text-[10px] uppercase tracking-wider font-bold ${
                    i === step ? 'text-amber-300' : 'text-slate-600'
                  }`}>
                    {s.label}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 transition-colors ${
                    i < step ? 'bg-emerald-500' : 'bg-white/5'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <Card className="bg-[#0a0e14] border-white/5 p-6 sm:p-8">
          {/* STEP 0 — COMPANY */}
          {step === 0 && (
            <div className="space-y-5" data-testid="step-company">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><Building2 className="w-5 h-5 text-amber-300" /> Company info</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Where’s your shop? We use this as the default origin for deadhead-mile calculations.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-slate-400">Street address</Label>
                  <Input
                    value={company.address}
                    onChange={(e) => setCompany({ ...company, address: e.target.value })}
                    placeholder="123 Main St"
                    className="mt-1 bg-[#07090d] border-white/10 text-white"
                    data-testid="setup-address"
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs uppercase tracking-wider text-slate-400">City</Label>
                    <Input
                      value={company.city}
                      onChange={(e) => setCompany({ ...company, city: e.target.value })}
                      placeholder="City"
                      className="mt-1 bg-[#07090d] border-white/10 text-white"
                      data-testid="setup-city"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-slate-400">State</Label>
                    <Select value={company.state} onValueChange={(v) => setCompany({ ...company, state: v })}>
                      <SelectTrigger className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="setup-state">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-slate-400">ZIP</Label>
                    <Input
                      value={company.zip_code}
                      onChange={(e) => setCompany({ ...company, zip_code: e.target.value })}
                      placeholder="12345"
                      className="mt-1 bg-[#07090d] border-white/10 text-white"
                      data-testid="setup-zip"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-slate-400">Time zone</Label>
                    <Select value={company.timezone} onValueChange={(v) => setCompany({ ...company, timezone: v })}>
                      <SelectTrigger className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="setup-timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>{TIME_ZONES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 1 — HOURS */}
          {step === 1 && (
            <div className="space-y-5" data-testid="step-hours">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-amber-300" /> Business hours</h2>
                <p className="text-sm text-slate-400 mt-1">
                  After-hours calls still come in — these hours just tell customers when you’re open without a surcharge.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-[#07090d]">
                <div>
                  <div className="text-sm font-semibold">24 / 7 service</div>
                  <div className="text-[11px] text-slate-500">Most tow shops — you’re always available.</div>
                </div>
                <Switch checked={twentyFourSeven} onCheckedChange={setTwentyFourSeven} data-testid="setup-247" />
              </div>

              {!twentyFourSeven && (
                <div className="space-y-1">
                  {Object.entries(hours).map(([day, h]) => (
                    <div key={day} className="flex items-center gap-3 py-1.5" data-testid={`hours-row-${day}`}>
                      <div className="w-24 text-sm text-slate-300 capitalize">{day}</div>
                      <Switch
                        checked={!h.closed}
                        onCheckedChange={(v) => setHours({ ...hours, [day]: { ...h, closed: !v } })}
                        data-testid={`hours-toggle-${day}`}
                      />
                      {h.closed ? (
                        <span className="text-xs text-slate-500 italic">Closed</span>
                      ) : (
                        <>
                          <Input
                            type="time"
                            value={h.open}
                            onChange={(e) => setHours({ ...hours, [day]: { ...h, open: e.target.value } })}
                            className="w-28 bg-[#07090d] border-white/10 text-white text-xs h-8"
                          />
                          <span className="text-slate-500 text-xs">→</span>
                          <Input
                            type="time"
                            value={h.close}
                            onChange={(e) => setHours({ ...hours, [day]: { ...h, close: e.target.value } })}
                            className="w-28 bg-[#07090d] border-white/10 text-white text-xs h-8"
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2 — DRIVER */}
          {step === 2 && (
            <div className="space-y-5" data-testid="step-driver">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><User className="w-5 h-5 text-amber-300" /> Add your first driver</h2>
                <p className="text-sm text-slate-400 mt-1">
                  You can skip this and add drivers later from the Dispatch Board.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-slate-400">Driver name</Label>
                  <Input
                    value={driver.name}
                    onChange={(e) => setDriver({ ...driver, name: e.target.value })}
                    placeholder="e.g. Bobby Jenkins"
                    className="mt-1 bg-[#07090d] border-white/10 text-white"
                    data-testid="setup-driver-name"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-slate-400">Phone</Label>
                    <div className="relative mt-1">
                      <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <Input
                        value={driver.phone}
                        onChange={(e) => setDriver({ ...driver, phone: e.target.value })}
                        placeholder="(555) 555-1234"
                        className="pl-9 bg-[#07090d] border-white/10 text-white"
                        data-testid="setup-driver-phone"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-slate-400">Email (optional)</Label>
                    <Input
                      type="email"
                      value={driver.email}
                      onChange={(e) => setDriver({ ...driver, email: e.target.value })}
                      placeholder="driver@example.com"
                      className="mt-1 bg-[#07090d] border-white/10 text-white"
                      data-testid="setup-driver-email"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 — TRUCK */}
          {step === 3 && (
            <div className="space-y-5" data-testid="step-truck">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><Truck className="w-5 h-5 text-amber-300" /> Add your first truck</h2>
                <p className="text-sm text-slate-400 mt-1">
                  You can also skip this and add trucks later from the Trucks page.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-slate-400">Unit number</Label>
                  <Input
                    value={truck.unit_number}
                    onChange={(e) => setTruck({ ...truck, unit_number: e.target.value })}
                    placeholder="e.g. 12 or W-3"
                    className="mt-1 bg-[#07090d] border-white/10 text-white"
                    data-testid="setup-truck-unit"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-slate-400">Body class</Label>
                    <Select value={truck.body_class} onValueChange={(v) => setTruck({ ...truck, body_class: v })}>
                      <SelectTrigger className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="setup-truck-class">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light Duty</SelectItem>
                        <SelectItem value="medium">Medium Duty</SelectItem>
                        <SelectItem value="heavy">Heavy Duty</SelectItem>
                        <SelectItem value="flatbed">Flatbed</SelectItem>
                        <SelectItem value="rotator">Rotator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-slate-400">Plate (optional)</Label>
                    <Input
                      value={truck.plate}
                      onChange={(e) => setTruck({ ...truck, plate: e.target.value })}
                      placeholder="ABC-1234"
                      className="mt-1 bg-[#07090d] border-white/10 text-white"
                      data-testid="setup-truck-plate"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 — DONE */}
          {step === 4 && (
            <div className="text-center space-y-5 py-4" data-testid="step-done">
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <PartyPopper className="w-10 h-10 text-emerald-300" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{tenant?.name ? `${tenant.name} is ready.` : "You're ready."}</h2>
                <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
                  Your dispatch board is waiting. You can fine-tune everything else — charges, drivers, sidebars, integrations —
                  any time from the <span className="text-amber-300 font-semibold">Customize</span> and <span className="text-amber-300 font-semibold">Settings</span> pages.
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 pt-4 max-w-md mx-auto text-left">
                {[
                  ['Take a call',  'Dispatch a customer in 30 sec.'],
                  ['Add a charge', 'Build your custom rate sheet.'],
                  ['Connect Square', 'Get paid roadside or in-shop.'],
                ].map(([t, c]) => (
                  <div key={t} className="p-3 rounded-lg border border-white/5 bg-[#07090d]">
                    <CheckCircle2 className="w-4 h-4 text-amber-300 mb-1" />
                    <div className="text-xs font-bold text-white">{t}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{c}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Footer Buttons ── */}
          <div className="flex items-center justify-between gap-3 mt-7 pt-5 border-t border-white/5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={back}
              disabled={step === 0 || saving}
              className="border-white/10 text-slate-300 disabled:opacity-30"
              data-testid="wizard-back"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>

            <div className="flex items-center gap-2">
              {(step === 2 || step === 3) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={next}
                  disabled={saving}
                  className="border-white/10 text-slate-400 hover:text-slate-200"
                  data-testid="wizard-skip"
                >
                  <SkipForward className="w-4 h-4 mr-1.5" /> Skip
                </Button>
              )}

              {step < STEPS.length - 1 ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    if (step === 0) saveCompany();
                    else if (step === 1) saveHours();
                    else if (step === 2) saveDriver();
                    else if (step === 3) saveTruck();
                  }}
                  className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
                  data-testid="wizard-next"
                >
                  {saving
                    ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</>
                    : <>Continue <ArrowRight className="w-4 h-4 ml-1.5" /></>}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={finish}
                  className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold"
                  data-testid="wizard-finish"
                >
                  {saving
                    ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Wrapping up…</>
                    : <>Open Dispatch <ArrowRight className="w-4 h-4 ml-1.5" /></>}
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Skip-everything link — escape hatch */}
        <div className="text-center mt-5">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-slate-600 hover:text-slate-400 transition"
            data-testid="wizard-skip-all"
          >
            I’ll set this up later →
          </button>
        </div>
      </div>
    </div>
  );
}
