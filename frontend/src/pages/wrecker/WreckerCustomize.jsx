// WreckerCustomize — the Editor page.
//
// Lives at /wrecker/customize. This is Mike's "make everything editable"
// north star, shipped one module at a time.
//
// MODULES:
//   • Service Types  ← Module #1 (this build)
//   • Body Types        (next)
//   • Charge Catalog    (next)
//   • Call Form Fields  (toggles which sections render on New Call)
//   • Menu Items        (custom buttons + pages)
//
// SAFETY: Tier 1 / universal changes require:
//   1. Password re-entry
//   2. Warning dialog ("⚠️ This affects every user...")
//   3. Reset to Default option (one-tap recovery)

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Sliders, Wrench, Plus, X, ArrowLeft, RotateCcw, Save, AlertTriangle,
  ListChecks, Lock, ChevronRight,
} from 'lucide-react';
import { api, getUser, auth } from '@/lib/api';
import { toast } from 'sonner';

// ─── Defaults (mirror the WreckerJobNew defaults so the editor shows the
//     real list when no overrides are saved) ────────────────────────────
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

// Slugify a label into a backend key
const slugify = (s) => (s || '')
  .toString()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40);

export default function WreckerCustomize() {
  const navigate = useNavigate();
  const me = getUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customizations, setCustomizations] = useState(null);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [dirty, setDirty] = useState(false);

  // Password-gate dialog state for Tier 1 saves
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // 'save' | 'reset'

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/wrecker/customizations');
      setCustomizations(r.data || {});
      // Use override if present, otherwise the built-in defaults
      const list = (r.data?.service_types && r.data.service_types.length > 0)
        ? r.data.service_types
        : DEFAULT_SERVICE_TYPES.map(([k, l]) => [k, l]);
      setServiceTypes(list);
      setDirty(false);
    } catch (e) {
      toast.error('Failed to load customizations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // ─── Service Types handlers ─────────────────────────────────────────
  const updateLabel = (idx, label) => {
    const next = [...serviceTypes];
    next[idx] = [next[idx][0], label];
    setServiceTypes(next);
    setDirty(true);
  };
  const updateKey = (idx, key) => {
    const next = [...serviceTypes];
    next[idx] = [slugify(key) || next[idx][0], next[idx][1]];
    setServiceTypes(next);
    setDirty(true);
  };
  const removeRow = (idx) => {
    const next = serviceTypes.filter((_, i) => i !== idx);
    setServiceTypes(next);
    setDirty(true);
  };
  const addRow = () => {
    const next = [...serviceTypes, ['', '']];
    setServiceTypes(next);
    setDirty(true);
  };

  // ─── Save (with password gate) ──────────────────────────────────────
  const requestSave = () => {
    // Validate before showing the password dialog so Mike doesn't waste
    // a typing round on broken data
    const cleaned = serviceTypes
      .map(([k, l]) => [slugify(k || l), (l || '').trim()])
      .filter(([k, l]) => k && l);
    if (cleaned.length === 0) {
      toast.error('You need at least one service type.');
      return;
    }
    // Detect duplicate keys
    const seen = new Set();
    for (const [k] of cleaned) {
      if (seen.has(k)) {
        toast.error(`Duplicate key: ${k}. Each label must be unique.`);
        return;
      }
      seen.add(k);
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
      // Verify password by attempting a fresh login (no token write — just
      // a check that the password matches the signed-in user).
      try {
        await api.post('/auth/login', { email: me?.email, password: confirmPassword });
      } catch {
        toast.error('Password incorrect.');
        setSaving(false);
        return;
      }

      if (confirmAction === 'save') {
        const cleaned = serviceTypes
          .map(([k, l]) => [slugify(k || l), (l || '').trim()])
          .filter(([k, l]) => k && l);
        await api.put('/wrecker/customizations', { service_types: cleaned });
        toast.success('Service Types saved company-wide.');
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

  const overridesActive = !!(customizations?.service_types && customizations.service_types.length > 0);

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6" data-testid="wrecker-customize">
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
              Add, rename, or remove anything in the app. Changes apply to every user in your company.
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
          <RotateCcw className="w-4 h-4 mr-1" /> Reset to Default
        </Button>
      </div>

      {/* Tier callout */}
      <Card className="bg-amber-500/[0.04] border-amber-500/20 p-4" data-testid="tier-callout">
        <div className="flex items-start gap-3">
          <Lock className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-100/90 leading-relaxed">
            <span className="font-semibold text-amber-200">Universal change.</span>
            {' '}Anything you save here applies to every dispatcher, driver, and device on your account.
            You'll be asked to re-enter your password before each save — that's the safety latch.
          </div>
        </div>
      </Card>

      {/* MODULE #1 — Service Types */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="module-service-types">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ListChecks className="w-4 h-4 text-amber-300" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Service Types</div>
              <div className="text-[11px] text-slate-500">
                The dropdown that shows on the New Call form.
                {overridesActive && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                    Custom
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={addRow}
            className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-semibold"
            data-testid="add-service-type"
          >
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>

        <div className="p-5 space-y-2">
          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : serviceTypes.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">
              No service types yet. Tap <span className="text-sky-300 font-semibold">Add</span> to create the first one.
            </div>
          ) : (
            serviceTypes.map(([key, label], idx) => (
              <div key={`${idx}-${key}`} className="flex items-center gap-2 group" data-testid={`service-type-row-${idx}`}>
                <div className="text-[10px] uppercase tracking-wider text-slate-600 w-6 text-right shrink-0">{idx + 1}</div>
                <Input
                  value={label}
                  onChange={(e) => updateLabel(idx, e.target.value)}
                  placeholder="Visible label (e.g. Mud Truck Pull)"
                  className="flex-1 bg-[#07090d] border-white/10 text-white text-sm h-9"
                  data-testid={`service-type-label-${idx}`}
                />
                <Input
                  value={key}
                  onChange={(e) => updateKey(idx, e.target.value)}
                  placeholder="key"
                  className="w-32 bg-[#07090d] border-white/10 text-slate-400 text-xs font-mono h-9"
                  data-testid={`service-type-key-${idx}`}
                  title="Internal key — auto-generated from label if you type the label first."
                />
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="p-2 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                  data-testid={`service-type-remove-${idx}`}
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {dirty && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between gap-3 bg-amber-500/[0.04]">
            <div className="text-xs text-amber-200/80 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Unsaved changes
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
        )}
      </Card>

      {/* Coming soon teaser — sets expectations for Mike */}
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden opacity-70" data-testid="upcoming-modules">
        <div className="px-5 py-4 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-slate-500" />
          <div className="text-sm font-semibold text-slate-400">Coming next in this Editor</div>
        </div>
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            'Body Types editor',
            'Charge Catalog editor (28 line items)',
            'Call Form Fields toggles (which sections show)',
            'Menu Bar customizer (active / inactive items)',
            'Custom Buttons + Custom Tabs',
            'Inline edit pencils on every page',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs text-slate-500 py-1.5">
              <ChevronRight className="w-3 h-3" />
              {item}
            </div>
          ))}
        </div>
      </Card>

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
                ? "This wipes every override and restores the built-in defaults for every user in your company. You can re-add later."
                : "This change will affect every dispatcher, driver, and device on your WreckerLogix account. Re-enter your password to confirm."}
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

// Silence unused-import lint warning for `auth` (kept for future per-user
// re-auth flows). Reference it harmlessly so eslint doesn't complain.
void auth;
