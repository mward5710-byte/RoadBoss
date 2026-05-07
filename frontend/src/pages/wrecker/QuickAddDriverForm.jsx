// QuickAddDriverForm — inline, dialog-free driver creation widget.
//
// Mike's rule: dispatcher never leaves the assignment surface. They tap
// "+ Quick Add", fill name (only required field), submit, and the new
// driver appears in the same list — ready to assign. One screen, one flow.
//
// This form is embedded in TWO places:
//   1. Pick Driver dialog on /wrecker (Dispatch Board)
//   2. Driver Assignment card on /wrecker/jobs/:id (Job Cockpit)
//
// It does NOT render its own dialog wrapper — callers control the surface.
//
// Props:
//   onAdded(driver)  — fired after the API returns the freshly created driver
//   onCancel()       — fired when user clicks Cancel
//   submitLabel      — optional override for the submit button label

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function QuickAddDriverForm({ onAdded, onCancel, submitLabel = 'Add to Rotation' }) {
  const [form, setForm] = useState({ name: '', truck_number: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    const name = (form.name || '').trim();
    if (name.length < 2) {
      toast.error('Driver name is required.');
      return;
    }
    setSaving(true);
    try {
      const r = await api.post('/wrecker/drivers/quick-add', {
        name,
        truck_number: form.truck_number || null,
        phone: form.phone || null,
        email: form.email || null,
      });
      const drv = r.data?.driver || r.data;
      toast.success(
        `${drv?.name || 'Driver'} added${drv?.truck_number ? ' · Truck #' + drv.truck_number : ''} — ready to dispatch`
      );
      setForm({ name: '', truck_number: '', phone: '', email: '' });
      onAdded?.(drv);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not add driver.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      data-testid="quick-add-driver-inline"
      className="rounded-lg border border-sky-500/30 bg-sky-500/[0.04] p-3 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-sky-300 font-bold">
          <UserPlus className="w-3.5 h-3.5" /> Quick Add Driver
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            data-testid="quick-add-inline-close"
            className="text-slate-500 hover:text-slate-200 p-0.5 rounded"
            aria-label="Close quick add"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">
          Driver Name <span className="text-red-400">*</span>
        </label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
          placeholder="e.g. John Smith"
          className="w-full bg-[#07090d] border border-white/10 text-white text-sm rounded-md h-9 px-3 focus:outline-none focus:border-sky-500/60"
          data-testid="qa-inline-name"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Truck #</label>
          <input
            value={form.truck_number}
            onChange={(e) => setForm({ ...form, truck_number: e.target.value })}
            placeholder="7"
            className="w-full bg-[#07090d] border border-white/10 text-white text-sm rounded-md h-9 px-3 focus:outline-none focus:border-sky-500/60"
            data-testid="qa-inline-truck"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Phone</label>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="555-123-4567"
            className="w-full bg-[#07090d] border border-white/10 text-white text-sm rounded-md h-9 px-3 focus:outline-none focus:border-sky-500/60"
            data-testid="qa-inline-phone"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">
          Email <span className="text-slate-600 normal-case font-normal">(optional)</span>
        </label>
        <input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="Auto-generated if blank"
          className="w-full bg-[#07090d] border border-white/10 text-white text-sm rounded-md h-9 px-3 focus:outline-none focus:border-sky-500/60"
          data-testid="qa-inline-email"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="border-white/10 text-slate-300 h-9"
            data-testid="qa-inline-cancel"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={saving || !form.name.trim()}
          className="bg-sky-500 text-slate-950 hover:bg-sky-400 font-semibold h-9"
          data-testid="qa-inline-submit"
        >
          <UserPlus className="w-4 h-4 mr-1" /> {saving ? 'Adding…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
