import React, { useEffect, useState, useCallback } from 'react';
import { api, getUser } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Truck, Plus, Wrench, Fuel, DollarSign, AlertCircle, Camera, X, Trash2, Calendar, Edit3, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { openCameraAsDataUrl } from '@/lib/photoCapture';

const WO_KINDS = [
  { key: 'oil_change',     label: 'Oil Change' },
  { key: 'tire_rotation',  label: 'Tire Rotation' },
  { key: 'tire_replacement', label: 'Tire Replacement' },
  { key: 'brake',          label: 'Brake Service' },
  { key: 'transmission',   label: 'Transmission' },
  { key: 'engine',         label: 'Engine' },
  { key: 'inspection',     label: 'DOT Inspection' },
  { key: 'electrical',     label: 'Electrical' },
  { key: 'hydraulic',      label: 'Hydraulic / Wrecker Boom' },
  { key: 'repair',         label: 'General Repair' },
  { key: 'other',          label: 'Other' },
];

const WO_STATUS_COLORS = {
  pending:     'bg-amber-500/15 text-amber-300 border-amber-500/30',
  in_progress: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  completed:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelled:   'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const EXP_KINDS = [
  { key: 'fuel',   label: 'Fuel' },
  { key: 'parts',  label: 'Parts' },
  { key: 'tolls',  label: 'Tolls' },
  { key: 'repair', label: 'Roadside Repair' },
  { key: 'misc',   label: 'Misc' },
];

