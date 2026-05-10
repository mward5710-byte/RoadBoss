// WreckerJobNew — Towbook-spec "New Call" / Create Tow Job form.
//
// Six sections, scrolling, single page:
//   1. Vehicle Details (Body Type, Y/M/M, VIN+scan, Plate+State, Color,
//      Drive Type, Odometer, Drivable toggle, Has Keys toggle, Key
//      Location, Unit #)
//   2. Drivers & Trucks (Add from existing roster)
//   3. Account & Call Details (Account, Bill To, Reason, Priority,
//      Invoice #, ETA, Odometers, Notes)
//   4. Location (Simple/Multiple, Pickup, Destination Address/Impound)
//   5. Charges (catalog picker modal, rate × qty line items,
//      discount, fuel surcharge %, tax rate %, summary footer)
//   6. Header / Bottom nav stays
//
// Voice Fill is still there at the top for hands-free entry — it just
// targets the same form keys these sections render.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  ArrowLeft, ChevronDown, Calendar,
  Plus, X, Search, ScanBarcode, MapPin, UserPlus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────
// Towbook-spec lookups
// ─────────────────────────────────────────────────────────────────────

const BODY_TYPES = [
  ['light', 'Light Duty'], ['medium', 'Medium Duty'], ['heavy', 'Heavy Duty'],
  ['motorcycle', 'Motorcycle'], ['rv', 'RV / Camper'], ['trailer', 'Trailer'],
  ['equipment', 'Equipment'], ['other', 'Other'],
];

const DRIVE_TYPES = ['FWD', 'RWD', 'AWD', '4X2', '4X4'];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const SERVICE_TYPES = [
  ['tow_light_duty', 'Tow — Light Duty'],
  ['tow_medium_duty', 'Tow — Medium Duty'],
  ['tow_heavy_duty', 'Tow — Heavy Duty'],
  ['flatbed', 'Flatbed'],
  ['winch_out', 'Winch Out'],
  ['lockout', 'Lockout'],
  ['jumpstart', 'Jumpstart'],
  ['tire_change', 'Tire Change'],
  ['fuel_delivery', 'Fuel Delivery'],
  ['accident_recovery', 'Accident Recovery'],
  ['impound', 'Impound Tow'],
  ['private_property', 'Private Property'],
];

// Same 28-item catalog as the cockpit so the picker UX is identical pre/post create.
const CHARGE_CATALOG = [
  { key: 'admin_fees',         label: 'Administrative fees',          rate: 150,  unit: 'flat'  },
  { key: 'certified_mail',     label: 'Certified Mail',               rate: 100,  unit: 'flat'  },
  { key: 'clean_up',           label: 'Clean up',                     rate: 50,   unit: 'flat'  },
  { key: 'cc_fee',             label: 'Credit Card Fee',              rate: 0.05, unit: 'flat',  prompt: 'amount', promptText: 'CC fee amount in $' },
  { key: 'customer_overage',   label: 'Customer Overage',             rate: 0,    unit: 'flat',  prompt: 'amount' },
  { key: 'dead_head_miles',    label: 'Dead Head Miles',              rate: 1.5,  unit: '/mi',   prompt: 'qty', promptText: 'Miles' },
  { key: 'dollies',            label: 'Dollies',                      rate: 30,   unit: 'flat'  },
  { key: 'drive_shaft',        label: 'Drive Shaft removal',          rate: 0,    unit: 'flat',  prompt: 'amount' },
  { key: 'flatbed',            label: 'Flatbed',                      rate: 30,   unit: 'flat'  },
  { key: 'fuel',               label: 'Fuel (cost of fuel)',          rate: 0,    unit: 'flat',  prompt: 'amount', promptText: 'Cost of fuel in $' },
  { key: 'fuel_delivery',      label: 'Fuel Delivery Service',        rate: 0,    unit: 'flat',  prompt: 'amount' },
  { key: 'goa',                label: 'GOA',                          rate: 0,    unit: 'flat',  prompt: 'amount' },
  { key: 'jump_start',         label: 'Jump Start Service',           rate: 60,   unit: 'flat'  },
  { key: 'labor',              label: 'Labor',                        rate: 60,   unit: '/hr',   prompt: 'qty', promptText: 'Hours' },
  { key: 'lockout',            label: 'Lockout Service',              rate: 60,   unit: 'flat'  },
  { key: 'oil_dry',            label: 'Oil Dry',                      rate: 50,   unit: 'flat'  },
  { key: 'pay_out',            label: 'Pay Out',                      rate: 0,    unit: 'flat',  prompt: 'amount' },
  { key: 'police_winch',       label: 'Police Winch Out',             rate: 200,  unit: 'flat'  },
  { key: 'pp_tow_fee',         label: 'Private Property Tow Fee',     rate: 150,  unit: 'flat'  },
  { key: 'service_charge',     label: 'Service Charge',               rate: 0,    unit: 'flat',  prompt: 'amount' },
  { key: 'set_out',            label: 'Set out',                      rate: 100,  unit: 'flat'  },
  { key: 'tire_service',       label: 'Tire Service',                 rate: 60,   unit: 'flat'  },
  { key: 'title_search',       label: 'Title search',                 rate: 100,  unit: 'flat'  },
  { key: 'tow_after_hours',    label: 'Tow/Hook after hours',         rate: 80,   unit: 'flat'  },
  { key: 'tow_hook',           label: 'Tow/Hook Fee',                 rate: 60,   unit: 'flat'  },
  { key: 'tow_high_end',       label: 'Tow/Hook High-end/Show car',   rate: 80,   unit: 'flat'  },
  { key: 'volunteer_repo',     label: 'Volunteer Repo',               rate: 100,  unit: 'flat'  },
  { key: 'wait_time',          label: 'WAIT - Wait Time',             rate: 0,    unit: '/hr',   prompt: 'qty', promptText: 'Hours waited' },
  { key: 'winching_per_hour',  label: 'Winching PER HOUR',            rate: 100,  unit: '/hr',   prompt: 'qty', promptText: 'Hours' },
];

