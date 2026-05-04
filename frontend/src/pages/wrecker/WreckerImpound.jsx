import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Lock, Plus, KeyRound, MapPin, Mail, FileText, Hash, Phone, Truck, MessageSquare, Send, Calendar, DollarSign, X } from 'lucide-react';
import { toast } from 'sonner';

const REASONS = [
  { key: 'police_hold',      label: 'Police Hold' },
  { key: 'private_property', label: 'Private Property' },
  { key: 'accident',         label: 'Accident' },
  { key: 'abandoned',        label: 'Abandoned' },
];

const MAIL_TYPES = [
  { key: 'notification',     label: 'Notification' },
  { key: 'first_notice',     label: 'First Notice' },
  { key: 'final_notice',     label: 'Final Notice' },
  { key: 'title_application', label: 'Title Application' },
];

const MAIL_STATUS_COLORS = {
  sent: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  delivered: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  returned: 'bg-red-500/15 text-red-300 border-red-500/30',
  undeliverable: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export default function WreckerImpound() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    veh_year: '', veh_make: '', veh_model: '', veh_color: '', veh_plate: '', veh_state: '', veh_vin: '',
    owner_name: '', owner_phone: '',
    storage_location: 'Main Lot', daily_rate: '50',
    reason: 'police_hold', police_report_no: '', notes: '',
  });
  const [releaseDialog, setReleaseDialog] = useState(null);
  const [releaseForm, setReleaseForm] = useState({ released_to_name: '', payment_method: 'cash', amount_paid: '' });
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [mailForm, setMailForm] = useState({ recipient_name: '', address: '', tracking_number: '', mail_type: 'notification' });

  const load = useCallback(async () => {
    try { const r = await api.get('/wrecker/impounds?active_only=false'); setItems(r.data); }
    catch (e) { toast.error('Failed to load impounds'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    try { const r = await api.get(`/wrecker/impounds/${id}`); setDetail(r.data); }
    catch (e) { toast.error('Could not load impound detail'); }
  }, []);

  useEffect(() => { if (detailId) loadDetail(detailId); else setDetail(null); }, [detailId, loadDetail]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/wrecker/impounds', {
        vehicle: {
          year: form.veh_year ? parseInt(form.veh_year) : null,
          make: form.veh_make || null, model: form.veh_model || null,
          color: form.veh_color || null, plate: form.veh_plate || null,
          state: form.veh_state || null, vin: form.veh_vin || null,
        },
        owner_name: form.owner_name || null,
        owner_phone: form.owner_phone || null,
        storage_location: form.storage_location,
        daily_rate: parseFloat(form.daily_rate) || 50,
        reason: form.reason,
        police_report_no: form.police_report_no || null,
        notes: form.notes || null,
      });
      toast.success('Impound record created');
      setOpen(false);
      setForm({ ...form, veh_year: '', veh_make: '', veh_model: '', veh_color: '', veh_plate: '', veh_state: '', veh_vin: '', owner_name: '', owner_phone: '', police_report_no: '', notes: '' });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not create record'); }
  };

  const release = async () => {
    if (!releaseDialog) return;
    try {
      await api.post(`/wrecker/impounds/${releaseDialog.id}/release`, {
        released_to_name: releaseForm.released_to_name,
        payment_method: releaseForm.payment_method,
        amount_paid: parseFloat(releaseForm.amount_paid) || 0,
      });
      toast.success('Vehicle released');
      setReleaseDialog(null);
      setReleaseForm({ released_to_name: '', payment_method: 'cash', amount_paid: '' });
      load();
    } catch (e) { toast.error('Release failed'); }
  };

  const addNote = async () => {
    if (!noteText.trim()) { toast.error('Note required'); return; }
    try {
      await api.post(`/wrecker/impounds/${detailId}/notes`, { note: noteText.trim() });
      setNoteText('');
      loadDetail(detailId);
    } catch (e) { toast.error('Could not save note'); }
  };

  const addMail = async () => {
    if (!mailForm.recipient_name.trim()) { toast.error('Recipient required'); return; }
    try {
      await api.post(`/wrecker/impounds/${detailId}/certified-mail`, mailForm);
      setMailForm({ recipient_name: '', address: '', tracking_number: '', mail_type: 'notification' });
      loadDetail(detailId);
    } catch (e) { toast.error('Could not log mail'); }
  };

  const updateMailStatus = async (entryId, status) => {
    try {
      await api.put(`/wrecker/impounds/${detailId}/certified-mail/${entryId}/status`, { status });
      loadDetail(detailId);
    } catch (e) { toast.error('Status update failed'); }
  };

  if (loading) return <div className="p-6 text-slate-400">Loading impounds...</div>;
  const active = items.filter((i) => !i.released_at);
  const released = items.filter((i) => i.released_at);
  const totalAccrued = active.reduce((s, i) => s + (i.accrued_storage_fee || 0), 0);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-400">Impound Yard</div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-1 flex items-center gap-2"><Lock className="w-6 h-6 text-amber-400" /> Vehicles in Storage</h1>
          <p className="text-sm text-slate-400 mt-1">{active.length} stored · ${totalAccrued.toFixed(2)} in accrued storage fees</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-impound-cta" className="bg-amber-500 text-black hover:bg-amber-400 font-semibold">
              <Plus className="w-4 h-4 mr-1" /> New Impound
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Impound Record</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><Label>Year</Label><Input data-testid="imp-year" value={form.veh_year} onChange={(e) => setForm({ ...form, veh_year: e.target.value })} /></div>
                <div><Label>Make</Label><Input data-testid="imp-make" value={form.veh_make} onChange={(e) => setForm({ ...form, veh_make: e.target.value })} /></div>
                <div><Label>Model</Label><Input data-testid="imp-model" value={form.veh_model} onChange={(e) => setForm({ ...form, veh_model: e.target.value })} /></div>
                <div><Label>Color</Label><Input value={form.veh_color} onChange={(e) => setForm({ ...form, veh_color: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>License Plate</Label><Input data-testid="imp-plate" value={form.veh_plate} onChange={(e) => setForm({ ...form, veh_plate: e.target.value })} /></div>
                <div><Label>State</Label><Input value={form.veh_state} onChange={(e) => setForm({ ...form, veh_state: e.target.value })} placeholder="IN" maxLength={2} /></div>
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
                      {REASONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
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
          <Card className="bg-[#0a0e14] border-white/5 p-8 text-center text-slate-500 text-sm">No vehicles in impound. 🚗</Card>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {active.map((i) => {
              const veh = [i.vehicle?.year, i.vehicle?.color, i.vehicle?.make, i.vehicle?.model].filter(Boolean).join(' ');
              return (
                <Card key={i.id} className="p-4 bg-[#0a0e14] border-white/5 hover:border-amber-500/30 transition cursor-pointer" data-testid={`impound-${i.id}`} onClick={() => setDetailId(i.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-amber-400 flex items-center gap-1"><Hash className="w-3 h-3" /> Stock # {i.stock_number}</div>
                      <div className="text-sm font-semibold text-white truncate mt-0.5">{veh || 'Vehicle'}</div>
                      {i.vehicle?.plate && <div className="text-xs text-slate-400 mt-0.5">{i.vehicle.plate}{i.vehicle?.state ? ' / ' + i.vehicle.state : ''}</div>}
                    </div>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-300">
                      {(i.reason || '').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> {i.storage_location}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div className="bg-white/[0.03] rounded-md p-2 border border-white/5">
                      <div className="text-lg font-semibold text-white tabular-nums">{i.days_stored || 1}</div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-500">days</div>
                    </div>
                    <div className="bg-emerald-500/10 rounded-md p-2 border border-emerald-500/20">
                      <div className="text-lg font-semibold text-emerald-300 tabular-nums">${(i.accrued_storage_fee || 0).toFixed(0)}</div>
                      <div className="text-[9px] uppercase tracking-wider text-emerald-400/70">accrued</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                    {(i.notes_log?.length || 0) > 0 && <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {i.notes_log.length}</span>}
                    {(i.certified_mail?.length || 0) > 0 && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {i.certified_mail.length}</span>}
                    {i.police_report_no && <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {i.police_report_no}</span>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button data-testid={`view-impound-${i.id}`} size="sm" variant="outline" className="border-white/10 text-slate-300 hover:bg-white/5" onClick={(e) => { e.stopPropagation(); setDetailId(i.id); }}>
                      View Details
                    </Button>
                    <Button data-testid={`release-${i.id}`} size="sm" variant="outline" className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10" onClick={(e) => { e.stopPropagation(); setReleaseDialog(i); }}>
                      <KeyRound className="w-3.5 h-3.5 mr-1" /> Release
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {released.length > 0 && (
        <section>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">Recently Released</div>
          <Card className="bg-[#0a0e14] border-white/5 divide-y divide-white/5 overflow-hidden">
            {released.slice(0, 10).map((i) => (
              <div key={i.id} className="p-3 flex items-center justify-between text-sm" data-testid={`released-${i.id}`}>
                <div>
                  <div className="text-slate-200">{[i.vehicle?.year, i.vehicle?.make, i.vehicle?.model].filter(Boolean).join(' ')}</div>
                  <div className="text-xs text-slate-500">Stock # {i.stock_number} · to {i.released_to?.name} · ${(i.amount_paid || 0).toFixed(2)}</div>
                </div>
                <div className="text-xs text-slate-500">{i.released_at ? new Date(i.released_at).toLocaleDateString() : ''}</div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <div className="text-[10px] uppercase tracking-widest text-amber-400 flex items-center gap-1"><Hash className="w-3 h-3" /> Stock # {detail.stock_number}</div>
                <DialogTitle className="text-2xl">{[detail.vehicle?.year, detail.vehicle?.color, detail.vehicle?.make, detail.vehicle?.model].filter(Boolean).join(' ')}</DialogTitle>
              </DialogHeader>

              {/* Big stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Days Held</div>
                  <div className="text-xl font-bold text-white tabular-nums">{detail.days_stored || 1}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Daily Rate</div>
                  <div className="text-xl font-bold text-white tabular-nums">${(detail.daily_rate || 0).toFixed(2)}</div>
                </div>
                <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-400/70">Accrued</div>
                  <div className="text-xl font-bold text-emerald-300 tabular-nums">${(detail.accrued_storage_fee || 0).toFixed(2)}</div>
                </div>
              </div>

              {/* Vehicle + Owner facts */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Plate / State" value={[detail.vehicle?.plate, detail.vehicle?.state].filter(Boolean).join(' / ') || '—'} />
                <Field label="VIN" value={detail.vehicle?.vin || '—'} mono />
                <Field label="Owner" value={detail.owner_name || '—'} />
                <Field label="Owner Phone" value={detail.owner_phone || '—'} />
                <Field label="Storage Location" value={detail.storage_location || '—'} />
                <Field label="Police Report" value={detail.police_report_no || '—'} />
                <Field label="Reason" value={(detail.reason || '').replace(/_/g, ' ')} />
                <Field label="Impounded" value={detail.impounded_at ? new Date(detail.impounded_at).toLocaleString() : '—'} />
              </div>

              {/* Notes log */}
              <Card className="p-3 bg-white/[0.02] border-white/5">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400 mb-2"><MessageSquare className="w-3 h-3" /> Notes Log ({detail.notes_log?.length || 0})</div>
                <div className="flex gap-2 mb-2">
                  <Input data-testid="impound-note-input" placeholder="Add a note (e.g. owner called, sent first notice...)" value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }} className="bg-[#07090d] border-white/10 text-white text-sm" />
                  <Button data-testid="impound-note-add" onClick={addNote} size="sm" className="bg-amber-500 text-black hover:bg-amber-400 shrink-0"><Plus className="w-4 h-4" /></Button>
                </div>
                {(detail.notes_log || []).length === 0 ? (
                  <div className="text-xs text-slate-500 italic">No notes yet.</div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {[...(detail.notes_log || [])].reverse().map((n) => (
                      <div key={n.id} className="text-xs p-2 rounded bg-[#07090d] border border-white/5">
                        <div className="text-slate-200">{n.note}</div>
                        <div className="text-[10px] text-slate-500 mt-1">{n.by_name || 'unknown'} · {new Date(n.at).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Certified Mail */}
              <Card className="p-3 bg-white/[0.02] border-white/5">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400 mb-2"><Mail className="w-3 h-3" /> Certified Mail ({detail.certified_mail?.length || 0})</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Input placeholder="Recipient name" value={mailForm.recipient_name} onChange={(e) => setMailForm({ ...mailForm, recipient_name: e.target.value })} className="bg-[#07090d] border-white/10 text-white text-sm" />
                  <Select value={mailForm.mail_type} onValueChange={(v) => setMailForm({ ...mailForm, mail_type: v })}>
                    <SelectTrigger className="bg-[#07090d] border-white/10 text-white text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MAIL_TYPES.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Tracking number" value={mailForm.tracking_number} onChange={(e) => setMailForm({ ...mailForm, tracking_number: e.target.value })} className="col-span-2 bg-[#07090d] border-white/10 text-white text-sm font-mono" />
                </div>
                <Button data-testid="impound-mail-add" onClick={addMail} size="sm" className="w-full bg-amber-500 text-black hover:bg-amber-400 mb-2"><Send className="w-3.5 h-3.5 mr-1" /> Log Mail Sent</Button>
                {(detail.certified_mail || []).length === 0 ? (
                  <div className="text-xs text-slate-500 italic">No mail logged.</div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {[...(detail.certified_mail || [])].reverse().map((m) => (
                      <div key={m.id} className="p-2 rounded bg-[#07090d] border border-white/5 text-xs" data-testid={`mail-${m.id}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-200">{m.recipient_name}</div>
                          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border font-bold ${MAIL_STATUS_COLORS[m.status] || ''}`}>{m.status}</span>
                        </div>
                        <div className="text-slate-500 mt-0.5">{MAIL_TYPES.find((t) => t.key === m.mail_type)?.label || m.mail_type}{m.tracking_number ? ' · ' + m.tracking_number : ''}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{new Date(m.sent_at).toLocaleString()}</div>
                        <div className="flex gap-1 mt-1.5">
                          {['delivered', 'returned', 'undeliverable'].filter((s) => s !== m.status).map((s) => (
                            <button key={s} data-testid={`mail-${m.id}-${s}`} onClick={() => updateMailStatus(m.id, s)} className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/30 transition uppercase tracking-wider">
                              Mark {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <DialogFooter className="gap-2">
                <Button variant="outline" className="border-white/10 text-slate-300" onClick={() => setDetailId(null)}>Close</Button>
                {!detail.released_at && (
                  <Button data-testid="release-from-detail" className="bg-emerald-500 text-black hover:bg-emerald-400" onClick={() => { setReleaseDialog(detail); setDetailId(null); }}>
                    <KeyRound className="w-4 h-4 mr-1" /> Release Vehicle
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Release dialog */}
      <Dialog open={!!releaseDialog} onOpenChange={(o) => !o && setReleaseDialog(null)}>
        <DialogContent className="bg-[#0a0e14] border-white/10 text-white">
          <DialogHeader><DialogTitle>Release Vehicle</DialogTitle></DialogHeader>
          {releaseDialog && (
            <div className="space-y-4">
              <div className="text-sm text-slate-400">
                Stock # {releaseDialog.stock_number} · {[releaseDialog.vehicle?.year, releaseDialog.vehicle?.make, releaseDialog.vehicle?.model].filter(Boolean).join(' ')}
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

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
      <div className={`text-sm text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</div>
    </div>
  );
}
