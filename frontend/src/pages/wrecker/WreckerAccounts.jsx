import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Briefcase, Plus, Search, Phone, Mail, MapPin, Edit3, X, Save, Tag, Users, ShieldAlert, Building2, Wrench, Truck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const ACCOUNT_TYPES = [
  { key: 'motor_club',       label: 'Motor Club',       icon: ShieldAlert, color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { key: 'dealership',       label: 'Dealership',       icon: Building2,   color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  { key: 'fleet',            label: 'Fleet',            icon: Truck,       color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { key: 'service_shop',     label: 'Service Shop',     icon: Wrench,      color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { key: 'property_removal', label: 'Property Removal', icon: ShieldAlert, color: 'bg-red-500/15 text-red-300 border-red-500/30' },
  { key: 'police',           label: 'Police',           icon: ShieldAlert, color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  { key: 'other',            label: 'Other',            icon: Tag,         color: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
];

const DEFAULT_REASONS = [
  'Tow', 'Lockout w/o Key', 'Lockout w/ Key', 'Jumpstart', 'Tire Change',
  'Fuel Delivery', 'Winch Out', 'Extrication', 'Mobile Mechanic', 'Battery Service', 'Other',
];

const emptyForm = {
  name: '', type: 'other', contact_name: '', phone: '', email: '', address: '', billing_email: '', notes: '',
  custom_reasons: [...DEFAULT_REASONS],
};

export default function WreckerAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [reasonInput, setReasonInput] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const r = await api.get(`/wrecker/accounts?${params.toString()}`);
      setAccounts(r.data);
    } catch (e) { /* */ }
    finally { setLoading(false); }
  }, [search, typeFilter]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, custom_reasons: [...DEFAULT_REASONS] });
    setOpen(true);
  };
  const openEdit = (a) => {
    setEditingId(a.id);
    setForm({
      name: a.name || '',
      type: a.type || 'other',
      contact_name: a.contact_name || '',
      phone: a.phone || '',
      email: a.email || '',
      address: a.address || '',
      billing_email: a.billing_email || '',
      notes: a.notes || '',
      custom_reasons: a.custom_reasons?.length ? [...a.custom_reasons] : [...DEFAULT_REASONS],
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Account name required'); return; }
    try {
      if (editingId) {
        await api.put(`/wrecker/accounts/${editingId}`, form);
        toast.success('Account updated');
      } else {
        await api.post('/wrecker/accounts', form);
        toast.success('Account created');
      }
      setOpen(false);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed'); }
  };

  const removeAccount = async (a) => {
    if (!window.confirm(`Archive ${a.name}?`)) return;
    try {
      await api.delete(`/wrecker/accounts/${a.id}`);
      toast.success('Archived');
      load();
    } catch (e) { toast.error('Could not archive'); }
  };

  const addReason = () => {
    const v = reasonInput.trim();
    if (!v) return;
    if (form.custom_reasons.includes(v)) { toast.error('Already in list'); return; }
    setForm({ ...form, custom_reasons: [...form.custom_reasons, v] });
    setReasonInput('');
  };
  const removeReason = (r) => setForm({ ...form, custom_reasons: form.custom_reasons.filter((x) => x !== r) });

  const typeMeta = (key) => ACCOUNT_TYPES.find((t) => t.key === key) || ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-400">Accounts</div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-1 flex items-center gap-2"><Briefcase className="w-6 h-6 text-amber-400" /> Accounts Directory</h1>
          <p className="text-sm text-slate-400 mt-1">{accounts.length} account{accounts.length === 1 ? '' : 's'} · motor clubs, fleets, dealerships, and direct customers</p>
        </div>
        <Button data-testid="new-account-cta" onClick={openCreate} className="bg-amber-500 text-black hover:bg-amber-400 font-semibold">
          <Plus className="w-4 h-4 mr-1" /> New Account
        </Button>
      </header>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input data-testid="account-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, contact, phone..." className="bg-[#0a0e14] border-white/10 text-white pl-9" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          <FilterPill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} label="All" testId="filter-all" />
          {ACCOUNT_TYPES.map((t) => (
            <FilterPill key={t.key} active={typeFilter === t.key} onClick={() => setTypeFilter(t.key)} label={t.label} testId={`filter-${t.key}`} />
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : accounts.length === 0 ? (
        <Card className="bg-[#0a0e14] border-white/5 p-12 text-center">
          <Briefcase className="w-12 h-12 mx-auto text-slate-700 mb-2" />
          <div className="text-slate-400 text-sm">No accounts {search ? `matching "${search}"` : 'yet'}.</div>
          <Button onClick={openCreate} variant="outline" className="mt-4 border-amber-500/30 text-amber-300"><Plus className="w-4 h-4 mr-1" /> Add your first account</Button>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((a) => {
            const t = typeMeta(a.type);
            const Icon = t.icon;
            return (
              <Card key={a.id} className="p-4 bg-[#0a0e14] border-white/5 hover:border-amber-500/30 transition cursor-pointer group" data-testid={`account-${a.id}`} onClick={() => openEdit(a)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-white truncate">{a.name}</div>
                    {a.contact_name && <div className="text-xs text-slate-400 mt-0.5 truncate">Contact: {a.contact_name}</div>}
                  </div>
                  <span className={`shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border font-bold flex items-center gap-1 ${t.color}`}>
                    <Icon className="w-3 h-3" /> {t.label}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-400">
                  {a.phone && <div className="flex items-center gap-1.5 truncate"><Phone className="w-3 h-3 shrink-0" /> {a.phone}</div>}
                  {a.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 shrink-0" /> {a.email}</div>}
                  {a.address && <div className="flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 shrink-0" /> {a.address}</div>}
                </div>
                {a.custom_reasons?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Reasons ({a.custom_reasons.length})</div>
                    <div className="flex flex-wrap gap-1">
                      {a.custom_reasons.slice(0, 4).map((r) => (
                        <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/5">{r}</span>
                      ))}
                      {a.custom_reasons.length > 4 && <span className="text-[10px] text-slate-500">+{a.custom_reasons.length - 4} more</span>}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(a)} className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-white/5" data-testid={`edit-${a.id}`}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeAccount(a)} className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10" data-testid={`archive-${a.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Account' : 'New Account'}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name *</Label>
                <Input data-testid="account-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. AAA Indiana, Allstate, Adams Auto" required />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger data-testid="account-type" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Billing Email</Label><Input type="email" value={form.billing_email} onChange={(e) => setForm({ ...form, billing_email: e.target.value })} /></div>
            </div>
            <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>

            {/* Custom reasons */}
            <div>
              <Label className="flex items-center gap-1"><Tag className="w-3 h-3" /> Custom Service Reasons (shown in this account's reason dropdown when creating jobs)</Label>
              <div className="flex gap-2 mb-2">
                <Input data-testid="reason-input" value={reasonInput} onChange={(e) => setReasonInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReason(); } }} placeholder="e.g. RV Tow, Heavy Duty Tow, Battery Service..." className="bg-[#07090d] border-white/10 text-white text-sm" />
                <Button type="button" data-testid="reason-add" onClick={addReason} size="sm" className="bg-amber-500 text-black hover:bg-amber-400 shrink-0"><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-white/[0.02] rounded border border-white/5 min-h-[60px]">
                {form.custom_reasons.length === 0 && <div className="text-xs text-slate-500 italic">No reasons yet — add the ones this account requests most often.</div>}
                {form.custom_reasons.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-200 border border-amber-500/20" data-testid={`reason-pill-${r}`}>
                    {r}
                    <button type="button" onClick={() => removeReason(r)} className="hover:text-red-300"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="border-white/10">Cancel</Button>
              <Button type="submit" data-testid="account-save" className="bg-amber-500 text-black hover:bg-amber-400"><Save className="w-4 h-4 mr-1" /> Save Account</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterPill({ active, onClick, label, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`shrink-0 text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border transition ${active ? 'bg-amber-500 text-black border-amber-400 font-semibold' : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
    >
      {label}
    </button>
  );
}