// ─────────────────────────────────────────────────────────────────────
// Three-state toggle (Yes / No / N/A) — Towbook standard for Drivable + Has Keys
// ─────────────────────────────────────────────────────────────────────
function TriToggle({ value, onChange, testid }) {
  // value: true | false | null (null = N/A)
  const opts = [
    { v: true,  label: 'Yes', cls: 'bg-emerald-500 text-slate-950' },
    { v: false, label: 'No',  cls: 'bg-red-500 text-white' },
    { v: null,  label: 'N/A', cls: 'bg-slate-700 text-slate-200' },
  ];
  return (
    <div className="inline-flex rounded-lg border border-white/10 overflow-hidden" data-testid={testid}>
      {opts.map((o) => {
        const sel = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={`px-3 h-9 text-xs font-bold uppercase tracking-wider transition ${
              sel ? o.cls : 'bg-[#07090d] text-slate-400 hover:text-white'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section wrapper — collapsible card with consistent styling
// ─────────────────────────────────────────────────────────────────────
function Section({ title, badge, children, testid, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid={testid}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-amber-400/90 font-bold">{title}</span>
          {badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold">{badge}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-4">{children}</div>}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
export default function WreckerJobNew() {
  const navigate = useNavigate();
  const me = getUser();

  const [clubs, setClubs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [saving, setSaving] = useState(false);
  // Live, customizable Service Types — falls back to defaults if no override.
  // Mike's Editor (/wrecker/customize) writes here and the form picks it up
  // on next mount with zero further wiring.
  const [serviceTypesLive, setServiceTypesLive] = useState(SERVICE_TYPES);
  // Same pattern for the rest of the customizable lookups. Each falls back
  // to the in-file defaults when the tenant hasn't overridden anything.
  const [bodyTypesLive, setBodyTypesLive] = useState(BODY_TYPES);
  const [driveTypesLive, setDriveTypesLive] = useState(
    DRIVE_TYPES.map((d) => [d.toLowerCase(), d])
  );
  const [chargeCatalogLive, setChargeCatalogLive] = useState(CHARGE_CATALOG);
  // Form-field section toggles — { customer: true, vehicle: true, ... }
  // Defaults to ALL ON; tenant can hide entire sections via the Customize page.
  const [formSections, setFormSections] = useState({
    customer: true, vehicle: true, drivers: true, account: true,
    location: true, charges: true, billing: true,
  });

  const [form, setForm] = useState({
    // Sequential industry call number — auto-filled with the next available
    // number on mount, but the dispatcher can override it (e.g. when
    // importing legacy jobs or correcting a skipped number).
    call_number: '',
    // Service / Account
    service_type: 'tow_light_duty',
    priority: 'normal',
    account: '',
    bill_to: '',
    reason: '',
    invoice_number: '',
    eta: '',
    motor_club_id: '',
    payment_method: 'invoice',
    notes: '',
    unit_number: '',
    // Customer
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    // Vehicle
    body_type: 'light',
    veh_year: '', veh_make: '', veh_model: '',
    veh_color: '', veh_drive_type: '',
    veh_plate: '', veh_state: '', veh_vin: '',
    veh_odometer: '',
    veh_drivable: null,
    veh_has_keys: null,
    veh_key_location: '',
    // Locations
    location_type: 'simple',     // 'simple' | 'multiple'
    pickup_address: '',
    destination_type: 'address', // 'address' | 'impound'
    dropoff_address: '',
    // Odometers
    odometer_start: '',
    odometer_pickup: '',
    odometer_dropoff: '',
    odometer_state_line: '',
    // Charges/billing
    quoted_price: '',
    discount: '',
    fuel_surcharge_pct: '',
    tax_rate_pct: '',
  });
  const setField = useCallback((k, v) => setForm((f) => ({ ...f, [k]: v })), []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target?.value ?? e }));

  // Driver assignment
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const [assignedDriverIds, setAssignedDriverIds] = useState([]);

  // Pre-create charges buffer (post all to /charges after job creation)
  const [pendingCharges, setPendingCharges] = useState([]);
  const [chargePickerOpen, setChargePickerOpen] = useState(false);
  const [chargeSearch, setChargeSearch] = useState('');
  const filteredCatalog = chargeSearch.trim()
    ? chargeCatalogLive.filter((c) => c.label.toLowerCase().includes(chargeSearch.toLowerCase()))
    : chargeCatalogLive;

  const addPendingCharge = (preset) => {
    let label = preset.label;
    let rate = preset.rate;
    let qty = 1;
    if (preset.prompt === 'qty') {
      const input = window.prompt(`${preset.promptText || 'Quantity'}:`, '1');
      if (input == null) return;
      const n = parseFloat(input);
      if (!n || n <= 0) { toast.error('Enter a positive number'); return; }
      qty = n;
    } else if (preset.prompt === 'amount') {
      const def = preset.rate > 0 ? String(preset.rate) : '';
      const input = window.prompt(`${preset.promptText || 'Amount in $'}:`, def);
      if (input == null) return;
      const n = parseFloat(input);
      if (!n || n <= 0) { toast.error('Enter a positive amount'); return; }
      rate = n;
    }
    const id = `pending-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setPendingCharges((arr) => [...arr, {
      id, key: preset.key, label, rate, qty, unit: preset.unit,
      subtotal: +(rate * qty).toFixed(2),
    }]);
    setChargePickerOpen(false);
    setChargeSearch('');
  };
  const removePendingCharge = (cid) => setPendingCharges((arr) => arr.filter((c) => c.id !== cid));

  // Totals (live calc as user adds/removes/edits)
  const totals = useMemo(() => {
    const base = pendingCharges.reduce((s, c) => s + (c.subtotal || 0), 0);
    const quoted = parseFloat(form.quoted_price) || 0;
    const subtotal = base + (quoted && pendingCharges.length === 0 ? quoted : 0); // if no line items, quoted_price represents whole
    const subWithBase = base + quoted; // sum if both present
    const discount = parseFloat(form.discount) || 0;
    const fuelPct = parseFloat(form.fuel_surcharge_pct) || 0;
    const taxPct = parseFloat(form.tax_rate_pct) || 0;
    const sub = Math.max(0, subWithBase - discount);
    const fuel = +(sub * (fuelPct / 100)).toFixed(2);
    const taxable = sub + fuel;
    const tax = +(taxable * (taxPct / 100)).toFixed(2);
    const invoiceTotal = +(taxable + tax).toFixed(2);
    return { sub: +sub.toFixed(2), fuel, tax, invoiceTotal, base, quoted, discount };
  }, [pendingCharges, form.quoted_price, form.discount, form.fuel_surcharge_pct, form.tax_rate_pct]);

  useEffect(() => {
    api.get('/wrecker/motor-clubs').then((r) => setClubs(r.data)).catch(() => {});
    api.get('/wrecker/drivers').then((r) => setDrivers(r.data)).catch(() => {});
    // Pull universal customizations (Tier 1). For each list, if the tenant
    // has saved an override we use it; otherwise we fall back to the
    // in-file defaults. This lets Mike's Editor (/wrecker/customize) reshape
    // the New Call form without any code changes here.
    api.get('/wrecker/customizations').then((r) => {
      const c = r?.data || {};
      const ext = c.extras || {};
      if (Array.isArray(c.service_types) && c.service_types.length > 0) {
        setServiceTypesLive(c.service_types);
      }
      if (Array.isArray(c.body_types) && c.body_types.length > 0) {
        setBodyTypesLive(c.body_types);
      }
      if (Array.isArray(ext.drive_types) && ext.drive_types.length > 0) {
        setDriveTypesLive(ext.drive_types);
      }
      if (Array.isArray(c.charges) && c.charges.length > 0) {
        // Editor stores {key, label, rate, unit}; existing form expects same shape.
        setChargeCatalogLive(c.charges);
      }
      if (c.call_form_fields && typeof c.call_form_fields === 'object') {
        setFormSections((s) => ({ ...s, ...c.call_form_fields }));
      }
    }).catch(() => {});
    // Pre-fetch the next sequential call number so the dispatcher sees it
    // immediately at the top of the form. They can override before saving.
    api.get('/wrecker/call-number/next').then((r) => {
      const next = r?.data?.next;
      if (next) setForm((f) => ({ ...f, call_number: String(next) }));
    }).catch(() => {});
  }, []);

  // VOICE: One Co-Pilot in charge. The inline Voice Fill bar that lived
  // here was confusing — drivers had three different mic surfaces fighting
  // each other (this bar, the GlobalCopilotFAB, and the wake-word listener).
  // It's gone. Co-Pilot (the floating mic, "Hey Co-Pilot...") is the ONLY
  // voice surface now. Mike's rule: one Co-Pilot, no extras.

  // ─── Submit (Done button) ──────────────────────────────────────────
  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.customer_name) { toast.error('Customer name is required'); return; }
    if (!form.pickup_address) { toast.error('Pickup address is required'); return; }
    setSaving(true);

    try {
      const club = clubs.find((c) => c.id === form.motor_club_id);
      // Parse the call number — strip non-digits so dispatchers can paste
      // "#124491" or "Call 124491" and we still extract the integer.
      const cnRaw = String(form.call_number || '').replace(/[^\d]/g, '');
      const callNumber = cnRaw ? parseInt(cnRaw, 10) : null;
      const payload = {
        // Sequential call number. If null, the backend auto-generates the
        // next available for this tenant.
        call_number: callNumber,
        service_type: form.service_type,
        priority: form.priority,
        customer: {
          name: form.customer_name,
          phone: form.customer_phone || null,
          email: form.customer_email || null,
        },
        vehicle: {
          year: form.veh_year ? parseInt(form.veh_year) : null,
          make: form.veh_make || null,
          model: form.veh_model || null,
          color: form.veh_color || null,
          plate: form.veh_plate || null,
          state: form.veh_state || null,
          vin: form.veh_vin || null,
          duty_class: form.body_type || null,
          drive_type: form.veh_drive_type || null,
          odometer: form.veh_odometer ? parseInt(form.veh_odometer) : null,
          drivable: form.veh_drivable,
          has_keys: form.veh_has_keys,
          key_location: form.veh_key_location || null,
        },
        // Send addresses without dummy lat/lng — backend GeoPoint now accepts
        // optional coords and Mapbox geocodes server-side for accurate mileage.
        pickup: { address: form.pickup_address },
        dropoff: form.dropoff_address ? { address: form.dropoff_address } : null,
        quoted_price: form.quoted_price ? parseFloat(form.quoted_price) : null,
        motor_club_id: form.motor_club_id || null,
        motor_club_name: club ? club.name : null,
        payment_method: form.payment_method,
        notes: form.notes || null,
        // Towbook extras
        account: form.account || null,
        bill_to: form.bill_to || null,
        reason: form.reason || null,
        invoice_number: form.invoice_number || null,
        eta: form.eta ? new Date(form.eta).toISOString() : null,
        odometer_start: form.odometer_start ? parseInt(form.odometer_start) : null,
        odometer_pickup: form.odometer_pickup ? parseInt(form.odometer_pickup) : null,
        odometer_dropoff: form.odometer_dropoff ? parseInt(form.odometer_dropoff) : null,
        odometer_state_line: form.odometer_state_line ? parseInt(form.odometer_state_line) : null,
        unit_number: form.unit_number || null,
        location_type: form.location_type || 'simple',
        destination_type: form.destination_type || 'address',
        discount: form.discount ? parseFloat(form.discount) : null,
        fuel_surcharge_pct: form.fuel_surcharge_pct ? parseFloat(form.fuel_surcharge_pct) : null,
        tax_rate_pct: form.tax_rate_pct ? parseFloat(form.tax_rate_pct) : null,
        assigned_driver_ids: assignedDriverIds.length ? assignedDriverIds : null,
        assigned_driver_id: assignedDriverIds[0] || null,
      };
      const r = await api.post('/wrecker/jobs', payload);
      const newJobId = r.data.id;

      // Post any pre-create charges sequentially. Best-effort: a single
      // failed line item must NOT block the job creation (it's already saved).
      if (pendingCharges.length > 0) {
        const failures = [];
        for (const c of pendingCharges) {
          try {
            await api.post(`/wrecker/jobs/${newJobId}/charges`, {
              key: c.key, label: c.label, rate: c.rate, qty: c.qty, unit: c.unit,
            });
          } catch (err) {
            failures.push(c.label);
          }
        }
        if (failures.length) {
          toast.warning(`Job created, but ${failures.length} charge${failures.length === 1 ? '' : 's'} failed: ${failures.join(', ')}`);
        }
      }
      toast.success('Tow job created');
      navigate(`/wrecker/jobs/${newJobId}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="pb-32" data-testid="new-call-form">
      {/* TOWBOOK HEADER — Back · "New Call" · Done */}
      <div className="sticky top-0 z-30 bg-[#0a0e14]/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <Link to="/wrecker">
          <Button variant="ghost" size="sm" data-testid="new-call-back" className="text-slate-300 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <h1 className="text-base font-bold text-white" data-testid="new-call-title">New Call</h1>
        <Button
          onClick={submit}
          disabled={saving || !form.customer_name || !form.pickup_address}
          className="bg-amber-500 text-black hover:bg-amber-400 font-bold disabled:opacity-40"
          data-testid="new-call-done"
        >
          {saving ? 'Saving…' : 'Done'}
        </Button>
      </div>

      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
        {/* ──── CALL # ──── (industry-standard sequential ID — auto-filled,
             editable. Mike's spec: every wrecker call has a number like
             #124491 that's referenced on the radio + paperwork.) */}
        <Card className="bg-amber-500/[0.04] border-amber-500/20 p-4" data-testid="section-call-number">
          <div className="flex items-center gap-3">
            <div className="text-[10px] uppercase tracking-widest text-amber-400/90 font-bold whitespace-nowrap">Call #</div>
            <div className="text-xl font-mono text-amber-200">#</div>
            <Input
              data-testid="call-number"
              type="text"
              inputMode="numeric"
              value={form.call_number}
              onChange={set('call_number')}
              placeholder="Auto"
              className="flex-1 bg-[#07090d] border-white/10 text-amber-100 text-lg font-mono tracking-wider h-10 max-w-[200px]"
              title="Sequential call number for this job. Auto-filled with the next available number; you can override it."
            />
            <div className="text-[11px] text-slate-500 hidden sm:block">
              Auto-filled · editable
            </div>
          </div>
        </Card>

        {/* ──── 1. CUSTOMER ──── (always required up top) */}
        {formSections.customer !== false && (
        <Section title="Customer" testid="section-customer">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Name *</Label>
              <Input data-testid="customer-name" value={form.customer_name} onChange={set('customer_name')} required />
            </div>
            <div>
              <Label>Phone</Label>
              <Input data-testid="customer-phone" value={form.customer_phone} onChange={set('customer_phone')} placeholder="+1..." />
            </div>
            <div className="md:col-span-2">
              <Label>Email</Label>
              <Input data-testid="customer-email" value={form.customer_email} onChange={set('customer_email')} />
            </div>
          </div>
        </Section>
        )}

        {/* ──── 2. VEHICLE DETAILS ──── */}
        {formSections.vehicle !== false && (
        <Section title="Vehicle Details" testid="section-vehicle">
          <div>
            <Label>Body Type</Label>
            <Select value={form.body_type} onValueChange={(v) => setField('body_type', v)}>
              <SelectTrigger data-testid="body-type" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>{bodyTypesLive.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Year</Label>
              <Input data-testid="veh-year" value={form.veh_year} onChange={set('veh_year')} inputMode="numeric" maxLength={4} />
            </div>
            <div>
              <Label>Make</Label>
              <Input data-testid="veh-make" value={form.veh_make} onChange={set('veh_make')} />
            </div>
            <div>
              <Label>Model</Label>
              <Input data-testid="veh-model" value={form.veh_model} onChange={set('veh_model')} />
            </div>
          </div>

          <div>
            <Label>VIN</Label>
            <div className="relative">
              <Input
                data-testid="veh-vin"
                value={form.veh_vin}
                onChange={set('veh_vin')}
                placeholder="17-character VIN"
                maxLength={17}
                className="pr-12 font-mono uppercase tracking-wider"
              />
              <button
                type="button"
                title="Scan barcode (coming soon)"
                onClick={() => toast.info('VIN barcode scan coming in next release. For now, type or paste the VIN.')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-md bg-slate-800/80 hover:bg-slate-700 text-sky-300 flex items-center justify-center"
                data-testid="veh-vin-scan"
              >
                <ScanBarcode className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Plate Number</Label>
              <Input data-testid="veh-plate" value={form.veh_plate} onChange={set('veh_plate')} className="uppercase" />
            </div>
            <div>
              <Label>State</Label>
              <Select value={form.veh_state} onValueChange={(v) => setField('veh_state', v)}>
                <SelectTrigger data-testid="veh-state" className="bg-[#07090d] border-white/10 text-white"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-60">{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Color</Label>
              <Input data-testid="veh-color" value={form.veh_color} onChange={set('veh_color')} />
            </div>
            <div>
              <Label>Drive Type</Label>
              <Select value={form.veh_drive_type} onValueChange={(v) => setField('veh_drive_type', v)}>
                <SelectTrigger data-testid="veh-drive-type" className="bg-[#07090d] border-white/10 text-white"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{driveTypesLive.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Odometer</Label>
              <Input data-testid="veh-odometer" value={form.veh_odometer} onChange={set('veh_odometer')} inputMode="numeric" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-1">
            <div>
              <Label className="block mb-1">Drivable</Label>
              <TriToggle value={form.veh_drivable} onChange={(v) => setField('veh_drivable', v)} testid="veh-drivable" />
            </div>
            <div>
              <Label className="block mb-1">Has Keys</Label>
              <TriToggle value={form.veh_has_keys} onChange={(v) => setField('veh_has_keys', v)} testid="veh-has-keys" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Keys Location</Label>
              <Input data-testid="veh-key-location" value={form.veh_key_location} onChange={set('veh_key_location')} placeholder="e.g. Locker 4634" />
            </div>
            <div>
              <Label>Unit Number</Label>
              <Input data-testid="unit-number" value={form.unit_number} onChange={set('unit_number')} placeholder="Truck/unit reference" />
            </div>
          </div>
        </Section>
        )}

        {/* ──── 3. DRIVERS & TRUCKS ──── */}
        {formSections.drivers !== false && (
        <Section title="Drivers & Trucks" badge={assignedDriverIds.length ? `${assignedDriverIds.length} assigned` : null} testid="section-drivers">
          {assignedDriverIds.length === 0 ? (
            <button
              type="button"
              onClick={() => setDriverPickerOpen(true)}
              data-testid="add-driver-btn"
              className="w-full py-6 rounded-lg border-2 border-dashed border-white/10 text-slate-400 hover:border-amber-500/40 hover:text-amber-300 hover:bg-amber-500/5 transition flex flex-col items-center gap-1.5"
            >
              <UserPlus className="w-5 h-5" />
              <div className="text-sm font-semibold">Tap the + button to add drivers & trucks</div>
            </button>
          ) : (
            <div className="space-y-2">
              {assignedDriverIds.map((did) => {
                const drv = drivers.find((d) => d.id === did);
                return (
                  <div key={did} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/10" data-testid={`assigned-driver-${did}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-sm font-bold">
                        {(drv?.name || '?').slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-sm text-white font-medium">{drv?.name || 'Unknown driver'}</div>
                        <div className="text-[11px] text-slate-500">
                          {drv?.truck_number ? `Truck #${drv.truck_number}` : 'No truck assigned'}
                          {drv?.rotation_rank ? ` · Rank #${drv.rotation_rank}` : ''}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAssignedDriverIds((arr) => arr.filter((x) => x !== did))}
                      className="text-slate-500 hover:text-red-400 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                onClick={() => setDriverPickerOpen(true)}
                size="sm"
                className="border-amber-500/40 text-amber-300"
                data-testid="add-another-driver-btn"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add another
              </Button>
            </div>
          )}
        </Section>
        )}

        {/* ──── 4. ACCOUNT & CALL DETAILS ──── */}
        {formSections.account !== false && (
        <Section title="Account & Call Details" testid="section-account">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Account</Label>
              <Input data-testid="account" value={form.account} onChange={set('account')} placeholder="Customer account #" />
            </div>
            <div>
              <Label>Bill To Account</Label>
              <Input data-testid="bill-to" value={form.bill_to} onChange={set('bill_to')} placeholder="Same as Account or override" />
            </div>
            <div>
              <Label>Reason</Label>
              <Input data-testid="reason" value={form.reason} onChange={set('reason')} placeholder="e.g. Disabled, Accident, Lockout" />
            </div>
            <div>
              <Label className="block mb-1">Priority</Label>
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden" data-testid="priority-toggle">
                {[
                  { v: 'low', label: 'Low', cls: 'bg-slate-600 text-white' },
                  { v: 'normal', label: 'Normal', cls: 'bg-amber-500 text-slate-950' },
                  { v: 'high', label: 'High', cls: 'bg-red-500 text-white' },
                ].map((o) => {
                  const sel = form.priority === o.v;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setField('priority', o.v)}
                      className={`px-3 h-9 text-xs font-bold uppercase tracking-wider transition ${sel ? o.cls : 'bg-[#07090d] text-slate-400 hover:text-white'}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Invoice Number</Label>
              <Input data-testid="invoice-number" value={form.invoice_number} onChange={set('invoice_number')} placeholder="(optional)" />
            </div>
            <div>
              <Label>ETA</Label>
              <div className="relative">
                <Input
                  data-testid="eta"
                  type="datetime-local"
                  value={form.eta}
                  onChange={set('eta')}
                  className="pr-9"
                />
                <Calendar className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <Label className="block mb-1">Service Type</Label>
            <Select value={form.service_type} onValueChange={(v) => setField('service_type', v)}>
              <SelectTrigger data-testid="service-type" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>{serviceTypesLive.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block mb-1">Odometers</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Start</div>
                <Input data-testid="odo-start" value={form.odometer_start} onChange={set('odometer_start')} inputMode="numeric" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Pickup</div>
                <Input data-testid="odo-pickup" value={form.odometer_pickup} onChange={set('odometer_pickup')} inputMode="numeric" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Drop Off</div>
                <Input data-testid="odo-dropoff" value={form.odometer_dropoff} onChange={set('odometer_dropoff')} inputMode="numeric" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">State Line</div>
                <Input data-testid="odo-state-line" value={form.odometer_state_line} onChange={set('odometer_state_line')} inputMode="numeric" />
              </div>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea data-testid="notes" value={form.notes} onChange={set('notes')} rows={3} placeholder="Hazards, gate codes, special instructions..." />
          </div>
        </Section>
        )}

        {/* ──── 5. LOCATION ──── */}
        {formSections.location !== false && (
        <Section title="Location" testid="section-location">
          <div>
            <Label className="block mb-1">Type</Label>
            <div className="inline-flex rounded-lg border border-white/10 overflow-hidden" data-testid="location-type-toggle">
              {[['simple', 'Simple'], ['multiple', 'Multiple']].map(([v, l]) => {
                const sel = form.location_type === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setField('location_type', v)}
                    className={`px-4 h-9 text-xs font-bold uppercase tracking-wider transition ${sel ? 'bg-amber-500 text-slate-950' : 'bg-[#07090d] text-slate-400 hover:text-white'}`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Pickup *</Label>
            <div className="relative">
              <Input data-testid="pickup-address" value={form.pickup_address} onChange={set('pickup_address')} required placeholder="Street, City, State" className="pr-9" />
              <MapPin className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          <div>
            <Label className="block mb-1">Destination</Label>
            <div className="inline-flex rounded-lg border border-white/10 overflow-hidden mb-2" data-testid="dest-type-toggle">
              {[['address', 'Address'], ['impound', 'Impound']].map(([v, l]) => {
                const sel = form.destination_type === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setField('destination_type', v)}
                    className={`px-4 h-9 text-xs font-bold uppercase tracking-wider transition ${sel ? 'bg-emerald-500 text-slate-950' : 'bg-[#07090d] text-slate-400 hover:text-white'}`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <Input
                data-testid="dropoff-address"
                value={form.destination_type === 'impound' ? (form.dropoff_address || 'Main Lot') : form.dropoff_address}
                onChange={set('dropoff_address')}
                placeholder={form.destination_type === 'impound' ? 'Impound yard / lot name' : 'Drop-off address'}
                className="pr-9"
              />
              <MapPin className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </Section>
        )}

        {/* ──── 6. CHARGES ──── */}
        {formSections.charges !== false && (
        <Section title="Charges" badge={pendingCharges.length ? `${pendingCharges.length} item${pendingCharges.length === 1 ? '' : 's'}` : null} testid="section-charges">
          <div>
            <Label>Quoted Price (main)</Label>
            <Input data-testid="quoted-price" type="number" step="0.01" value={form.quoted_price} onChange={set('quoted_price')} placeholder="0.00" />
          </div>

          <Button
            type="button"
            data-testid="open-charge-picker"
            onClick={() => { setChargePickerOpen(true); setChargeSearch(''); }}
            className="w-full h-11 bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold uppercase tracking-widest"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Charge
          </Button>

          {pendingCharges.length > 0 && (
            <div className="divide-y divide-white/5 rounded-lg border border-white/5 bg-white/[0.02]">
              {pendingCharges.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2.5" data-testid={`pending-charge-${c.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white font-medium truncate">{c.label}</div>
                    <div className="text-[11px] text-slate-500">${c.rate.toFixed(2)} × {c.qty} {c.unit !== 'flat' ? c.unit : ''}</div>
                  </div>
                  <div className="text-sm text-emerald-300 font-semibold tabular-nums">${c.subtotal.toFixed(2)}</div>
                  <button
                    type="button"
                    onClick={() => removePendingCharge(c.id)}
                    className="text-slate-500 hover:text-red-400 p-1"
                    data-testid={`pending-charge-delete-${c.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wider">Discount $</Label>
              <Input data-testid="discount" type="number" step="0.01" value={form.discount} onChange={set('discount')} placeholder="0.00" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider">Fuel Surcharge %</Label>
              <Input data-testid="fuel-surcharge" type="number" step="0.1" value={form.fuel_surcharge_pct} onChange={set('fuel_surcharge_pct')} placeholder="0" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider">Tax Rate %</Label>
              <Input data-testid="tax-rate" type="number" step="0.01" value={form.tax_rate_pct} onChange={set('tax_rate_pct')} placeholder="0" />
            </div>
          </div>

          {/* Blue summary footer — Towbook-style */}
          <div className="rounded-lg bg-gradient-to-br from-sky-500/15 to-sky-500/5 border border-sky-500/30 p-3 space-y-1 text-sm" data-testid="charges-summary">
            <SummaryLine label="Sub Total" value={totals.sub} />
            {totals.fuel > 0 && <SummaryLine label="Fuel Surcharge" value={totals.fuel} muted />}
            {totals.tax > 0 && <SummaryLine label="Tax" value={totals.tax} muted />}
            <div className="pt-1 border-t border-sky-500/20">
              <SummaryLine label="Invoice Total" value={totals.invoiceTotal} bold />
            </div>
          </div>
        </Section>
        )}

        {/* Footer billing methods */}
        {formSections.billing !== false && (
        <Section title="Billing" testid="section-billing" defaultOpen={false}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Payment Method</Label>
              <Select value={form.payment_method} onValueChange={(v) => setField('payment_method', v)}>
                <SelectTrigger data-testid="payment-method" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="motor_club">Motor Club</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motor Club</Label>
              <Select value={form.motor_club_id || 'none'} onValueChange={(v) => setField('motor_club_id', v === 'none' ? '' : v)}>
                <SelectTrigger data-testid="motor-club" className="bg-[#07090d] border-white/10 text-white"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / Direct</SelectItem>
                  {clubs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>
        )}
      </div>

      {/* Charge picker modal — same 28-item searchable list as cockpit */}
      <Dialog open={chargePickerOpen} onOpenChange={(v) => { if (!v) { setChargePickerOpen(false); setChargeSearch(''); } }}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-md max-h-[88vh] overflow-hidden flex flex-col p-0" data-testid="new-call-charge-picker">
          <div className="px-4 pt-4 pb-3 border-b border-white/5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Select a charge</h3>
              <button onClick={() => setChargePickerOpen(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="relative mt-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input value={chargeSearch} onChange={(e) => setChargeSearch(e.target.value)} placeholder="Search charges..." autoFocus data-testid="new-call-charge-search" className="pl-9 bg-[#07090d] border-white/10 text-white" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredCatalog.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">No charges match "{chargeSearch}"</div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredCatalog.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => addPendingCharge(c)}
                    data-testid={`new-call-pick-${c.key}`}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-500/5 active:bg-amber-500/10 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white font-medium truncate">{c.label}</div>
                      {c.prompt && <div className="text-[10px] uppercase tracking-wider text-amber-400/80 mt-0.5">Asks for {c.prompt === 'qty' ? (c.promptText || 'qty') : 'amount'}</div>}
                    </div>
                    <div className="text-sm text-emerald-300 font-semibold tabular-nums shrink-0">
                      ${c.rate.toFixed(2)}{c.unit && c.unit !== 'flat' ? c.unit : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Driver picker modal */}
      <Dialog open={driverPickerOpen} onOpenChange={(v) => { if (!v) setDriverPickerOpen(false); }}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-md max-h-[80vh] overflow-hidden flex flex-col p-0" data-testid="new-call-driver-picker">
          <div className="px-4 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Add Driver</h3>
            <button onClick={() => setDriverPickerOpen(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {drivers.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No drivers in roster yet.<br />
                <Link to="/wrecker" className="text-sky-400 underline">Go to dispatch board → Add Driver</Link>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {drivers.filter((d) => !assignedDriverIds.includes(d.id)).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setAssignedDriverIds((arr) => [...arr, d.id]); setDriverPickerOpen(false); }}
                    data-testid={`pick-driver-${d.id}`}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-500/5 active:bg-amber-500/10 transition"
                  >
                    <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-sm font-bold">
                      {(d.name || '?').slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">{d.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {d.truck_number ? `Truck #${d.truck_number}` : 'No truck'} · Rank #{d.rotation_rank || '—'} · {d.on_duty ? 'On duty' : 'Off'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryLine({ label, value, bold, muted }) {
  return (
    <div className="flex items-center justify-between">
      <div className={`${bold ? 'text-sky-100 font-bold' : muted ? 'text-slate-400 text-xs uppercase tracking-wider' : 'text-slate-300'}`}>{label}</div>
      <div className={`tabular-nums ${bold ? 'text-sky-100 font-bold text-base' : muted ? 'text-slate-300 text-xs' : 'text-slate-200'}`}>
        ${(value || 0).toFixed(2)}
      </div>
    </div>
  );
}
