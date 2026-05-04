import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  PhoneCall,
  Plus,
  Trash2,
  Edit3,
  ShieldAlert,
  Loader2,
  UserPlus,
} from 'lucide-react';

const BLANK_FORM = { id: null, name: '', phone: '', role: '', notes: '', active: true };

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
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
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

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(BLANK_FORM);
    setDialogOpen(true);
  };

  const openEdit = (c) => {
    setForm({
      id: c.id,
      name: c.name || '',
      phone: c.phone || '',
      role: c.role || '',
      notes: c.notes || '',
      active: c.active !== false,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!form.phone.trim()) {
      toast.error('Phone is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        role: form.role.trim() || null,
        notes: form.notes.trim() || null,
        channels: ['sms'],
        active: !!form.active,
      };
      if (form.id) {
        await api.put(`/emergency-contacts/${form.id}`, payload);
        toast.success('Emergency contact updated');
      } else {
        await api.post('/emergency-contacts', payload);
        toast.success('Emergency contact added');
      }
      setDialogOpen(false);
      setForm(BLANK_FORM);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/emergency-contacts/${deleteTarget.id}`);
      toast.success(`${deleteTarget.name} removed from emergency contacts`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to delete contact');
    }
  };

  const activeCount = contacts.filter((c) => c.active !== false).length;

  return (
    <div className="p-8 space-y-6" data-testid="admin-settings-page">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-400 font-semibold">
          FLEET COMMAND CENTER
        </div>
        <h1 className="text-2xl font-bold text-white mt-1">Fleet Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Configure how RoadBoss reaches your team when things go sideways.
        </p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800" data-testid="emergency-contacts-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-300" />
              Emergency crash contacts
            </CardTitle>
            <CardDescription className="text-zinc-400 mt-1">
              Whenever a driver doesn&apos;t cancel a CrashGuardian alert within 20 seconds, these
              numbers receive an immediate SMS with the driver, severity, and last-known location.
            </CardDescription>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Badge
                data-testid="active-count-badge"
                className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
              >
                {activeCount} active
              </Badge>
              <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700">
                {contacts.length} total
              </Badge>
              <span className="text-xs text-zinc-500">
                Also triggers web push to all fleet admins with push enabled.
              </span>
            </div>
          </div>
          <Button
            onClick={openCreate}
            data-testid="add-contact-btn"
            className="bg-sky-500 text-slate-950 hover:bg-sky-400"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add contact
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-400 text-sm py-8">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading contacts…
            </div>
          ) : contacts.length === 0 ? (
            <div
              data-testid="empty-contacts"
              className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-center"
            >
              <UserPlus className="h-8 w-8 text-zinc-500 mx-auto mb-3" />
              <div className="text-sm font-medium text-white">No emergency contacts yet</div>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                Add your safety director, night dispatcher, or next-of-kin so CrashGuardian can reach
                them the instant a driver doesn&apos;t respond.
              </p>
              <Button
                onClick={openCreate}
                className="mt-4 bg-sky-500 text-slate-950 hover:bg-sky-400"
                data-testid="empty-add-contact-btn"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Add your first contact
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-zinc-800">
                  <TableHead className="text-zinc-400">Name</TableHead>
                  <TableHead className="text-zinc-400">Phone</TableHead>
                  <TableHead className="text-zinc-400">Role</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow
                    key={c.id}
                    data-testid={`contact-row-${c.id}`}
                    className="border-zinc-800 hover:bg-white/[0.02]"
                  >
                    <TableCell>
                      <div className="text-sm font-medium text-white">{c.name}</div>
                      {c.notes ? (
                        <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{c.notes}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-zinc-200">
                        <PhoneCall className="h-3.5 w-3.5 text-sky-300" />
                        {formatPhone(c.phone)}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-300">{c.role || '—'}</TableCell>
                    <TableCell>
                      {c.active !== false ? (
                        <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-zinc-800 text-zinc-400 border border-zinc-700">
                          Paused
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(c)}
                        data-testid={`edit-contact-${c.id}`}
                        className="text-sky-300 hover:bg-sky-500/10"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(c)}
                        data-testid={`delete-contact-${c.id}`}
                        className="text-rose-300 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
        <AlertTriangle className="h-5 w-5 text-amber-300 mt-0.5" />
        <div>
          <div className="font-semibold">How the crash alert pipeline uses this list</div>
          <p className="text-amber-100/80 text-xs mt-1 leading-relaxed">
            When a CrashGuardian event is <strong>confirmed</strong>, RoadBoss will: (1) push-notify
            every admin with push enabled, (2) text the active numbers on this list, and (3) text
            every fleet/super admin with a phone on their profile. Numbers stored in the legacy{' '}
            <code className="text-amber-200">NOTIFY_CRASH_CONTACTS</code> env are merged in for
            backward-compatibility, so existing deployments keep working.
          </p>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white" data-testid="contact-dialog">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit emergency contact' : 'Add emergency contact'}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Phone numbers are normalized to E.164 (US). Duplicate numbers are rejected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="contact-name" className="text-zinc-300 text-xs uppercase tracking-wider">
                Name
              </Label>
              <Input
                id="contact-name"
                data-testid="contact-name-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Mike Ward"
                className="bg-zinc-950 border-zinc-700 text-white"
                maxLength={80}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-phone" className="text-zinc-300 text-xs uppercase tracking-wider">
                Phone
              </Label>
              <Input
                id="contact-phone"
                data-testid="contact-phone-input"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="765-480-8889 or +17654808889"
                className="bg-zinc-950 border-zinc-700 text-white"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-role" className="text-zinc-300 text-xs uppercase tracking-wider">
                Role (optional)
              </Label>
              <Input
                id="contact-role"
                data-testid="contact-role-input"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="Safety Director, Night Dispatch, Spouse…"
                className="bg-zinc-950 border-zinc-700 text-white"
                maxLength={60}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-notes" className="text-zinc-300 text-xs uppercase tracking-wider">
                Notes (optional)
              </Label>
              <Textarea
                id="contact-notes"
                data-testid="contact-notes-input"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="When to prefer them, anything dispatch should know."
                className="bg-zinc-950 border-zinc-700 text-white min-h-[80px]"
                maxLength={280}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="contact-active"
                data-testid="contact-active-toggle"
                type="checkbox"
                checked={!!form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-sky-500 focus:ring-sky-500"
              />
              <label htmlFor="contact-active" className="text-sm text-zinc-200">
                Active — include in crash alert notifications
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-zinc-700 text-zinc-200"
              data-testid="contact-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={saving}
              data-testid="contact-save-btn"
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {form.id ? 'Save changes' : 'Add contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white" data-testid="delete-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-300" /> Remove emergency contact?
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {deleteTarget ? (
                <>
                  <strong className="text-white">{deleteTarget.name}</strong> ({formatPhone(deleteTarget.phone)}) will
                  no longer receive crash alerts from RoadBoss.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="border-zinc-700 text-zinc-200"
              data-testid="delete-cancel-btn"
            >
              Keep contact
            </Button>
            <Button
              onClick={confirmDelete}
              data-testid="delete-confirm-btn"
              className="bg-rose-500 text-white hover:bg-rose-400"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