export default function WreckerTrucks() {
  const me = getUser();
  const isDriver = me?.role === 'wrecker_operator';
  const isDispatcher = ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'dispatcher'].includes(me?.role);

  const [tab, setTab] = useState('fleet');
  const [trucks, setTrucks] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [openTruck, setOpenTruck] = useState(false);
  const [truckForm, setTruckForm] = useState({ number: '', year: '', make: 'Ford', model: '', plate: '', state: 'IN', current_mileage: '', duty_class: 'Medium' });

  const [detailTruck, setDetailTruck] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [openWO, setOpenWO] = useState(false);
  const [woForm, setWoForm] = useState({ kind: 'oil_change', description: '', cost: '', vendor: '', mileage_at_service: '', status: 'completed' });

  const [openExp, setOpenExp] = useState(false);
  const [expForm, setExpForm] = useState({ truck_id: '', kind: 'fuel', amount: '', gallons: '', vendor: '', mileage: '', notes: '', receipt_data_url: '' });

  const load = useCallback(async () => {
    try {
      const [t, e] = await Promise.all([
        api.get('/wrecker/trucks').catch(() => ({ data: [] })),
        api.get('/wrecker/expenses').catch(() => ({ data: [] })),
      ]);
      setTrucks(t.data);
      setExpenses(e.data);
    } catch (e) { /* */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadWorkOrders = useCallback(async (truckId) => {
    try { const r = await api.get(`/wrecker/trucks/${truckId}/work-orders`); setWorkOrders(r.data); }
    catch (e) { setWorkOrders([]); }
  }, []);
  useEffect(() => { if (detailTruck) loadWorkOrders(detailTruck.id); }, [detailTruck, loadWorkOrders]);

  const submitTruck = async (e) => {
    e.preventDefault();
    if (!truckForm.number) return toast.error('Truck number required');
    try {
      await api.post('/wrecker/trucks', {
        number: truckForm.number,
        year: truckForm.year ? parseInt(truckForm.year) : null,
        make: truckForm.make || null,
        model: truckForm.model || null,
        plate: truckForm.plate || null,
        state: truckForm.state || null,
        current_mileage: truckForm.current_mileage ? parseInt(truckForm.current_mileage) : null,
        duty_class: truckForm.duty_class,
      });
      toast.success(`Truck #${truckForm.number} added`);
      setOpenTruck(false);
      setTruckForm({ number: '', year: '', make: 'Ford', model: '', plate: '', state: 'IN', current_mileage: '', duty_class: 'Medium' });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Could not add truck'); }
  };

  const submitWO = async (e) => {
    e.preventDefault();
    if (!detailTruck) return;
    if (!woForm.description) return toast.error('Description required');
    try {
      await api.post('/wrecker/work-orders', {
        truck_id: detailTruck.id,
        kind: woForm.kind,
        description: woForm.description,
        cost: parseFloat(woForm.cost) || 0,
        vendor: woForm.vendor || null,
        mileage_at_service: woForm.mileage_at_service ? parseInt(woForm.mileage_at_service) : null,
        status: woForm.status,
      });
      toast.success('Work order added');
      setOpenWO(false);
      setWoForm({ kind: 'oil_change', description: '', cost: '', vendor: '', mileage_at_service: '', status: 'completed' });
      loadWorkOrders(detailTruck.id);
      load();
    } catch (err) { toast.error('Could not save work order'); }
  };

  const updateWOStatus = async (wo, status) => {
    try {
      await api.put(`/wrecker/work-orders/${wo.id}`, { ...wo, status });
      loadWorkOrders(detailTruck.id);
      load();
    } catch (err) { toast.error('Status update failed'); }
  };

  const deleteWO = async (wo) => {
    if (!window.confirm('Delete this work order?')) return;
    try { await api.delete(`/wrecker/work-orders/${wo.id}`); loadWorkOrders(detailTruck.id); load(); }
    catch (err) { toast.error('Delete failed'); }
  };

  const submitExpense = async (e) => {
    e.preventDefault();
    if (!expForm.amount) return toast.error('Amount required');
    try {
      await api.post('/wrecker/expenses', {
        truck_id: expForm.truck_id || null,
        kind: expForm.kind,
        amount: parseFloat(expForm.amount),
        gallons: expForm.gallons ? parseFloat(expForm.gallons) : null,
        vendor: expForm.vendor || null,
        mileage: expForm.mileage ? parseInt(expForm.mileage) : null,
        notes: expForm.notes || null,
        receipt_data_url: expForm.receipt_data_url || null,
      });
      toast.success('Expense logged');
      setOpenExp(false);
      setExpForm({ truck_id: '', kind: 'fuel', amount: '', gallons: '', vendor: '', mileage: '', notes: '', receipt_data_url: '' });
      load();
    } catch (err) { toast.error('Could not log expense'); }
  };

  const captureReceipt = async () => {
    try {
      const dataUrl = await openCameraAsDataUrl();
      if (dataUrl) {
        setExpForm((f) => ({ ...f, receipt_data_url: dataUrl }));
        toast.success('Receipt photo attached');
      }
    } catch (err) { toast.error('Camera failed'); }
  };

  const deleteExpense = async (ex) => {
    if (!window.confirm('Delete this expense?')) return;
    try { await api.delete(`/wrecker/expenses/${ex.id}`); load(); }
    catch (err) { toast.error('Delete failed'); }
  };

  if (loading) return <div className="p-6 text-slate-400">Loading fleet...</div>;

  const totalYtdMaint = trucks.reduce((s, t) => s + (t.ytd_maintenance || 0), 0);
  const totalYtdExp = trucks.reduce((s, t) => s + (t.ytd_expenses || 0), 0);
  const openWOTotal = trucks.reduce((s, t) => s + (t.open_work_orders || 0), 0);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-400">Fleet Operations</div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-1 flex items-center gap-2"><Truck className="w-6 h-6 text-amber-400" /> Trucks · Maintenance · Expenses</h1>
          <p className="text-sm text-slate-400 mt-1">{trucks.length} trucks · ${totalYtdMaint.toFixed(0)} YTD maint · ${totalYtdExp.toFixed(0)} YTD exp · {openWOTotal} open work orders</p>
        </div>
        <div className="flex gap-2">
          <Button data-testid="new-expense-cta" onClick={() => setOpenExp(true)} variant="outline" className="border-amber-500/30 text-amber-300"><Receipt className="w-4 h-4 mr-1" /> Log Expense</Button>
          {isDispatcher && (
            <Button data-testid="new-truck-cta" onClick={() => setOpenTruck(true)} className="bg-amber-500 text-black hover:bg-amber-400 font-semibold"><Plus className="w-4 h-4 mr-1" /> Add Truck</Button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/10 rounded-lg w-fit">
        <TabBtn active={tab === 'fleet'}     onClick={() => setTab('fleet')}     icon={Truck}    label="Fleet" testId="tab-fleet" />
        <TabBtn active={tab === 'expenses'}  onClick={() => setTab('expenses')}  icon={DollarSign} label="Expenses" testId="tab-expenses" />
      </div>

      {tab === 'fleet' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {trucks.length === 0 ? (
            <Card className="col-span-full p-12 text-center bg-[#0a0e14] border-white/5">
              <Truck className="w-12 h-12 mx-auto text-slate-700 mb-2" />
              <div className="text-slate-400 text-sm">No trucks yet. Add your first one.</div>
              {isDispatcher && <Button onClick={() => setOpenTruck(true)} variant="outline" className="mt-4 border-amber-500/30 text-amber-300"><Plus className="w-4 h-4 mr-1" /> Add Truck</Button>}
            </Card>
          ) : trucks.map((t) => (
            <Card key={t.id} className="p-4 bg-[#0a0e14] border-white/5 hover:border-amber-500/30 transition cursor-pointer" data-testid={`truck-${t.id}`} onClick={() => setDetailTruck(t)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-400">Truck</div>
                  <div className="text-2xl font-bold text-white mt-0.5">#{t.number}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{[t.year, t.make, t.model].filter(Boolean).join(' ')}</div>
                </div>
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${t.status === 'active' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-red-500/15 text-red-300 border-red-500/30'}`}>{t.status}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                <Stat value={`${(t.current_mileage || 0).toLocaleString()}`} label="miles" />
                <Stat value={`$${(t.ytd_maintenance || 0).toFixed(0)}`} label="ytd maint" green />
                <Stat value={`$${(t.ytd_expenses || 0).toFixed(0)}`} label="ytd exp" />
              </div>
              {t.open_work_orders > 0 && (
                <div className="mt-2 flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                  <AlertCircle className="w-3 h-3" /> {t.open_work_orders} open work order{t.open_work_orders > 1 ? 's' : ''}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'expenses' && (
        <Card className="p-5 bg-[#0a0e14] border-white/5">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Expense Log ({expenses.length})</div>
          {expenses.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">No expenses yet. Tap <span className="text-amber-300 font-semibold">Log Expense</span> to add one.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {expenses.map((ex) => {
                const truck = trucks.find((t) => t.id === ex.truck_id);
                const kindLabel = EXP_KINDS.find((k) => k.key === ex.kind)?.label || ex.kind;
                return (
                  <div key={ex.id} className="py-3 flex items-center gap-3" data-testid={`expense-${ex.id}`}>
                    {ex.receipt_data_url ? (
                      <img src={ex.receipt_data_url} alt="receipt" className="w-12 h-12 rounded object-cover border border-white/10 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        {ex.kind === 'fuel' ? <Fuel className="w-5 h-5 text-amber-400" /> : <Receipt className="w-5 h-5 text-slate-500" />}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">${ex.amount.toFixed(2)}</span>
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10">{kindLabel}</span>
                        {truck && <span className="text-[10px] uppercase tracking-wider text-amber-300">Truck #{truck.number}</span>}
                        {ex.gallons && <span className="text-[11px] text-slate-500">· {ex.gallons} gal</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {ex.vendor || 'No vendor'} · {new Date(ex.date).toLocaleDateString()} · {ex.created_by_name || 'unknown'}
                        {ex.notes && <span className="ml-1 text-slate-400">· {ex.notes}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteExpense(ex)} className="text-slate-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Add Truck dialog */}
      <Dialog open={openTruck} onOpenChange={setOpenTruck}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-xl">
          <DialogHeader><DialogTitle>Add Truck</DialogTitle></DialogHeader>
          <form onSubmit={submitTruck} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Truck # *</Label><Input data-testid="truck-number" value={truckForm.number} onChange={(e) => setTruckForm({ ...truckForm, number: e.target.value })} required /></div>
              <div><Label>Year</Label><Input value={truckForm.year} onChange={(e) => setTruckForm({ ...truckForm, year: e.target.value })} /></div>
              <div>
                <Label>Duty Class</Label>
                <Select value={truckForm.duty_class} onValueChange={(v) => setTruckForm({ ...truckForm, duty_class: v })}>
                  <SelectTrigger className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{['Light', 'Medium', 'Heavy', 'Rotator'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Make</Label><Input value={truckForm.make} onChange={(e) => setTruckForm({ ...truckForm, make: e.target.value })} /></div>
              <div><Label>Model</Label><Input value={truckForm.model} onChange={(e) => setTruckForm({ ...truckForm, model: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Plate</Label><Input value={truckForm.plate} onChange={(e) => setTruckForm({ ...truckForm, plate: e.target.value })} /></div>
              <div><Label>State</Label><Input maxLength={2} value={truckForm.state} onChange={(e) => setTruckForm({ ...truckForm, state: e.target.value })} /></div>
              <div><Label>Mileage</Label><Input type="number" value={truckForm.current_mileage} onChange={(e) => setTruckForm({ ...truckForm, current_mileage: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button type="submit" data-testid="truck-save" className="bg-amber-500 text-black hover:bg-amber-400">Add Truck</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Truck Detail dialog */}
      <Dialog open={!!detailTruck} onOpenChange={(o) => !o && setDetailTruck(null)}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailTruck && (
            <>
              <DialogHeader>
                <div className="text-[10px] uppercase tracking-widest text-amber-400">Truck #{detailTruck.number}</div>
                <DialogTitle className="text-2xl">{[detailTruck.year, detailTruck.make, detailTruck.model].filter(Boolean).join(' ') || 'Truck Details'}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2">
                <Stat large value={`${(detailTruck.current_mileage || 0).toLocaleString()}`} label="Current Miles" />
                <Stat large value={`$${(detailTruck.ytd_maintenance || 0).toFixed(2)}`} label="YTD Maintenance" green />
                <Stat large value={`$${(detailTruck.ytd_expenses || 0).toFixed(2)}`} label="YTD Expenses" />
              </div>

              <div className="flex items-center justify-between mt-4 mb-2">
                <div className="text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1"><Wrench className="w-3 h-3" /> Work Orders ({workOrders.length})</div>
                <Button size="sm" onClick={() => setOpenWO(true)} data-testid="add-wo" className="bg-amber-500 text-black hover:bg-amber-400 h-7 text-xs"><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>
              </div>
              {workOrders.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-3">No work orders.</div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {workOrders.map((w) => (
                    <div key={w.id} className="p-2.5 rounded bg-white/[0.02] border border-white/5" data-testid={`wo-${w.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-amber-300">{WO_KINDS.find((k) => k.key === w.kind)?.label || w.kind}</span>
                          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border font-bold ${WO_STATUS_COLORS[w.status] || ''}`}>{w.status.replace('_', ' ')}</span>
                        </div>
                        <span className="text-emerald-300 font-semibold text-sm tabular-nums">${(w.cost || 0).toFixed(2)}</span>
                      </div>
                      <div className="text-sm text-slate-200 mt-1">{w.description}</div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1 flex-wrap">
                        {w.vendor && <span>{w.vendor}</span>}
                        {w.mileage_at_service && <span>· {w.mileage_at_service.toLocaleString()} mi</span>}
                        {w.completed_date && <span>· completed {new Date(w.completed_date).toLocaleDateString()}</span>}
                      </div>
                      {w.status !== 'completed' && w.status !== 'cancelled' && (
                        <div className="flex gap-1 mt-1.5">
                          {w.status === 'pending' && (
                            <button onClick={() => updateWOStatus(w, 'in_progress')} className="text-[10px] px-2 py-0.5 rounded border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 uppercase tracking-wider">Start</button>
                          )}
                          <button onClick={() => updateWOStatus(w, 'completed')} className="text-[10px] px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 uppercase tracking-wider">Complete</button>
                          <button onClick={() => deleteWO(w)} className="ml-auto text-[10px] text-slate-500 hover:text-red-400 uppercase tracking-wider">Delete</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Work Order dialog */}
      <Dialog open={openWO} onOpenChange={setOpenWO}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white">
          <DialogHeader><DialogTitle>Add Work Order — Truck #{detailTruck?.number}</DialogTitle></DialogHeader>
          <form onSubmit={submitWO} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={woForm.kind} onValueChange={(v) => setWoForm({ ...woForm, kind: v })}>
                  <SelectTrigger data-testid="wo-kind" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{WO_KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={woForm.status} onValueChange={(v) => setWoForm({ ...woForm, status: v })}>
                  <SelectTrigger className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{['pending', 'in_progress', 'completed'].map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description *</Label><Textarea data-testid="wo-desc" value={woForm.description} onChange={(e) => setWoForm({ ...woForm, description: e.target.value })} rows={2} required /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Cost ($)</Label><Input data-testid="wo-cost" type="number" step="0.01" value={woForm.cost} onChange={(e) => setWoForm({ ...woForm, cost: e.target.value })} /></div>
              <div><Label>Vendor</Label><Input value={woForm.vendor} onChange={(e) => setWoForm({ ...woForm, vendor: e.target.value })} /></div>
              <div><Label>Mileage</Label><Input type="number" value={woForm.mileage_at_service} onChange={(e) => setWoForm({ ...woForm, mileage_at_service: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button type="submit" data-testid="wo-save" className="bg-amber-500 text-black hover:bg-amber-400">Save Work Order</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Log Expense dialog (driver-friendly) */}
      <Dialog open={openExp} onOpenChange={setOpenExp}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white">
          <DialogHeader><DialogTitle>Log Expense</DialogTitle></DialogHeader>
          <form onSubmit={submitExpense} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={expForm.kind} onValueChange={(v) => setExpForm({ ...expForm, kind: v })}>
                  <SelectTrigger data-testid="exp-kind" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{EXP_KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Truck</Label>
                <Select value={expForm.truck_id} onValueChange={(v) => setExpForm({ ...expForm, truck_id: v })}>
                  <SelectTrigger className="bg-[#07090d] border-white/10 text-white"><SelectValue placeholder="Pick truck..." /></SelectTrigger>
                  <SelectContent>{trucks.map((t) => <SelectItem key={t.id} value={t.id}>#{t.number} · {[t.year, t.make, t.model].filter(Boolean).join(' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount ($)*</Label><Input data-testid="exp-amount" type="number" step="0.01" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} required /></div>
              {expForm.kind === 'fuel' && <div><Label>Gallons</Label><Input type="number" step="0.01" value={expForm.gallons} onChange={(e) => setExpForm({ ...expForm, gallons: e.target.value })} /></div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Vendor</Label><Input value={expForm.vendor} onChange={(e) => setExpForm({ ...expForm, vendor: e.target.value })} placeholder="Pilot, Loves, Walmart..." /></div>
              <div><Label>Odometer</Label><Input type="number" value={expForm.mileage} onChange={(e) => setExpForm({ ...expForm, mileage: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={expForm.notes} onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })} placeholder="DEF fluid, def tank top off..." /></div>
            <div>
              <Label>Receipt Photo</Label>
              <div className="flex items-center gap-2 mt-1">
                {expForm.receipt_data_url && <img src={expForm.receipt_data_url} alt="receipt" className="w-16 h-16 rounded object-cover border border-white/10" />}
                <Button type="button" data-testid="exp-photo" onClick={captureReceipt} variant="outline" className="border-amber-500/30 text-amber-300"><Camera className="w-4 h-4 mr-1" /> {expForm.receipt_data_url ? 'Retake' : 'Capture Receipt'}</Button>
                {expForm.receipt_data_url && <button type="button" onClick={() => setExpForm({ ...expForm, receipt_data_url: '' })} className="text-slate-400 hover:text-red-400"><X className="w-4 h-4" /></button>}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" data-testid="exp-save" className="bg-amber-500 text-black hover:bg-amber-400">Save Expense</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, testId }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-wider transition ${active ? 'bg-amber-500 text-black font-semibold' : 'text-slate-400 hover:text-white'}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function Stat({ value, label, green, large }) {
  return (
    <div className={`bg-white/[0.03] rounded ${large ? 'p-3' : 'p-2'} border border-white/5`}>
      <div className={`${large ? 'text-xl' : 'text-base'} font-bold tabular-nums ${green ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}
