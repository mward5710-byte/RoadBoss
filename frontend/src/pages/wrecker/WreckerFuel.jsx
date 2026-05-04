import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Fuel, Plus, ExternalLink, Receipt, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function WreckerFuel() {
  const [tanks, setTanks] = useState([]);
  const [txs, setTxs] = useState([]);
  const [intStatus, setIntStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openTx, setOpenTx] = useState(false);
  const [openTank, setOpenTank] = useState(false);
  const [txForm, setTxForm] = useState({ tank_id: '', gallons: '', cost_per_gallon: '', odometer: '', notes: '' });
  const [tankForm, setTankForm] = useState({ name: '', location: '', fuel_type: 'diesel', capacity_gallons: '', current_estimate_gallons: '', notes: '' });

  const load = useCallback(async () => {
    try {
      const [t, x, s] = await Promise.all([
        api.get('/wrecker/fuel/tanks'),
        api.get('/wrecker/fuel/transactions'),
        api.get('/wrecker/fuel/integration-status'),
      ]);
      setTanks(t.data); setTxs(x.data); setIntStatus(s.data);
    } catch (e) { toast.error('Failed to load fuel data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitTx = async (e) => {
    e.preventDefault();
    try {
      await api.post('/wrecker/fuel/transactions', {
        tank_id: txForm.tank_id || null,
        gallons: parseFloat(txForm.gallons),
        cost_per_gallon: txForm.cost_per_gallon ? parseFloat(txForm.cost_per_gallon) : null,
        odometer: txForm.odometer ? parseInt(txForm.odometer) : null,
        notes: txForm.notes || null,
      });
      toast.success('Fuel transaction logged');
      setOpenTx(false);
      setTxForm({ tank_id: '', gallons: '', cost_per_gallon: '', odometer: '', notes: '' });
      load();
    } catch (e) { toast.error('Log failed'); }
  };

  const submitTank = async (e) => {
    e.preventDefault();
    try {
      await api.post('/wrecker/fuel/tanks', {
        name: tankForm.name,
        location: tankForm.location,
        fuel_type: tankForm.fuel_type,
        capacity_gallons: parseFloat(tankForm.capacity_gallons),
        current_estimate_gallons: tankForm.current_estimate_gallons ? parseFloat(tankForm.current_estimate_gallons) : null,
        notes: tankForm.notes || null,
      });
      toast.success('Tank added');
      setOpenTank(false);
      setTankForm({ name: '', location: '', fuel_type: 'diesel', capacity_gallons: '', current_estimate_gallons: '', notes: '' });
      load();
    } catch (e) { toast.error('Save failed'); }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading fuel data...</div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80">Wrecker Mode</div>
          <h1 className="text-3xl font-bold text-white mt-1">Fuel</h1>
          <p className="text-sm text-slate-400 mt-1">Manual logging works today. FuelCloud auto-sync activates when API access is approved.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={openTank} onOpenChange={setOpenTank}>
            <DialogTrigger asChild>
              <Button data-testid="add-tank" variant="outline" className="border-white/10 text-slate-200"><Plus className="w-4 h-4 mr-1" /> Add Tank</Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0a0e14] border-white/10 text-white">
              <DialogHeader><DialogTitle>New Fuel Tank</DialogTitle></DialogHeader>
              <form onSubmit={submitTank} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Name *</Label><Input required value={tankForm.name} onChange={(e) => setTankForm({ ...tankForm, name: e.target.value })} /></div>
                  <div><Label>Location *</Label><Input required value={tankForm.location} onChange={(e) => setTankForm({ ...tankForm, location: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Fuel Type</Label>
                    <Select value={tankForm.fuel_type} onValueChange={(v) => setTankForm({ ...tankForm, fuel_type: v })}>
                      <SelectTrigger className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="diesel">Diesel</SelectItem>
                        <SelectItem value="gasoline">Gasoline</SelectItem>
                        <SelectItem value="def">DEF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Capacity (gal) *</Label><Input required type="number" step="0.1" value={tankForm.capacity_gallons} onChange={(e) => setTankForm({ ...tankForm, capacity_gallons: e.target.value })} /></div>
                  <div><Label>Current Estimate</Label><Input type="number" step="0.1" value={tankForm.current_estimate_gallons} onChange={(e) => setTankForm({ ...tankForm, current_estimate_gallons: e.target.value })} /></div>
                </div>
                <DialogFooter><Button type="submit" data-testid="save-tank" className="bg-amber-500 text-black hover:bg-amber-400">Add Tank</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={openTx} onOpenChange={setOpenTx}>
            <DialogTrigger asChild>
              <Button data-testid="log-fuel" className="bg-amber-500 text-black hover:bg-amber-400"><Receipt className="w-4 h-4 mr-1" /> Log Fuel</Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0a0e14] border-white/10 text-white">
              <DialogHeader><DialogTitle>Log Fuel Transaction</DialogTitle></DialogHeader>
              <form onSubmit={submitTx} className="space-y-4">
                <div>
                  <Label>Tank</Label>
                  <Select value={txForm.tank_id || 'none'} onValueChange={(v) => setTxForm({ ...txForm, tank_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="bg-[#07090d] border-white/10 text-white"><SelectValue placeholder="Select tank" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">External Pump (no tank)</SelectItem>
                      {tanks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} — {t.fuel_type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Gallons *</Label><Input required type="number" step="0.01" value={txForm.gallons} onChange={(e) => setTxForm({ ...txForm, gallons: e.target.value })} /></div>
                  <div><Label>Cost / gal</Label><Input type="number" step="0.001" value={txForm.cost_per_gallon} onChange={(e) => setTxForm({ ...txForm, cost_per_gallon: e.target.value })} /></div>
                  <div><Label>Odometer</Label><Input type="number" value={txForm.odometer} onChange={(e) => setTxForm({ ...txForm, odometer: e.target.value })} /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} rows={2} /></div>
                <DialogFooter><Button type="submit" data-testid="save-tx" className="bg-amber-500 text-black hover:bg-amber-400">Log</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {intStatus && (
        <Card className="p-4 bg-amber-500/5 border-amber-500/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-300 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-amber-200">FuelCloud integration: {intStatus.status.replace(/_/g, ' ').toUpperCase()}</div>
              <div className="text-xs text-slate-400 mt-1">{intStatus.message}</div>
              <div className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                <strong className="text-slate-300">How this works:</strong> Each tow shop brings its own FuelCloud account. Once your shop's owner gets API access from <a href={intStatus.docs_url} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200 underline">help.fuelcloud.com</a>, paste the credentials below — they're stored only for your shop and never shared.
              </div>
              <div className="mt-3 grid md:grid-cols-3 gap-2 max-w-2xl">
                <input data-testid="fuelcloud-api-key" placeholder="API Key" className="bg-[#07090d] border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-slate-600" disabled />
                <input data-testid="fuelcloud-secret" placeholder="API Secret" type="password" className="bg-[#07090d] border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-slate-600" disabled />
                <button data-testid="fuelcloud-connect" disabled className="bg-amber-500/20 text-amber-300/60 cursor-not-allowed rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-amber-500/30">
                  Connect (coming soon)
                </button>
              </div>
              <a href={intStatus.docs_url} target="_blank" rel="noreferrer" className="text-xs text-sky-300 hover:text-sky-200 inline-flex items-center gap-1 mt-3">
                Open FuelCloud API docs <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </Card>
      )}

      <section>
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Tanks ({tanks.length})</div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {tanks.map((t) => {
            const pct = t.capacity_gallons ? Math.max(0, Math.min(100, (t.current_estimate_gallons / t.capacity_gallons) * 100)) : 0;
            return (
              <Card key={t.id} className="p-4 bg-[#0a0e14] border-white/5" data-testid={`tank-${t.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.location}</div>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center"><Fuel className="w-4 h-4 text-sky-300" /></div>
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline justify-between">
                    <div className="text-2xl font-bold text-white">{(t.current_estimate_gallons || 0).toFixed(0)}</div>
                    <div className="text-xs text-slate-400">/ {t.capacity_gallons} {t.fuel_type}</div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full ${pct < 25 ? 'bg-red-400' : pct < 50 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{pct.toFixed(0)}% remaining</div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Recent Transactions</div>
        {txs.length === 0 ? (
          <div className="hp-panel rounded-xl p-8 text-center text-slate-500 text-sm">No fuel transactions yet. Log your first one above.</div>
        ) : (
          <div className="hp-panel rounded-xl divide-y divide-white/5">
            {txs.map((tx) => (
              <div key={tx.id} className="p-3 grid grid-cols-4 gap-3 text-sm items-center">
                <div>
                  <div className="text-white">{tx.gallons?.toFixed(1)} gal</div>
                  <div className="text-[10px] text-slate-500 uppercase">{tx.tank_id ? 'tank' : 'external'}</div>
                </div>
                <div className="text-slate-300">${(tx.total_cost || 0).toFixed(2)}</div>
                <div className="text-xs text-slate-400">{tx.notes || '—'}</div>
                <div className="text-xs text-slate-500 text-right">{new Date(tx.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
