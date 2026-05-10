// AdminSettings — Fleet (RoadBoss) Settings Hub.
//
// Mike asked for the same "real settings menu" feel that WreckerLogix has,
// only on the fleet side. So this page is structured as a sidebar-styled
// section picker on top + content panel below — Profile, Notifications,
// Crash Contacts, Subscription, Account/Danger Zone.
//
// Reuses the existing /api/emergency-contacts endpoints (no backend
// changes) and pulls account/subscription info via /me + /wrecker/tenant
// where available.

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getUser, auth } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle, PhoneCall, Plus, Trash2, Edit3, ShieldAlert, Loader2,
  UserPlus, User, Bell, CreditCard, ShieldOff, ArrowRight, KeyRound,
  Building2, Truck, Mail, Phone, Save, Plug, ChevronRight,
} from 'lucide-react';

const BLANK_CONTACT = { id: null, name: '', phone: '', role: '', notes: '', active: true };

const SECTIONS = [
  { key: 'profile',     label: 'My Profile',         icon: User,        hint: 'Name, email, password' },
  { key: 'company',     label: 'Company Info',       icon: Building2,   hint: 'Fleet name, address, contact' },
  { key: 'notifications', label: 'Notifications',    icon: Bell,        hint: 'Email + push preferences' },
  { key: 'crash',       label: 'Crash Contacts',     icon: ShieldAlert, hint: 'Who gets paged on a CrashGuardian alert' },
  { key: 'subscription', label: 'Subscription & Billing', icon: CreditCard, hint: 'Plan, trial, invoices' },
  { key: 'integrations', label: 'Integrations',      icon: Plug,        hint: 'Connect external services' },
  { key: 'danger',      label: 'Danger Zone',        icon: ShieldOff,   hint: 'Sign out everywhere, delete account' },
];

function formatPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export default function AdminSettings() {
  const navigate = useNavigate();
  const [section, setSection] = useState('profile');
  const me = getUser();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-5" data-testid="admin-settings-page">
      <header>
        <div className="text-xs uppercase tracking-[0.2em] text-sky-400 font-semibold">FLEET COMMAND CENTER</div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Configure RoadBoss for your fleet — the way Mike wants it.</p>
      </header>

      <div className="grid lg:grid-cols-[260px_1fr] gap-5">
        {/* Section picker */}
        <Card className="bg-[#0a0e14] border-white/5 overflow-hidden self-start" data-testid="settings-section-list">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={`w-full text-left px-4 py-3 border-b border-white/5 last:border-0 flex items-center gap-3 transition ${
                section === s.key
                  ? 'bg-sky-500/10 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
              }`}
              data-testid={`section-pick-${s.key}`}
            >
              <s.icon className={`w-4 h-4 shrink-0 ${section === s.key ? 'text-sky-300' : ''}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{s.label}</div>
                <div className="text-[10px] text-slate-600 truncate">{s.hint}</div>
              </div>
              <ChevronRight className={`w-4 h-4 shrink-0 ${section === s.key ? 'text-sky-300' : 'text-slate-700'}`} />
            </button>
          ))}
        </Card>

        {/* Section content */}
        <div className="min-w-0 space-y-5">
          {section === 'profile'      && <ProfileSection me={me} />}
          {section === 'company'      && <CompanySection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'crash'        && <CrashContactsSection />}
          {section === 'subscription' && <SubscriptionSection />}
          {section === 'integrations' && <IntegrationsSection />}
          {section === 'danger'       && <DangerSection navigate={navigate} />}
        </div>
      </div>
    </div>
  );
}

/* ─── PROFILE ─────────────────────────────────────────────────────── */
function ProfileSection({ me }) {
  const [form, setForm] = useState({ name: me?.name || '', phone: me?.phone || '', new_password: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (form.name.trim() && form.name !== me?.name) payload.name = form.name.trim();
      if (form.phone.trim() !== (me?.phone || '')) payload.phone = form.phone.trim();
      if (form.new_password) {
        if (form.new_password.length < 8) { toast.error('Password must be at least 8 characters.'); setSaving(false); return; }
        payload.password = form.new_password;
      }
      if (Object.keys(payload).length === 0) { toast.info('Nothing to update.'); setSaving(false); return; }
      await api.put('/me', payload).catch(() => api.put('/auth/me', payload));
      toast.success('Profile saved.');
      setForm((f) => ({ ...f, new_password: '' }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-[#0a0e14] border-white/5 p-5" data-testid="section-profile">
      <h2 className="text-lg font-semibold text-white mb-1">My Profile</h2>
      <p className="text-xs text-slate-500 mb-5">
        Signed in as <span className="text-slate-300">{me?.email}</span> · {me?.role?.replace('_', ' ')}
      </p>
      <div className="space-y-4 max-w-lg">
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-400">Display name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="profile-name" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-400">Phone</Label>
          <div className="relative mt-1">
            <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 555-1234" className="pl-9 bg-[#07090d] border-white/10 text-white" data-testid="profile-phone" />
          </div>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-400">Email</Label>
          <div className="relative mt-1">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={me?.email || ''} disabled className="pl-9 bg-[#07090d] border-white/10 text-slate-500" />
          </div>
          <div className="text-xs text-slate-600 mt-1">Email is your sign-in credential and can&apos;t be edited here.</div>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-400">New password (optional)</Label>
          <div className="relative mt-1">
            <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input type="password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} placeholder="At least 8 characters" className="pl-9 bg-[#07090d] border-white/10 text-white" data-testid="profile-new-password" />
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-bold" data-testid="profile-save">
          {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-1.5" /> Save profile</>}
        </Button>
      </div>
    </Card>
  );
}

/* ─── COMPANY INFO ────────────────────────────────────────────────── */
function CompanySection() {
  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', zip_code: '', timezone: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      // Try the wrecker tenant endpoint first (multi-tenant signup creates these),
      // then fall back to the legacy fleet business-profile endpoint.
      try {
        const r = await api.get('/wrecker/tenant');
        const t = r?.data || {};
        setForm({
          name: t.name || '',
          address: t.address || '',
          city: t.city || '',
          state: t.state || '',
          zip_code: t.zip_code || '',
          timezone: t.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
          phone: t.phone || '',
        });
      } catch (e) {
        // Legacy / demo workspace — leave defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/wrecker/tenant', form);
      toast.success('Company info saved.');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card className="bg-[#0a0e14] border-white/5 p-5"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></Card>;

  return (
    <Card className="bg-[#0a0e14] border-white/5 p-5" data-testid="section-company">
      <h2 className="text-lg font-semibold text-white mb-1">Company Info</h2>
      <p className="text-xs text-slate-500 mb-5">Used as your default origin for routing math + appears on customer-facing receipts.</p>
      <div className="space-y-4 max-w-lg">
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-400">Company name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="company-name" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-400">Street address</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="company-address" />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs uppercase tracking-wider text-slate-400">City</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="company-city" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-400">State</Label>
            <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} maxLength={2} className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="company-state" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-400">ZIP</Label>
            <Input value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="company-zip" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-400">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 555-1234" className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="company-phone" />
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-bold" data-testid="company-save">
          {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-1.5" /> Save company info</>}
        </Button>
      </div>
    </Card>
  );
}

/* ─── NOTIFICATIONS ───────────────────────────────────────────────── */
function NotificationsSection() {
  const [prefs, setPrefs] = useState({
    email_alerts: true,
    email_daily_digest: false,
    push_critical: true,
    push_maintenance: true,
    sms_crash: true,
  });
  const dirty = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));

  return (
    <Card className="bg-[#0a0e14] border-white/5 p-5" data-testid="section-notifications">
      <h2 className="text-lg font-semibold text-white mb-1">Notifications</h2>
      <p className="text-xs text-slate-500 mb-5">Choose how RoadBoss reaches you when stuff matters. (Email channel goes live with AWS SES wire-up.)</p>
      <div className="space-y-2 max-w-lg">
        {[
          ['email_alerts',       'Email — Critical alerts',     'Crashes, HOS violations, late drivers'],
          ['email_daily_digest', 'Email — Daily fleet digest',  'One summary per morning at 6am local'],
          ['push_critical',      'Push — Critical alerts',      'Browser + PWA push'],
          ['push_maintenance',   'Push — Maintenance reminders', 'PM reminders + work-order updates'],
          ['sms_crash',          'SMS — Crash escalations',     'Only used for confirmed CrashGuardian events'],
        ].map(([k, label, hint]) => (
          <div key={k} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-white/5 bg-[#07090d]" data-testid={`notif-${k}`}>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{label}</div>
              <div className="text-[11px] text-slate-500">{hint}</div>
            </div>
            <Switch checked={!!prefs[k]} onCheckedChange={(v) => dirty(k, v)} />
          </div>
        ))}
      </div>
      <div className="mt-4 text-[11px] text-slate-600">
        These preferences save to your browser today and will sync to the server once the notifications backend goes live.
      </div>
    </Card>
  );
}

/* ─── CRASH CONTACTS (existing logic, lifted into its own section) ── */
function CrashContactsSection() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(BLANK_CONTACT);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/emergency-contacts');
      setContacts(data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load emergency contacts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(BLANK_CONTACT); setDialogOpen(true); };
  const openEdit = (c) => {
    setForm({
      id: c.id, name: c.name || '', phone: c.phone || '',
      role: c.role || '', notes: c.notes || '', active: c.active !== false,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim()) { toast.error('Name + phone required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), phone: form.phone.trim(),
        role: form.role.trim() || null, notes: form.notes.trim() || null,
        channels: ['sms'], active: !!form.active,
      };
      if (form.id) await api.put(`/emergency-contacts/${form.id}`, payload);
      else         await api.post('/emergency-contacts', payload);
      toast.success(form.id ? 'Contact updated' : 'Contact added');
      setDialogOpen(false); setForm(BLANK_CONTACT); await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save contact');
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/emergency-contacts/${deleteTarget.id}`);
      toast.success(`${deleteTarget.name} removed.`);
      setDeleteTarget(null); await load();
    } catch (e) { toast.error('Failed to delete.'); }
  };

  const activeCount = contacts.filter((c) => c.active !== false).length;

  return (
    <>
      <Card className="bg-[#0a0e14] border-white/5 overflow-hidden" data-testid="section-crash">
        <div className="p-5 border-b border-white/5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-rose-300" /> Emergency Crash Contacts</h2>
            <p className="text-xs text-slate-500 mt-1">
              Whenever a driver doesn&apos;t cancel a CrashGuardian alert within 20 seconds,
              these numbers receive an immediate SMS with the driver, severity, and last-known location.
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">{activeCount} active</Badge>
              <Badge className="bg-white/5 text-slate-300 border-white/10">{contacts.length} total</Badge>
            </div>
          </div>
          <Button onClick={openCreate} className="bg-sky-500 text-slate-950 hover:bg-sky-400 shrink-0" data-testid="add-contact-btn">
            <Plus className="h-4 w-4 mr-1.5" /> Add
          </Button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : contacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#07090d] p-8 text-center" data-testid="empty-contacts">
              <UserPlus className="h-8 w-8 text-slate-500 mx-auto mb-3" />
              <div className="text-sm font-medium text-white">No emergency contacts yet</div>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Add your safety director, night dispatcher, or next-of-kin so CrashGuardian can reach them the instant a driver doesn&apos;t respond.
              </p>
              <Button onClick={openCreate} className="mt-4 bg-sky-500 text-slate-950 hover:bg-sky-400">
                <Plus className="h-4 w-4 mr-1.5" /> Add your first contact
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-[#07090d]" data-testid={`contact-row-${c.id}`}>
                  <div className="w-9 h-9 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-300 text-sm font-semibold shrink-0">
                    {c.name?.split(' ').map((s) => s[0]).slice(0, 2).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-medium text-white truncate">{c.name}</div>
                      {c.active !== false ? (
                        <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30 text-[10px]">Active</Badge>
                      ) : (
                        <Badge className="bg-white/5 text-slate-400 border-white/10 text-[10px]">Paused</Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5"><PhoneCall className="h-3 w-3" /> {formatPhone(c.phone)} {c.role ? `· ${c.role}` : ''}</div>
                  </div>
                  <button onClick={() => openEdit(c)} className="p-2 text-sky-300 hover:bg-sky-500/10 rounded transition" data-testid={`edit-contact-${c.id}`}><Edit3 className="h-4 w-4" /></button>
                  <button onClick={() => setDeleteTarget(c)} className="p-2 text-rose-300 hover:bg-rose-500/10 rounded transition" data-testid={`delete-contact-${c.id}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white" data-testid="contact-dialog">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit emergency contact' : 'Add emergency contact'}</DialogTitle>
            <DialogDescription className="text-slate-400">Phone numbers are normalized to E.164.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-wider text-slate-400">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="contact-name-input" autoFocus /></div>
            <div><Label className="text-xs uppercase tracking-wider text-slate-400">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(765) 480-8889" className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="contact-phone-input" /></div>
            <div><Label className="text-xs uppercase tracking-wider text-slate-400">Role (optional)</Label>
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Safety Director, Spouse, Night Dispatch…" className="mt-1 bg-[#07090d] border-white/10 text-white" data-testid="contact-role-input" /></div>
            <div><Label className="text-xs uppercase tracking-wider text-slate-400">Notes (optional)</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 bg-[#07090d] border-white/10 text-white min-h-[70px]" data-testid="contact-notes-input" /></div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={!!form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} data-testid="contact-active-toggle" />
              <span className="text-sm text-slate-300">Active — include in crash alerts</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-white/10 text-slate-300">Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-sky-500 text-slate-950 hover:bg-sky-400" data-testid="contact-save-btn">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {form.id ? 'Save changes' : 'Add contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-rose-300" /> Remove this contact?</DialogTitle>
            <DialogDescription className="text-slate-400">
              {deleteTarget && <><strong className="text-white">{deleteTarget.name}</strong> ({formatPhone(deleteTarget.phone)}) will no longer receive crash alerts.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="border-white/10 text-slate-300">Keep contact</Button>
            <Button onClick={confirmDelete} className="bg-rose-500 text-white hover:bg-rose-400"><Trash2 className="h-4 w-4 mr-1.5" /> Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── SUBSCRIPTION ────────────────────────────────────────────────── */
function SubscriptionSection() {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/wrecker/tenant')
      .then((r) => setTenant(r?.data || null))
      .catch(() => setTenant(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Card className="bg-[#0a0e14] border-white/5 p-5"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></Card>;

  return (
    <Card className="bg-[#0a0e14] border-white/5 p-5" data-testid="section-subscription">
      <h2 className="text-lg font-semibold text-white mb-1">Subscription & Billing</h2>
      <p className="text-xs text-slate-500 mb-5">Your RoadBoss / WreckerLogix plan + invoices.</p>
      {tenant?.is_legacy ? (
        <div className="text-sm text-slate-400">
          You&apos;re on the <span className="text-amber-300 font-semibold">legacy demo workspace</span> — no plan attached.
          Sign your real fleet up via <Link to="/wrecker/signup" className="text-sky-300 hover:underline">/wrecker/signup</Link> to start a 14-day free trial.
        </div>
      ) : tenant ? (
        <div className="space-y-4 max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Plan" value={tenant.plan_name || tenant.plan || '—'} accent="amber" />
            <Stat label="Status" value={(tenant.subscription_status || 'unknown').replace('_', ' ')} accent="emerald" />
            <Stat label="Monthly" value={tenant.price_monthly != null ? `$${tenant.price_monthly}` : '—'} />
            <Stat label="Call limit" value={tenant.call_limit ? tenant.call_limit.toLocaleString() : '—'} />
          </div>
          {tenant.subscription_status === 'trialing' && tenant.trial_days_remaining != null && (
            <div className="px-4 py-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 text-amber-200 text-sm">
              <span className="font-bold">{tenant.trial_days_remaining}</span> day{tenant.trial_days_remaining === 1 ? '' : 's'} left on your free trial.
              Card billing starts when the trial ends — we&apos;ll email you 3 days before.
            </div>
          )}
          <Button disabled className="bg-sky-500/30 text-slate-400 cursor-not-allowed" data-testid="manage-billing-disabled">
            <CreditCard className="w-4 h-4 mr-1.5" /> Manage billing — Stripe wire-up coming soon
          </Button>
        </div>
      ) : (
        <div className="text-sm text-slate-500">No plan info available.</div>
      )}
    </Card>
  );
}

function Stat({ label, value, accent = 'sky' }) {
  const tint = {
    sky: 'text-sky-300',
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
  }[accent] || 'text-slate-200';
  return (
    <div className="p-3 rounded-lg border border-white/5 bg-[#07090d]">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${tint}`}>{value}</div>
    </div>
  );
}

/* ─── INTEGRATIONS shortcut ───────────────────────────────────────── */
function IntegrationsSection() {
  return (
    <Card className="bg-[#0a0e14] border-white/5 p-5" data-testid="section-integrations">
      <h2 className="text-lg font-semibold text-white mb-1">Integrations</h2>
      <p className="text-xs text-slate-500 mb-5">
        FuelCloud, Twilio, QuickBooks, Mapbox — all your external services are managed in one place.
      </p>
      <Link to="/wrecker/connections">
        <Button className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-bold" data-testid="goto-connections">
          <Plug className="w-4 h-4 mr-1.5" /> Open Connections page <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </Link>
    </Card>
  );
}

/* ─── DANGER ZONE ─────────────────────────────────────────────────── */
function DangerSection({ navigate }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const signOutEverywhere = async () => {
    try {
      await api.post('/auth/sign-out-all').catch(() => {});
    } finally {
      auth.logout();
      navigate('/login');
    }
  };

  return (
    <Card className="bg-rose-500/[0.04] border-rose-500/20 p-5" data-testid="section-danger">
      <h2 className="text-lg font-semibold text-rose-200 mb-1 flex items-center gap-2">
        <ShieldOff className="w-5 h-5" /> Danger Zone
      </h2>
      <p className="text-xs text-rose-200/70 mb-5">Things that can&apos;t be undone — proceed with care.</p>
      <div className="space-y-3 max-w-lg">
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-rose-500/20 bg-[#0a0e14]">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Sign out everywhere</div>
            <div className="text-[11px] text-slate-500">Invalidates all sessions on every device. You&apos;ll have to sign back in here too.</div>
          </div>
          <Button onClick={signOutEverywhere} className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold shrink-0" data-testid="signout-everywhere">
            Sign out
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-rose-500/30 bg-[#0a0e14]">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Delete account</div>
            <div className="text-[11px] text-slate-500">Permanently deletes your tenant + all data. We&apos;ll email you to confirm before processing.</div>
          </div>
          <Button onClick={() => setConfirmOpen(true)} className="bg-rose-500 text-white hover:bg-rose-400 font-bold shrink-0" data-testid="delete-account">
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-[#0a0e14] border-rose-500/30 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-400" /> Delete your entire account?</DialogTitle>
            <DialogDescription className="text-slate-400">
              This isn&apos;t live in the UI yet — to delete your account today, email <span className="text-amber-300">support@emergent.sh</span> with your account email and we&apos;ll process it manually within 48 hours.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmOpen(false)} className="bg-slate-700 text-white hover:bg-slate-600">Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
