// WreckerCustomize — Mike's "mini app builder" / Editor page.
// Lives at /wrecker/customize. Every module here writes universal Tier 1
// changes to the tenant_customizations doc. Password-gated saves.
//
// Modules in this build:
//   1. Service Types
//   2. Body Types
//   3. Drive Types
//   4. Charge Catalog
//   5. Call Form Field Toggles (which sections render on New Call)
//   6. Sidebar Menu Items (hide / rename / add custom links)
//   7. Custom Quick Buttons (added to Dispatch board) [stored, render hooks queued]
//   8. Universal Label Overrides (find + replace text app-wide) [stored, render hooks queued]
//   9. Drivers shortcut (link out to Trucks page roster — fast path)
//
// SAFETY: Every save flow re-asks for the user's password before writing,
// and there's a one-tap "Reset to Default" that wipes every override.

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Sliders, Plus, X, ArrowLeft, RotateCcw, Save, AlertTriangle,
  ListChecks, Lock, ChevronRight, Truck, Users, Wrench, FileText,
  Eye, EyeOff, Type, Menu as MenuIcon, Layers, DollarSign, Power,
} from 'lucide-react';
import { api, getUser } from '@/lib/api';
import { toast } from 'sonner';

/* ────────────────────────────────────────────────────────────────────
 * DEFAULTS — mirror the in-form defaults so the editor shows the live
 * list when no overrides are saved yet. Anytime you bump a default in
 * the actual form (e.g. WreckerJobNew.jsx), update the matching list
 * here so the editor never drifts from reality.
 * ──────────────────────────────────────────────────────────────────── */
const DEFAULT_SERVICE_TYPES = [
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

const DEFAULT_BODY_TYPES = [
  ['light', 'Light Duty'],
  ['medium', 'Medium Duty'],
  ['heavy', 'Heavy Duty'],
  ['motorcycle', 'Motorcycle'],
  ['rv', 'RV / Camper'],
  ['trailer', 'Trailer'],
  ['equipment', 'Equipment'],
  ['other', 'Other'],
];

const DEFAULT_DRIVE_TYPES = [
  ['fwd', 'FWD'],
  ['rwd', 'RWD'],
  ['awd', 'AWD'],
  ['4x2', '4X2'],
  ['4x4', '4X4'],
];

// Truncated catalog (the most common 10) — Mike can add the rest in the editor.
const DEFAULT_CHARGES = [
  { key: 'tow_hook',       label: 'Tow/Hook Fee',               rate: 60,  unit: 'flat' },
  { key: 'flatbed',        label: 'Flatbed',                    rate: 30,  unit: 'flat' },
  { key: 'dollies',        label: 'Dollies',                    rate: 30,  unit: 'flat' },
  { key: 'lockout',        label: 'Lockout Service',            rate: 60,  unit: 'flat' },
  { key: 'jump_start',     label: 'Jump Start Service',         rate: 60,  unit: 'flat' },
  { key: 'tire_service',   label: 'Tire Service',               rate: 60,  unit: 'flat' },
  { key: 'labor',          label: 'Labor',                      rate: 60,  unit: '/hr' },
  { key: 'wait_time',      label: 'Wait Time',                  rate: 0,   unit: '/hr' },
  { key: 'winching_per_hour', label: 'Winching PER HOUR',       rate: 100, unit: '/hr' },
  { key: 'admin_fees',     label: 'Administrative fees',        rate: 150, unit: 'flat' },
];

// Sections that render on /wrecker/jobs/new — toggle on/off universally.
const FORM_FIELD_SECTIONS = [
  { key: 'customer',  label: 'Customer Info',         hint: 'Name, phone, email' },
  { key: 'vehicle',   label: 'Vehicle Details',       hint: 'Body type, Y/M/M, VIN, plate' },
  { key: 'drivers',   label: 'Drivers & Trucks',      hint: 'Assign driver + truck before dispatch' },
  { key: 'account',   label: 'Account & Call Details',hint: 'Account, reason, priority, ETA' },
  { key: 'location',  label: 'Location',              hint: 'Pickup + Destination' },
  { key: 'charges',   label: 'Charges',               hint: 'Pre-create line items' },
  { key: 'billing',   label: 'Billing',               hint: 'Payment method, surcharge, tax' },
];

// Default sidebar items — toggling these off hides them everywhere.
const DEFAULT_NAV_ITEMS = [
  { key: 'dispatch',    label: 'Dispatch Board',  visible: true },
  { key: 'my_calls',    label: 'My Calls',        visible: true },
  { key: 'new_job',     label: 'New Tow Job',     visible: true },
  { key: 'navigation',  label: 'Navigation',      visible: true },
  { key: 'clock',       label: 'Time Clock',      visible: true },
  { key: 'trucks',      label: 'Trucks',          visible: true },
  { key: 'impound',     label: 'Impound',         visible: true },
  { key: 'accounts',    label: 'Accounts',        visible: true },
  { key: 'clubs',       label: 'Motor Clubs',     visible: true },
  { key: 'fuel',        label: 'Fuel',            visible: true },
  { key: 'billing',     label: 'Billing',         visible: true },
  { key: 'accounting',  label: 'Accounting',      visible: true },
  { key: 'photos',      label: 'Photo Vault',     visible: true },
  { key: 'customize',   label: 'Customize',       visible: true },
  { key: 'connections', label: 'Connections',     visible: true },
  { key: 'settings',    label: 'Settings',        visible: true },
];

const slugify = (s) => (s || '')
  .toString()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40);

