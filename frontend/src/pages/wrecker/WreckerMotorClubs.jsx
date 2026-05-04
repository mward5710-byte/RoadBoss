import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Building2, Plus, Phone, Mail, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const BLANK = { name: '', contact_phone: '', billing_email: '', default_rate_light: 75, default_rate_medium: 125, default_rate_heavy: 250, notes: '' };

export default function WreckerMotorClubs() {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);

  const load = useCallback(async () => {
    try { const r = await api.get('/wrecker/motor-clubs'); setClubs(r.data); }
    catch (e) { toast.error('Failed to load motor clubs'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(BLANK); setOpen(true); };
  const openEdit = (c) => { setEditing(c.id); setForm({ ...BLANK, ...c }); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        contact_phone: form.contact_phone || null,
        billing_email: form.billing_email || null,
        default_rate_light: parseFloat(form.default_rate_light) || 0,
        default_rate_medium: parseFloat(form.default_rate_medium) || 0,
        default_rate_heavy: parseFloat(form.default_rate_heavy) || 0,
        notes: form.notes || null,
      };
      if (editing) await api.put(`/wrecker/motor-clubs/${editing}`, payload);
      else await api.post('/wrecker/motor-clubs', payload);
      toast.success(editing ? 'Updated' : 'Added');
      setOpen(false); load();
    } catch (e) { toast.error('Save failed'); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try { await api.delete(`/wrecker/motor-clubs/${c.id}`); toast.success('Deleted'); load(); }
    catch (e) { toast.error('Delete failed'); }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading motor clubs...</div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80">Wrecker Mode</div>
          <h1 className="text-3xl font-bold text-white mt-1">Motor Clubs</h1>
          <p className="text-sm text-slate-400 mt-1">Accounts and rate sheets for AAA, Agero, Allied, Geico, Honk and friends.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="motor-club-new-cta" onClick={openNew} className="bg-amber-500 text-black hover:bg-amber-400">
              <Plus className="w-4 h-4 mr-1" /> Add Motor Club
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0a0e14] border-white/10 text-white">
            <DialogHeader><DialogTitle>{editing ? 'Edit Motor Club' : 'Add Motor Club'}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-4">
              <div><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contact Phone</Label><Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
                <div><Label>Billing Email</Label><Input value={form.billing_email} onChange={(e) => setForm({ ...form, billing_email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Light Rate ($)</Label><Input type="number" step="0.01" value={form.default_rate_light} onChange={(e) => setForm({ ...form, default_rate_light: e.target.value })} /></div>
                <div><Label>Medium Rate ($)</Label><Input type="number" step="0.01" value={form.default_rate_medium} onChange={(e) => setForm({ ...form, default_rate_medium: e.target.value })} /></div>
                <div><Label>Heavy Rate ($)</Label><Input type="number" step="0.01" value={form.default_rate_heavy} onChange={(e) => setForm({ ...form, default_rate_heavy: e.target.value })} /></div>
              </div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="border-white/10">Cancel</Button>
                <Button data-testid="motor-club-save" type="submit" className="bg-amber-500 text-black hover:bg-amber-400">{editing ? 'Update' : 'Create'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {clubs.map((c) => (
          <Card key={c.id} className="p-4 bg-[#0a0e14] border-white/5" data-testid={`motor-club-${c.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Building2 className="w-4 h-4 text-amber-300" /></div>
                <div>
                  <div className="text-sm font-semibold text-white">{c.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Account</div>
                </div>
              </div>
              <div className="flex gap-1">
                <Button data-testid={`edit-${c.id}`} variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5 text-slate-400" /></Button>
                <Button data-testid={`delete-${c.id}`} variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(c)}><Trash2 className="w-3.5 h-3.5 text-slate-400" /></Button>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              {c.contact_phone && <div className="flex items-center gap-2 text-slate-300"><Phone className="w-3 h-3" /> {c.contact_phone}</div>}
              {c.billing_email && <div className="flex items-center gap-2 text-slate-400"><Mail className="w-3 h-3" /> {c.billing_email}</div>}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1 text-center">
              <div className="hp-panel rounded p-1.5"><div className="text-sm font-semibold text-white">${c.default_rate_light}</div><div className="text-[9px] uppercase text-slate-500">Light</div></div>
              <div className="hp-panel rounded p-1.5"><div className="text-sm font-semibold text-white">${c.default_rate_medium}</div><div className="text-[9px] uppercase text-slate-500">Medium</div></div>
              <div className="hp-panel rounded p-1.5"><div className="text-sm font-semibold text-white">${c.default_rate_heavy}</div><div className="text-[9px] uppercase text-slate-500">Heavy</div></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
