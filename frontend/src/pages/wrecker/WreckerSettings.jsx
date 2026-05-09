// WreckerSettings — REWRITTEN per Mike's V2 spec.
//
// Settings is for APP PREFERENCES ONLY. Anything that's an integration
// or a business connection (Square, Business Profile, Twilio, etc.)
// lives in /wrecker/connections — not here.
//
// EXACT structure Mike specified (verbatim):
//   WRECKERLOGIX SETTINGS
//     • Digital Dispatches            [toggle]
//
//   DEVICE SETTINGS
//     • Save photos to: Camera roll / WreckerLogix app   [toggle]
//     • Navigation App: Apple / Google / Hammer / Waze / TruckMap / Mapbox / Always Ask
//     • Color Scheme: Always Light / Always Dark / System Default
//     • Login with Face ID            [toggle]
//     • Customize Menu Bar
//
//   ON-SCENE CALL SETTINGS
//     • Photo Capture: Open camera first for on-scene calls    [toggle]
//
//   CALL CREATION FIELDS
//     • Reason To / Vehicle Information / Destination / Photos  [toggles]
//
//   PAYMENT SETTINGS
//     • Square Reader Settings (links into Connections)
//
//   SIRI SETTINGS
//     • Update Call Status   → Configure
//     • Driver Check In      → Configure
//     • Driver Check Out     → Configure
//
//   OTHER SETTINGS
//     • Play Holiday Greeting   [toggle]
//
// All toggles are TIER 2 (per-device localStorage). Mike's rule — these
// are personal phone preferences, not company-wide config.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon, Smartphone, Camera, FileText, CreditCard,
  Mic, Sparkles, Navigation as NavIcon, Sun, Moon, Monitor, Fingerprint,
  ListChecks, Plug, ChevronRight, Wand2, RotateCcw, Music,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

// ─── Local-storage helpers (Tier 2 / per-device) ──────────────────────
const PREF_KEY = 'wreckerlogix.settings.v1';
const DEFAULTS = {
  digital_dispatches: true,
  save_photos_to: 'camera_roll',          // 'camera_roll' | 'app'
  nav_app: 'always_ask',                  // 'apple'|'google'|'hammer'|'waze'|'truckmap'|'mapbox'|'always_ask'
  color_scheme: 'system',                 // 'light'|'dark'|'system'
  login_with_face_id: false,
  on_scene_open_camera_first: true,
  field_reason_to: true,
  field_vehicle_info: true,
  field_destination: true,
  field_photos: true,
  play_holiday_greeting: false,
  // Siri phrases — labels only (recording happens on-device on iOS).
  siri_update_call_status: 'Update call status with WreckerLogix',
  siri_driver_check_in: 'Check me in with WreckerLogix',
  siri_driver_check_out: 'Check me out with WreckerLogix',
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
}

