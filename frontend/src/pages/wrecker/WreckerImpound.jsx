import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Lock, Plus, KeyRound, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function WreckerImpound() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    veh_year: '', veh_make: '', veh_model: '', veh_color: '', veh_plate: '', veh_vin: '',
    owner_name: '', owner_phone: '',
    storage_location: 'Main Lot', daily_rate: '35',
    reason: 'police_hold', police_report_no: '', notes: '',
  });
  const [releaseDialog, setReleaseDialog] = useState(null);
  const [releaseForm, setReleaseForm] = useState({ released_to_name: '', payment_method: 'cash', amount_paid: '' });

  const load = useCallback(async () => {
    try { const r = await api.get('/wrecker/impounds?active_only=false'); setItems(r.data); }
    catch (e) { toast.error('Failed to load impounds'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/wrecker/impounds', {
        vehicle: {
          year: form.veh_year ? parseInt(form.veh_year) : null,
          make: form.veh_make || null, model: form.veh_model || null,
          color: form.veh_color || null, plate: form.veh_plate || null, vin: form.veh_vin || null,
        },
        owner_name: form.owner_name || null,
        owner_phone: form.owner_phone || null,
        storage_location: form.storage_location,
        daily_rate: parseFloat(form.daily_rate) || 35,
        reason: form.reason,
        police_report_no: form.police_report_no || null,
        notes: form.notes || null,
      });
      toast.success('Impound created');
      setOpen(false);
      setForm({ veh_year: '', veh_make: '', veh_model: '', veh_color: '', veh_plate: '', veh_vin: '', owner_name: '', owner_phone: '', storage_location: 'Main Lot', daily_rate: '35', reason: 'police_hold', police_report_no: '', notes: '' });
      load();
    } catch (e) { toast.error('Failed to create'); }
  };

  const release = async () => {
    if (!releaseForm.released_to_name) { toast.error('Released to whom?'); return; }
    try {
      await api.post(`/wrecker/impounds/${releaseDialog.id}/release`, {
        released_to_name: releaseForm.released_to_name,
        payment_method: releaseForm.payment_method,
        amount_paid: parseFloat(releaseForm.amount_paid || 0),
      });
      toast.success('Vehicle released');
      setReleaseDialog(null);
      setReleaseForm({ released_to_name: '', payment_method: 'cash', amount_paid: '' });
      load();
    } catch (e) { toast.error('Release failed'); }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading impound lot...</div>;

  const active = items.filter((i) => !i.released_at);
  const released = items.filter((i) => i.released_at);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80">Wrecker Mode</div>
          <h1 className="text-3xl font-bold text-white mt-1">Impound Lot</h1>
          <p className="text-sm text-slate-400 mt-1">Stored vehicles with auto-calculated daily storage fees.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="impound-new-cta" className="bg-amber-500 text-black hover:bg-amber-400">
              <Plus className="w-4 h-4 mr-1" /> New Impound
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-2xl">
            <DialogHeader><DialogTitle>New Impound Record</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Year</Label><Input value={form.veh_year} onChange={(e) => setForm({ ...form, veh_year: e.target.value })} /></div>
                <div><Label>Make</Label><Input value={form.veh_make} onChange={(e) => setForm({ ...form, veh_make: e.target.value })} /></div>
                <div><Label>Model</Label><Input value={form.veh_model} onChange={(e) => setForm({ ...form, veh_model: e.target.value })} /></div>
                <div><Label>Color</Label><Input value={form.veh_color} onChange={(e) => setForm({ ...form, veh_color: e.target.value })} /></div>
                <div><Label>Plate</Label><Input value={form.veh_plate} onChange={(e) => setForm({ ...form, veh_plate: e.target.value })} /></div>
                <div><Label>VIN</Label><Input value={form.veh_vin} onChange={(e) => setForm({ ...form, veh_vin: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Owner Name</Label><Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></div>
                <div><Label>Owner Phone</Label><Input value={form.owner_phone} onChange={(e) => setForm({ ...form, owner_phone: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Storage Location</Label><Input value={form.storage_location} onChange={(e) => setForm({ ...form, storage_location: e.target.value })} /></div>
                <div><Label>Daily Rate ($)</Label><Input type="number" step="0.01" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} /></div>
                <div>
                  <Label>Reason</Label>
                  <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                    <SelectTrigger className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="police_hold">Police Hold</SelectItem>
                      <SelectItem value="private_property">Private Property</SelectItem>
                      <SelectItem value="accident">Accident</SelectItem>
                      <SelectItem value="abandoned">Abandoned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Police Report #</Label><Input value={form.police_report_no} onChange={(e) => setForm({ ...form, police_report_no: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <DialogFooter>
                <Button type="submit" data-testid="impound-save" className="bg-amber-500 text-black hover:bg-amber-400">Create Record</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <section>
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Active ({active.length})</div>
        {active.length === 0 ? (
          <div className="hp-panel rounded-xl p-8 text-center text-slate-500 text-sm">No vehicles in impound. 🚗</div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {active.map((i) => (
              <Card key={i.id} className="p-4 bg-[#0a0e14] border-white/5" data-testid={`impound-${i.id}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {[i.vehicle?.year, i.vehicle?.color, i.vehicle?.make, i.vehicle?.model].filter(Boolean).join(' ')}
                    </div>
                    {i.vehicle?.plate && <div className="text-xs text-slate-400 mt-0.5">{i.vehicle.plate}</div>}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-300">
                    {(i.reason || '').replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> {i.storage_location}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="hp-panel rounded-md p-2">
                    <div className="text-lg font-semibold text-white">{i.days_stored || 1}</div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500">days</div>
                  </div>
                  <div className="hp-panel rounded-md p-2">
                    <div className="text-lg font-semibold text-emerald-300">${(i.accrued_storage_fee || 0).toFixed(0)}</div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500">accrued</div>
                  </div>
                </div>
                {i.police_report_no && <div className="mt-2 text-[10px] text-slate-500">Report: {i.police_report_no}</div>}
                <Button data-testid={`release-${i.id}`} size="sm" variant="outline" className="w-full mt-3 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10" onClick={() => setReleaseDialog(i)}>
                  <KeyRound className="w-3.5 h-3.5 mr-1" /> Release Vehicle
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {released.length > 0 && (
        <section>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">Recently Released</div>
          <div className="hp-panel rounded-xl divide-y divide-white/5">
            {released.slice(0, 10).map((i) => (
              <div key={i.id} className="p-3 flex items-center justify-between text-sm">
                <div>
                  <div className="text-slate-200">{[i.vehicle?.year, i.vehicle?.make, i.vehicle?.model].filter(Boolean).join(' ')}</div>
                  <div className="text-xs text-slate-500">to {i.released_to?.name} · ${(i.amount_paid || 0).toFixed(2)}</div>
                </div>
                <div className="text-xs text-slate-500">{new Date(i.released_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={!!releaseDialog} onOpenChange={(o) => !o && setReleaseDialog(null)}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white">
          <DialogHeader><DialogTitle>Release Vehicle</DialogTitle></DialogHeader>
          {releaseDialog && (
            <div className="space-y-4">
              <div className="text-sm text-slate-400">
                {[releaseDialog.vehicle?.year, releaseDialog.vehicle?.make, releaseDialog.vehicle?.model].filter(Boolean).join(' ')}
                <span className="ml-2 text-emerald-300">${(releaseDialog.accrued_storage_fee || 0).toFixed(2)} accrued</span>
              </div>
              <div><Label>Released To (Name)</Label><Input data-testid="release-name" value={releaseForm.released_to_name} onChange={(e) => setReleaseForm({ ...releaseForm, released_to_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payment Method</Label>
                  <Select value={releaseForm.payment_method} onValueChange={(v) => setReleaseForm({ ...releaseForm, payment_method: v })}>
                    <SelectTrigger className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="ach">ACH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Amount Paid ($)</Label><Input data-testid="release-amount" type="number" step="0.01" value={releaseForm.amount_paid} onChange={(e) => setReleaseForm({ ...releaseForm, amount_paid: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReleaseDialog(null)} className="border-white/10">Cancel</Button>
                <Button data-testid="confirm-release" onClick={release} className="bg-emerald-500 text-black hover:bg-emerald-400">Confirm Release</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