/* ─────────────────────────────────────────────────────────────────────
 * Reusable: KeyValueEditor — generic editor for [key, label] pair lists.
 * Used by Service Types, Body Types, Drive Types.
 * ───────────────────────────────────────────────────────────────────── */
function KeyValueEditor({ rows, setRows, placeholderLabel, testid }) {
  const update = (idx, field, val) => {
    const next = [...rows];
    if (field === 'label') next[idx] = [next[idx][0], val];
    else next[idx] = [slugify(val) || next[idx][0], next[idx][1]];
    setRows(next);
  };
  const remove = (idx) => setRows(rows.filter((_, i) => i !== idx));
  const add = () => setRows([...rows, ['', '']]);

  return (
    <div className="p-5 space-y-2">
      {rows.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">
          No entries yet. Tap <span className="text-sky-300 font-semibold">Add</span> to create the first one.
        </div>
      ) : (
        rows.map(([key, label], idx) => (
          <div key={`${idx}-${key}`} className="flex items-center gap-2 group" data-testid={`${testid}-row-${idx}`}>
            <div className="text-[10px] uppercase tracking-wider text-slate-600 w-6 text-right shrink-0">{idx + 1}</div>
            <Input
              value={label}
              onChange={(e) => update(idx, 'label', e.target.value)}
              placeholder={placeholderLabel}
              className="flex-1 bg-[#07090d] border-white/10 text-white text-sm h-9"
              data-testid={`${testid}-label-${idx}`}
            />
            <Input
              value={key}
              onChange={(e) => update(idx, 'key', e.target.value)}
              placeholder="key"
              className="w-32 bg-[#07090d] border-white/10 text-slate-400 text-xs font-mono h-9"
              data-testid={`${testid}-key-${idx}`}
              title="Internal key — auto-generated from label"
            />
            <button
              type="button"
              onClick={() => remove(idx)}
              className="p-2 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
              data-testid={`${testid}-remove-${idx}`}
              title="Remove"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))
      )}
      <Button
        type="button"
        size="sm"
        onClick={add}
        className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-semibold mt-2"
        data-testid={`${testid}-add`}
      >
        <Plus className="w-4 h-4 mr-1" /> Add row
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Reusable: ModuleHeader — consistent header per editor module.
 * ───────────────────────────────────────────────────────────────────── */
function ModuleHeader({ icon: Icon, title, subtitle, customActive, testid }) {
  return (
    <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 text-amber-300 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white" data-testid={`${testid}-title`}>{title}</div>
          <div className="text-[11px] text-slate-500 truncate">
            {subtitle}
            {customActive && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                Custom
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════
 * MAIN PAGE
 * ═════════════════════════════════════════════════════════════════════ */
export default function WreckerCustomize() {
  const navigate = useNavigate();
  const me = getUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customizations, setCustomizations] = useState(null);

  // Module state
  const [serviceTypes, setServiceTypes] = useState([]);
  const [bodyTypes, setBodyTypes] = useState([]);
  const [driveTypes, setDriveTypes] = useState([]);
  const [charges, setCharges] = useState([]);
  const [formFields, setFormFields] = useState({});  // { customer: true, vehicle: true, ... }
  const [navItems, setNavItems] = useState([]);
  const [customButtons, setCustomButtons] = useState([]); // [{label, target}]
  const [labelOverrides, setLabelOverrides] = useState([]); // [[from, to]]

  const [dirty, setDirty] = useState({}); // {moduleName: true}
  const markDirty = (mod) => setDirty((d) => ({ ...d, [mod]: true }));

  // Password-gate dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // 'save' | 'reset'

  /* ─── Load ──────────────────────────────────────────────────────── */
  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/wrecker/customizations');
      const c = r.data || {};
      setCustomizations(c);

      setServiceTypes((c.service_types && c.service_types.length > 0)
        ? c.service_types : DEFAULT_SERVICE_TYPES.map((p) => [...p]));
      setBodyTypes((c.body_types && c.body_types.length > 0)
        ? c.body_types : DEFAULT_BODY_TYPES.map((p) => [...p]));

      const ext = c.extras || {};
      setDriveTypes((ext.drive_types && ext.drive_types.length > 0)
        ? ext.drive_types : DEFAULT_DRIVE_TYPES.map((p) => [...p]));
      setCustomButtons(ext.custom_buttons || []);
      setLabelOverrides(ext.label_overrides || []);

      setCharges((c.charges && c.charges.length > 0) ? c.charges : DEFAULT_CHARGES);

      // Form-field toggles default to all-on if no overrides yet
      const ff = {};
      FORM_FIELD_SECTIONS.forEach(({ key }) => {
        ff[key] = c.call_form_fields ? (c.call_form_fields[key] !== false) : true;
      });
      setFormFields(ff);

      // Menu items — merge saved state onto defaults so newly-added items appear
      const savedMenu = c.menu_items || [];
      const merged = DEFAULT_NAV_ITEMS.map((d) => {
        const found = savedMenu.find((m) => m.key === d.key);
        return found ? { ...d, ...found } : { ...d };
      });
      // Preserve any custom items the user added (key not in defaults)
      savedMenu.forEach((m) => {
        if (!DEFAULT_NAV_ITEMS.find((d) => d.key === m.key)) merged.push(m);
      });
      setNavItems(merged);

      setDirty({});
    } catch (e) {
      toast.error('Failed to load customizations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  /* ─── Validation + Save ─────────────────────────────────────────── */
  const buildPayload = () => {
    const cleanPairs = (rows) => rows
      .map(([k, l]) => [slugify(k || l), (l || '').trim()])
      .filter(([k, l]) => k && l);

    const cleanedServices = cleanPairs(serviceTypes);
    const cleanedBodies = cleanPairs(bodyTypes);
    const cleanedDrives = cleanPairs(driveTypes);

    const cleanedCharges = charges
      .map((c) => ({
        key: slugify(c.key || c.label),
        label: (c.label || '').trim(),
        rate: Number(c.rate) || 0,
        unit: c.unit || 'flat',
      }))
      .filter((c) => c.key && c.label);

    const cleanedButtons = customButtons
      .map((b) => ({ label: (b.label || '').trim(), target: (b.target || '').trim() }))
      .filter((b) => b.label);

    const cleanedOverrides = labelOverrides
      .map(([from, to]) => [(from || '').trim(), (to || '').trim()])
      .filter(([from, to]) => from && to);

    const cleanedNav = navItems.map((m) => ({
      key: slugify(m.key || m.label),
      label: (m.label || '').trim(),
      visible: m.visible !== false,
      to: m.to || undefined,  // optional URL for custom items
      icon: m.icon || undefined,
    }));

    return {
      service_types: cleanedServices,
      body_types: cleanedBodies,
      charges: cleanedCharges,
      call_form_fields: formFields,
      menu_items: cleanedNav,
      extras: {
        ...(customizations?.extras || {}),
        drive_types: cleanedDrives,
        custom_buttons: cleanedButtons,
        label_overrides: cleanedOverrides,
      },
    };
  };

  const requestSave = () => {
    if (Object.keys(dirty).length === 0) {
      toast.info('Nothing to save.');
      return;
    }
    const payload = buildPayload();
    if (payload.service_types.length === 0) {
      toast.error('You need at least one service type.');
      return;
    }
    if (payload.body_types.length === 0) {
      toast.error('You need at least one body type.');
      return;
    }
    setConfirmAction('save');
    setConfirmPassword('');
    setConfirmOpen(true);
  };

  const requestReset = () => {
    setConfirmAction('reset');
    setConfirmPassword('');
    setConfirmOpen(true);
  };

  const performConfirm = async () => {
    if (!confirmPassword) {
      toast.error('Enter your password to confirm.');
      return;
    }
    setSaving(true);
    try {
      // Verify password by attempting a fresh login (no token write — just validation).
      try {
        await api.post('/auth/login', { email: me?.email, password: confirmPassword });
      } catch {
        toast.error('Password incorrect.');
        setSaving(false);
        return;
      }

      if (confirmAction === 'save') {
        const payload = buildPayload();
        await api.put('/wrecker/customizations', payload);
        toast.success('Customizations saved company-wide.');
      } else if (confirmAction === 'reset') {
        await api.post('/wrecker/customizations/reset');
        toast.success('All customizations reset to defaults.');
      }
      setConfirmOpen(false);
      setConfirmPassword('');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Custom Button helpers ─────────────────────────────────────── */
  const addCustomButton = () => {
    setCustomButtons([...customButtons, { label: '', target: '' }]);
    markDirty('custom_buttons');
  };
  const updateCustomButton = (idx, field, val) => {
    const next = [...customButtons];
    next[idx] = { ...next[idx], [field]: val };
    setCustomButtons(next);
    markDirty('custom_buttons');
  };
  const removeCustomButton = (idx) => {
    setCustomButtons(customButtons.filter((_, i) => i !== idx));
    markDirty('custom_buttons');
  };

  /* ─── Label Override helpers ────────────────────────────────────── */
  const addLabelOverride = () => {
    setLabelOverrides([...labelOverrides, ['', '']]);
    markDirty('label_overrides');
  };
  const updateLabelOverride = (idx, field, val) => {
    const next = [...labelOverrides];
    next[idx] = field === 'from' ? [val, next[idx][1]] : [next[idx][0], val];
    setLabelOverrides(next);
    markDirty('label_overrides');
  };
  const removeLabelOverride = (idx) => {
    setLabelOverrides(labelOverrides.filter((_, i) => i !== idx));
    markDirty('label_overrides');
  };

  /* ─── Nav Item helpers ──────────────────────────────────────────── */
  const toggleNavItem = (key, visible) => {
    setNavItems(navItems.map((m) => m.key === key ? { ...m, visible } : m));
    markDirty('menu_items');
  };
  const renameNavItem = (key, label) => {
    setNavItems(navItems.map((m) => m.key === key ? { ...m, label } : m));
    markDirty('menu_items');
  };
  const addCustomNavItem = () => {
    setNavItems([...navItems, { key: `custom_${Date.now()}`, label: 'New Link', to: '/wrecker', visible: true, custom: true }]);
    markDirty('menu_items');
  };
  const removeCustomNavItem = (key) => {
    setNavItems(navItems.filter((m) => m.key !== key));
    markDirty('menu_items');
  };
  const updateNavItemTo = (key, to) => {
    setNavItems(navItems.map((m) => m.key === key ? { ...m, to } : m));
    markDirty('menu_items');
  };

  /* ─── Charges helpers ───────────────────────────────────────────── */
  const updateCharge = (idx, field, val) => {
    const next = [...charges];
    next[idx] = { ...next[idx], [field]: field === 'rate' ? val : val };
    setCharges(next);
    markDirty('charges');
  };
  const removeCharge = (idx) => {
    setCharges(charges.filter((_, i) => i !== idx));
    markDirty('charges');
  };
  const addCharge = () => {
    setCharges([...charges, { key: '', label: '', rate: 0, unit: 'flat' }]);
    markDirty('charges');
  };

  /* ─── Has overrides indicators ──────────────────────────────────── */
  const has = useMemo(() => ({
    service_types: !!(customizations?.service_types?.length),
    body_types: !!(customizations?.body_types?.length),
    drive_types: !!(customizations?.extras?.drive_types?.length),
    charges: !!(customizations?.charges?.length),
    form_fields: !!(customizations?.call_form_fields),
    menu_items: !!(customizations?.menu_items?.length),
    custom_buttons: !!(customizations?.extras?.custom_buttons?.length),
    label_overrides: !!(customizations?.extras?.label_overrides?.length),
  }), [customizations]);

  const dirtyCount = Object.keys(dirty).length;

  /* ─────────────────────────────────────────────────────────────── */
  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-5 pb-32" data-testid="wrecker-customize">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            className="border-white/10 text-slate-300 shrink-0"
            data-testid="customize-back"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" /> Customize WreckerLogix
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Add, rename, hide, or remove anything in the app. Changes apply to every user in your company.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={requestReset}
          className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 shrink-0"
          data-testid="customize-reset-default"
          title="Reset every override back to defaults"
        >
          <RotateCcw className="w-4 h-4 mr-1" /> Reset All
        </Button>
      </div>

      {/* Tier callout */}
      <Card className="bg-amber-500/[0.04] border-amber-500/20 p-4" data-testid="tier-callout">
        <div className="flex items-start gap-3">
          <Lock className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-100/90 leading-relaxed">
            <span className="font-semibold text-amber-200">Universal change.</span>
            {' '}Anything you save here applies to every dispatcher, driver, and device on your account.
            You'll re-enter your password before each save — that's the safety latch.
          </div>
        </div>
      </Card>

      {/* MODULE 1 — Service Types */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="module-service-types">
        <ModuleHeader
          icon={ListChecks}
          title="Service Types"
          subtitle="Dropdown on the New Call form"
          customActive={has.service_types}
          testid="module-service-types"
        />
        {loading ? <div className="p-5 text-sm text-slate-500">Loading…</div> : (
          <KeyValueEditor
            rows={serviceTypes}
            setRows={(r) => { setServiceTypes(r); markDirty('service_types'); }}
            placeholderLabel="Visible label (e.g. Mud Truck Pull)"
            testid="service-type"
          />
        )}
      </Card>

      {/* MODULE 2 — Body Types */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="module-body-types">
        <ModuleHeader
          icon={Truck}
          title="Body Types"
          subtitle="Vehicle body class on every job"
          customActive={has.body_types}
          testid="module-body-types"
        />
        {loading ? <div className="p-5 text-sm text-slate-500">Loading…</div> : (
          <KeyValueEditor
            rows={bodyTypes}
            setRows={(r) => { setBodyTypes(r); markDirty('body_types'); }}
            placeholderLabel="Visible label (e.g. Box Truck)"
            testid="body-type"
          />
        )}
      </Card>

      {/* MODULE 3 — Drive Types */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="module-drive-types">
        <ModuleHeader
          icon={Wrench}
          title="Drive Types"
          subtitle="FWD / RWD / 4x4 etc."
          customActive={has.drive_types}
          testid="module-drive-types"
        />
        {loading ? <div className="p-5 text-sm text-slate-500">Loading…</div> : (
          <KeyValueEditor
            rows={driveTypes}
            setRows={(r) => { setDriveTypes(r); markDirty('drive_types'); }}
            placeholderLabel="Visible label (e.g. AWD)"
            testid="drive-type"
          />
        )}
      </Card>

      {/* MODULE 4 — Charge Catalog */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="module-charges">
        <ModuleHeader
          icon={DollarSign}
          title="Charge Catalog"
          subtitle="The line items that appear in every Charges picker"
          customActive={has.charges}
          testid="module-charges"
        />
        <div className="p-5 space-y-2">
          {charges.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">
              No charges. Tap <span className="text-sky-300 font-semibold">Add</span> to create one.
            </div>
          ) : (
            charges.map((c, idx) => (
              <div key={`${idx}-${c.key}`} className="flex items-center gap-2" data-testid={`charge-row-${idx}`}>
                <div className="text-[10px] uppercase tracking-wider text-slate-600 w-6 text-right shrink-0">{idx + 1}</div>
                <Input
                  value={c.label || ''}
                  onChange={(e) => updateCharge(idx, 'label', e.target.value)}
                  placeholder="Label (e.g. Tow/Hook Fee)"
                  className="flex-1 bg-[#07090d] border-white/10 text-white text-sm h-9"
                  data-testid={`charge-label-${idx}`}
                />
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={c.rate ?? 0}
                    onChange={(e) => updateCharge(idx, 'rate', parseFloat(e.target.value) || 0)}
                    placeholder="Rate"
                    className="w-24 pl-5 bg-[#07090d] border-white/10 text-white text-sm h-9"
                    data-testid={`charge-rate-${idx}`}
                  />
                </div>
                <select
                  value={c.unit || 'flat'}
                  onChange={(e) => updateCharge(idx, 'unit', e.target.value)}
                  className="h-9 bg-[#07090d] border border-white/10 rounded-md text-slate-300 text-xs px-2"
                  data-testid={`charge-unit-${idx}`}
                >
                  <option value="flat">flat</option>
                  <option value="/hr">/hr</option>
                  <option value="/mi">/mi</option>
                  <option value="/day">/day</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeCharge(idx)}
                  className="p-2 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                  data-testid={`charge-remove-${idx}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
          <Button
            type="button"
            size="sm"
            onClick={addCharge}
            className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-semibold mt-2"
            data-testid="charge-add"
          >
            <Plus className="w-4 h-4 mr-1" /> Add charge
          </Button>
        </div>
      </Card>

      {/* MODULE 5 — Form Field Toggles */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="module-form-fields">
        <ModuleHeader
          icon={Layers}
          title="New Call — Sections"
          subtitle="Hide entire sections of the New Call form for your tenants"
          customActive={has.form_fields}
          testid="module-form-fields"
        />
        <div className="p-5 space-y-2">
          {FORM_FIELD_SECTIONS.map(({ key, label, hint }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-white/5 bg-[#07090d]"
              data-testid={`form-field-row-${key}`}
            >
              <div className="min-w-0 flex items-center gap-2">
                {formFields[key] ? <Eye className="w-4 h-4 text-emerald-400 shrink-0" /> : <EyeOff className="w-4 h-4 text-slate-600 shrink-0" />}
                <div>
                  <div className="text-sm font-semibold text-white">{label}</div>
                  <div className="text-[11px] text-slate-500">{hint}</div>
                </div>
              </div>
              <Switch
                checked={formFields[key] !== false}
                onCheckedChange={(v) => { setFormFields({ ...formFields, [key]: v }); markDirty('form_fields'); }}
                data-testid={`form-field-switch-${key}`}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* MODULE 6 — Sidebar Menu */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="module-menu-items">
        <ModuleHeader
          icon={MenuIcon}
          title="Sidebar Menu"
          subtitle="Hide, rename, or add new links to the sidebar"
          customActive={has.menu_items}
          testid="module-menu-items"
        />
        <div className="p-5 space-y-2">
          {navItems.map((m) => (
            <div
              key={m.key}
              className="flex items-center gap-2 p-2 rounded-lg border border-white/5 bg-[#07090d]"
              data-testid={`nav-row-${m.key}`}
            >
              <Switch
                checked={m.visible !== false}
                onCheckedChange={(v) => toggleNavItem(m.key, v)}
                data-testid={`nav-toggle-${m.key}`}
              />
              <Input
                value={m.label}
                onChange={(e) => renameNavItem(m.key, e.target.value)}
                className="flex-1 bg-transparent border-0 text-white text-sm h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                data-testid={`nav-label-${m.key}`}
              />
              {m.custom && (
                <>
                  <Input
                    value={m.to || ''}
                    onChange={(e) => updateNavItemTo(m.key, e.target.value)}
                    placeholder="/wrecker/jobs/new"
                    className="w-44 bg-[#0a0e14] border-white/10 text-slate-400 text-xs font-mono h-8"
                    data-testid={`nav-to-${m.key}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomNavItem(m.key)}
                    className="p-1.5 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    data-testid={`nav-remove-${m.key}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
              {!m.custom && (
                <span className="text-[10px] uppercase tracking-wider text-slate-600 font-bold px-2">core</span>
              )}
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            onClick={addCustomNavItem}
            className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-semibold mt-2"
            data-testid="nav-add-custom"
          >
            <Plus className="w-4 h-4 mr-1" /> Add custom link
          </Button>
        </div>
      </Card>

      {/* MODULE 7 — Custom Quick Buttons */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="module-custom-buttons">
        <ModuleHeader
          icon={Power}
          title="Custom Quick Buttons"
          subtitle="Buttons that appear on the Dispatch Board (label + URL/action)"
          customActive={has.custom_buttons}
          testid="module-custom-buttons"
        />
        <div className="p-5 space-y-2">
          {customButtons.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">
              No custom buttons yet. Tap <span className="text-sky-300 font-semibold">Add</span> to create one.
            </div>
          ) : (
            customButtons.map((b, idx) => (
              <div key={idx} className="flex items-center gap-2" data-testid={`btn-row-${idx}`}>
                <div className="text-[10px] uppercase tracking-wider text-slate-600 w-6 text-right shrink-0">{idx + 1}</div>
                <Input
                  value={b.label || ''}
                  onChange={(e) => updateCustomButton(idx, 'label', e.target.value)}
                  placeholder="Label (e.g. Heavy Recovery)"
                  className="flex-1 bg-[#07090d] border-white/10 text-white text-sm h-9"
                  data-testid={`btn-label-${idx}`}
                />
                <Input
                  value={b.target || ''}
                  onChange={(e) => updateCustomButton(idx, 'target', e.target.value)}
                  placeholder="/wrecker/jobs/new?service=heavy"
                  className="w-72 bg-[#07090d] border-white/10 text-slate-400 text-xs font-mono h-9"
                  data-testid={`btn-target-${idx}`}
                />
                <button
                  type="button"
                  onClick={() => removeCustomButton(idx)}
                  className="p-2 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                  data-testid={`btn-remove-${idx}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
          <Button
            type="button"
            size="sm"
            onClick={addCustomButton}
            className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-semibold mt-2"
            data-testid="btn-add"
          >
            <Plus className="w-4 h-4 mr-1" /> Add button
          </Button>
        </div>
      </Card>

      {/* MODULE 8 — Label Overrides */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="module-label-overrides">
        <ModuleHeader
          icon={Type}
          title="Universal Label Overrides"
          subtitle='Find any label and replace it everywhere — e.g. change "Wrecker" to "Truck"'
          customActive={has.label_overrides}
          testid="module-label-overrides"
        />
        <div className="p-5 space-y-2">
          {labelOverrides.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">
              No overrides yet. Tap <span className="text-sky-300 font-semibold">Add</span> to rename a label.
            </div>
          ) : (
            labelOverrides.map(([from, to], idx) => (
              <div key={idx} className="flex items-center gap-2" data-testid={`override-row-${idx}`}>
                <div className="text-[10px] uppercase tracking-wider text-slate-600 w-6 text-right shrink-0">{idx + 1}</div>
                <Input
                  value={from}
                  onChange={(e) => updateLabelOverride(idx, 'from', e.target.value)}
                  placeholder="Find (e.g. Wrecker)"
                  className="flex-1 bg-[#07090d] border-white/10 text-white text-sm h-9"
                  data-testid={`override-from-${idx}`}
                />
                <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                <Input
                  value={to}
                  onChange={(e) => updateLabelOverride(idx, 'to', e.target.value)}
                  placeholder="Replace with (e.g. Truck)"
                  className="flex-1 bg-[#07090d] border-white/10 text-white text-sm h-9"
                  data-testid={`override-to-${idx}`}
                />
                <button
                  type="button"
                  onClick={() => removeLabelOverride(idx)}
                  className="p-2 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                  data-testid={`override-remove-${idx}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
          <Button
            type="button"
            size="sm"
            onClick={addLabelOverride}
            className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-semibold mt-2"
            data-testid="override-add"
          >
            <Plus className="w-4 h-4 mr-1" /> Add override
          </Button>
        </div>
      </Card>

      {/* MODULE 9 — Drivers shortcut */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="module-drivers-shortcut">
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-amber-300 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Drivers Roster</div>
              <div className="text-[11px] text-slate-500">
                Add or remove drivers, set roles, mark active. Lives on the Dispatch Board's Drivers panel.
              </div>
            </div>
          </div>
          <Link to="/wrecker">
            <Button
              type="button"
              size="sm"
              className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold"
              data-testid="drivers-shortcut"
            >
              <Users className="w-4 h-4 mr-1" /> Manage Drivers
            </Button>
          </Link>
        </div>
      </Card>

      {/* Sticky save bar */}
      {dirtyCount > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 bg-amber-500/[0.04] backdrop-blur-md border-t border-amber-500/30 px-4 py-3"
          data-testid="customize-save-bar"
        >
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div className="text-sm text-amber-200/90 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>
                <span className="font-bold">{dirtyCount}</span> module{dirtyCount === 1 ? '' : 's'} changed —
                <span className="text-slate-400 ml-1.5">{Object.keys(dirty).join(', ')}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={load}
                disabled={saving}
                className="border-white/10 text-slate-300"
                data-testid="customize-discard"
              >
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={requestSave}
                disabled={saving}
                className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold"
                data-testid="customize-save"
              >
                <Save className="w-4 h-4 mr-1" /> Save Universally
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PASSWORD-GATE DIALOG ─────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={(v) => { if (!saving) setConfirmOpen(v); }}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-md" data-testid="confirm-dialog">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              {confirmAction === 'reset' ? 'Reset all customizations?' : 'Save universal change?'}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm leading-relaxed">
              {confirmAction === 'reset'
                ? "This wipes every override and restores the built-in defaults for every user in your company."
                : "This change applies to every dispatcher, driver, and device on your WreckerLogix account. Re-enter your password to confirm."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                Your password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') performConfirm(); }}
                placeholder="••••••••"
                className="mt-1 bg-[#07090d] border-white/10 text-white"
                data-testid="confirm-password"
                autoFocus
              />
              <div className="text-[11px] text-slate-500 mt-1.5">
                Signed in as <span className="text-slate-300">{me?.email}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
                className="border-white/10 text-slate-300"
                data-testid="confirm-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={performConfirm}
                disabled={saving || !confirmPassword}
                className={confirmAction === 'reset'
                  ? 'bg-rose-500 text-white hover:bg-rose-400 font-bold'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold'}
                data-testid="confirm-submit"
              >
                {saving ? 'Working…' : (confirmAction === 'reset' ? 'Yes, Reset' : 'Yes, Save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// silence unused-import warnings safely
void FileText;