// ─── Reusable toggle row ──────────────────────────────────────────────
function ToggleRow({ icon: Icon, label, desc, value, onChange, testid }) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-3 border-b border-white/5 last:border-b-0"
      data-testid={testid}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {Icon && <Icon className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <div className="text-sm text-white">{label}</div>
          {desc && <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        data-testid={`${testid}-switch`}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition border ${
          value
            ? 'bg-emerald-500/20 border-emerald-500/50'
            : 'bg-white/[0.04] border-white/10 hover:border-white/20'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition ${
            value ? 'translate-x-6 bg-emerald-300' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────
function Section({ icon: Icon, title, children, testid }) {
  return (
    <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid={testid}>
      <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2 bg-white/[0.01]">
        {Icon && <Icon className="w-3.5 h-3.5 text-amber-400" />}
        <span className="text-[11px] uppercase tracking-widest text-amber-400/90 font-bold">{title}</span>
      </div>
      <div className="px-5 py-1">{children}</div>
    </Card>
  );
}

// ─── Selector row (for navigation app, color scheme, etc.) ────────────
function SelectRow({ icon: Icon, label, desc, value, onChange, options, testid }) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-3 border-b border-white/5 last:border-b-0"
      data-testid={testid}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {Icon && <Icon className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <div className="text-sm text-white">{label}</div>
          {desc && <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>}
        </div>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-44 bg-[#07090d] border-white/10 text-white text-sm h-9 shrink-0" data-testid={`${testid}-trigger`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Configure-action row (for Siri phrase setup) ─────────────────────
function ConfigureRow({ label, desc, phrase, onConfigure, testid }) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-3 border-b border-white/5 last:border-b-0"
      data-testid={testid}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white">{label}</div>
        {desc && <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>}
        <div className="text-[12px] text-amber-300/90 mt-1.5 italic font-mono">"{phrase}"</div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onConfigure}
        className="border-white/10 text-slate-300 hover:bg-white/[0.04] shrink-0"
        data-testid={`${testid}-configure`}
      >
        Configure
      </Button>
    </div>
  );
}

// ─── Link row (for Square Reader → Connections) ───────────────────────
function LinkRow({ icon: Icon, label, desc, onClick, badge, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="w-full flex items-center justify-between gap-3 py-3 border-b border-white/5 last:border-b-0 text-left hover:bg-white/[0.02] -mx-5 px-5 transition"
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {Icon && <Icon className="w-4 h-4 text-sky-300 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <div className="text-sm text-white">{label}</div>
          {desc && <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>}
        </div>
      </div>
      {badge && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-bold uppercase tracking-wider shrink-0">
          {badge}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────
export default function WreckerSettings() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(loadPrefs());

  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const set = (key, value) => setPrefs((p) => ({ ...p, [key]: value }));

  const resetToDefaults = () => {
    setPrefs({ ...DEFAULTS });
    toast.success('Settings reset to defaults on this device.');
  };

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-5" data-testid="wrecker-settings-page">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-500 mb-1">
            <SettingsIcon className="w-3.5 h-3.5" />
            Settings
          </div>
          <h1 className="text-2xl font-bold text-white">App Preferences</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl leading-relaxed">
            Personal preferences for this device only. For company-wide config (Square, Business Profile, customer integrations), see{' '}
            <button
              onClick={() => navigate('/wrecker/connections')}
              className="text-sky-300 hover:text-sky-200 underline underline-offset-2"
              data-testid="settings-link-connections"
            >Connections</button>.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resetToDefaults}
          className="border-white/10 text-slate-300 hover:bg-white/[0.04] shrink-0"
          data-testid="settings-reset"
        >
          <RotateCcw className="w-4 h-4 mr-1" /> Reset
        </Button>
      </div>

      {/* 1. WRECKERLOGIX SETTINGS */}
      <Section icon={Sparkles} title="WreckerLogix Settings" testid="section-wreckerlogix-settings">
        <ToggleRow
          icon={Sparkles}
          label="Digital Dispatches"
          desc="Auto-route incoming dispatches digitally instead of voice-only."
          value={prefs.digital_dispatches}
          onChange={(v) => set('digital_dispatches', v)}
          testid="pref-digital-dispatches"
        />
      </Section>

      {/* 2. DEVICE SETTINGS */}
      <Section icon={Smartphone} title="Device Settings" testid="section-device-settings">
        <SelectRow
          icon={Camera}
          label="Save photos to"
          desc="Where new job photos land on this phone."
          value={prefs.save_photos_to}
          onChange={(v) => set('save_photos_to', v)}
          options={[
            ['camera_roll', 'Camera Roll'],
            ['app', 'WreckerLogix App Only'],
          ]}
          testid="pref-save-photos"
        />
        <SelectRow
          icon={NavIcon}
          label="Navigation App"
          desc="Which map opens when you tap a Navigate button."
          value={prefs.nav_app}
          onChange={(v) => set('nav_app', v)}
          options={[
            ['apple', 'Apple Maps'],
            ['google', 'Google Maps'],
            ['hammer', 'Hammer'],
            ['waze', 'Waze'],
            ['truckmap', 'TruckMap'],
            ['mapbox', 'Mapbox'],
            ['always_ask', 'Always Ask Me'],
          ]}
          testid="pref-nav-app"
        />
        <SelectRow
          icon={
            prefs.color_scheme === 'light' ? Sun :
            prefs.color_scheme === 'dark' ? Moon : Monitor
          }
          label="Color Scheme"
          desc="Light, dark, or follow your phone's setting."
          value={prefs.color_scheme}
          onChange={(v) => set('color_scheme', v)}
          options={[
            ['light', 'Always Light'],
            ['dark', 'Always Dark'],
            ['system', 'System Default'],
          ]}
          testid="pref-color-scheme"
        />
        <ToggleRow
          icon={Fingerprint}
          label="Login with Face ID"
          desc="Skip the password and unlock with biometrics."
          value={prefs.login_with_face_id}
          onChange={(v) => set('login_with_face_id', v)}
          testid="pref-face-id"
        />
        <LinkRow
          icon={Wand2}
          label="Customize Menu Bar"
          desc="Pick which items show in your sidebar (Active vs Inactive)."
          onClick={() => navigate('/wrecker/customize')}
          badge="Editor"
          testid="pref-customize-menu"
        />
      </Section>

      {/* 3. ON-SCENE CALL SETTINGS */}
      <Section icon={Camera} title="On-Scene Call Settings" testid="section-on-scene">
        <ToggleRow
          icon={Camera}
          label="Open camera first for on-scene calls"
          desc="When you arrive on-scene, jump straight to the camera so the first photo is one tap away."
          value={prefs.on_scene_open_camera_first}
          onChange={(v) => set('on_scene_open_camera_first', v)}
          testid="pref-on-scene-camera"
        />
      </Section>

      {/* 4. CALL CREATION FIELDS */}
      <Section icon={ListChecks} title="Call Creation Fields" testid="section-call-fields">
        <div className="text-[11px] text-slate-500 py-2 italic">
          Toggles control which sections appear when you create a new call.
        </div>
        <ToggleRow
          label="Reason To"
          desc="Why the call is being made (PPI, Police, Private, Motor Club, etc.)"
          value={prefs.field_reason_to}
          onChange={(v) => set('field_reason_to', v)}
          testid="pref-field-reason-to"
        />
        <ToggleRow
          label="Vehicle Information"
          desc="VIN, plate, make, model, color, drivable, has-keys."
          value={prefs.field_vehicle_info}
          onChange={(v) => set('field_vehicle_info', v)}
          testid="pref-field-vehicle"
        />
        <ToggleRow
          label="Destination"
          desc="Drop-off address."
          value={prefs.field_destination}
          onChange={(v) => set('field_destination', v)}
          testid="pref-field-destination"
        />
        <ToggleRow
          label="Photos"
          desc="Photo capture section on the new call form."
          value={prefs.field_photos}
          onChange={(v) => set('field_photos', v)}
          testid="pref-field-photos"
        />
      </Section>

      {/* 5. PAYMENT SETTINGS */}
      <Section icon={CreditCard} title="Payment Settings" testid="section-payment-settings">
        <LinkRow
          icon={CreditCard}
          label="Square Reader Settings"
          desc="Pair Tap-to-Pay, view SDK status, manage devices, and connect Square Card Processing."
          onClick={() => navigate('/wrecker/connections')}
          badge="Connections"
          testid="pref-square-reader"
        />
      </Section>

      {/* 6. SIRI SETTINGS */}
      <Section icon={Mic} title="Siri Settings" testid="section-siri">
        <div className="text-[11px] text-slate-500 py-2 italic">
          Tap Configure to record a Siri phrase that triggers each WreckerLogix action.
        </div>
        <ConfigureRow
          label="Update Call Status"
          desc="Trigger to update the active job's status hands-free."
          phrase={prefs.siri_update_call_status}
          onConfigure={() => toast('Open the Shortcuts app on your iPhone to record this phrase.', { description: 'Apple requires Siri phrases be recorded device-side.' })}
          testid="pref-siri-status"
        />
        <ConfigureRow
          label="Driver Check In"
          desc="Voice trigger to clock in for a shift."
          phrase={prefs.siri_driver_check_in}
          onConfigure={() => toast('Open the Shortcuts app on your iPhone to record this phrase.')}
          testid="pref-siri-checkin"
        />
        <ConfigureRow
          label="Driver Check Out"
          desc="Voice trigger to clock out at end of shift."
          phrase={prefs.siri_driver_check_out}
          onConfigure={() => toast('Open the Shortcuts app on your iPhone to record this phrase.')}
          testid="pref-siri-checkout"
        />
      </Section>

      {/* 7. OTHER SETTINGS */}
      <Section icon={Music} title="Other Settings" testid="section-other">
        <ToggleRow
          icon={Music}
          label="Play Holiday Greeting"
          desc="Plays a short seasonal sound when starting a job in November–December."
          value={prefs.play_holiday_greeting}
          onChange={(v) => set('play_holiday_greeting', v)}
          testid="pref-holiday"
        />
      </Section>

      {/* Footer note — clarifies Tier 2 scope */}
      <div className="text-[11px] text-slate-600 text-center pt-2">
        Saved on this device only. Switch to <button onClick={() => navigate('/wrecker/customize')} className="text-amber-400 hover:text-amber-300 underline underline-offset-2" data-testid="settings-link-customize">Customize</button> for company-wide changes, or{' '}
        <button onClick={() => navigate('/wrecker/connections')} className="text-sky-400 hover:text-sky-300 underline underline-offset-2" data-testid="settings-link-connections-footer">Connections</button> for integrations.
      </div>
    </div>
  );
}
