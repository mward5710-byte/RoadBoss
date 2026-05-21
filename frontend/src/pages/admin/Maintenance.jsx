import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  Wrench, CheckCircle2, Download, Plus, ChevronDown, ChevronUp,
  Package, Trash2, AlertCircle, Clock, ShoppingCart, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

// ─── helpers ────────────────────────────────────────────────────────────────

function download(url, filename) {
  const token = localStorage.getItem('hp_token');
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.blob())
    .then((b) => {
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u; a.download = filename; a.click();
      URL.revokeObjectURL(u);
    });
}

function fmt(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

const PRIORITY = {
  low:      { label: 'Low',      cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
  normal:   { label: 'Normal',   cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  high:     { label: 'High',     cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  critical: { label: 'Critical', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

const PART_STATUS = {
  need_to_order: { label: 'Need to Order', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  ordered:       { label: 'Ordered',       cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  received:      { label: 'Received',      cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  installed:     { label: 'Installed',     cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

const SERVICE_TYPES = [
  'Oil Change', 'Tire Rotation / Replace', 'Brake Service', 'Engine Repair',
  'Transmission', 'Electrical', 'Fuel System', 'Cooling System',
  'DEF / Emissions', 'Suspension', 'Air System', 'DOT Inspection', 'Other',
];

const EMPTY_ORDER = {
  vehicle_id: '', service_type: 'Oil Change', due_at: '', due_miles: '',
  priority: 'normal', assigned_to: '', notes: '', cost: '',
};

const EMPTY_PART = {
  name: '', part_number: '', qty: '1', unit_cost: '', vendor: '', status: 'need_to_order',
};

// ─── parts sub-form ─────────────────────────────────────────────────────────

function PartsSection({ order, vehicles, onChange }) {
  const [adding, setAdding] = useState(false);
  const [part, setPart] = useState({ ...EMPTY_PART });
  const [saving, setSaving] = useState(false);

  const parts = order.parts || [];

  async function addPart() {
    if (!part.name.trim()) return;
    setSaving(true);
    try {
      const updated = [
        ...parts,
        {
          ...part,
          qty: parseFloat(part.qty) || 1,
          unit_cost: part.unit_cost !== '' ? parseFloat(part.unit_cost) : null,
        },
      ];
      const r = await api.patch(`/maintenance/${order.id}`, { parts: updated });
      onChange(r.data);
      setPart({ ...EMPTY_PART });
      setAdding(false);
    } catch { toast.error('Failed to add part.'); }
    finally { setSaving(false); }
  }

  async function updatePartStatus(idx, status) {
    const updated = parts.map((p, i) => i === idx ? { ...p, status } : p);
    try {
      const r = await api.patch(`/maintenance/${order.id}`, { parts: updated });
      onChange(r.data);
    } catch { toast.error('Failed to update part.'); }
  }

  async function removePart(idx) {
    const updated = parts.filter((_, i) => i !== idx);
    try {
      const r = await api.patch(`/maintenance/${order.id}`, { parts: updated });
      onChange(r.data);
    } catch { toast.error('Failed to remove part.'); }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Package className="w-3 h-3" /> Parts & Materials
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
        >
          <Plus className="w-3 h-3" /> Add Part
        </button>
      </div>

      {/* Add part form */}
      {adding && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Part Name *</label>
              <Input
                value={part.name}
                onChange={(e) => setPart((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Oil Filter"
                className="mt-0.5 h-8 text-sm bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Part #</label>
              <Input
                value={part.part_number}
                onChange={(e) => setPart((p) => ({ ...p, part_number: e.target.value }))}
                placeholder="e.g. PH7317"
                className="mt-0.5 h-8 text-sm bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Qty</label>
              <Input
                type="number" min="1" value={part.qty}
                onChange={(e) => setPart((p) => ({ ...p, qty: e.target.value }))}
                className="mt-0.5 h-8 text-sm bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Unit Cost ($)</label>
              <Input
                type="number" min="0" step="0.01" value={part.unit_cost}
                onChange={(e) => setPart((p) => ({ ...p, unit_cost: e.target.value }))}
                placeholder="0.00"
                className="mt-0.5 h-8 text-sm bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Vendor / Store</label>
              <Input
                value={part.vendor}
                onChange={(e) => setPart((p) => ({ ...p, vendor: e.target.value }))}
                placeholder="e.g. Napa, FleetPride"
                className="mt-0.5 h-8 text-sm bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Status</label>
              <select
                value={part.status}
                onChange={(e) => setPart((p) => ({ ...p, status: e.target.value }))}
                className="mt-0.5 h-8 w-full rounded-md border border-white/10 bg-[#0a0e14] text-sm text-white px-2"
              >
                {Object.entries(PART_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm" disabled={saving || !part.name.trim()} onClick={addPart}
              className="h-7 text-xs bg-sky-600 hover:bg-sky-500 text-white"
            >
              {saving ? 'Saving…' : 'Save Part'}
            </Button>
            <Button
              size="sm" variant="ghost" onClick={() => { setAdding(false); setPart({ ...EMPTY_PART }); }}
              className="h-7 text-xs text-slate-400"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Parts list */}
      {parts.length > 0 ? (
        <div className="space-y-1.5">
          {parts.map((p, idx) => {
            const sm = PART_STATUS[p.status] || PART_STATUS.need_to_order;
            const lineTotal = p.unit_cost != null ? (p.qty || 1) * p.unit_cost : null;
            return (
              <div key={idx} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-white/[0.025] hover:bg-white/[0.04] transition group">
                <div className="flex-1 min-w-0">
                  <span className="text-slate-200 font-medium">{p.name}</span>
                  {p.part_number && <span className="text-slate-500 ml-1.5">#{p.part_number}</span>}
                  {p.vendor && <span className="text-slate-500 ml-1.5">· {p.vendor}</span>}
                </div>
                <span className="text-slate-400 shrink-0">×{p.qty || 1}</span>
                {lineTotal != null && <span className="text-emerald-300 shrink-0">${lineTotal.toFixed(2)}</span>}
                {/* Status dropdown */}
                <select
                  value={p.status}
                  onChange={(e) => updatePartStatus(idx, e.target.value)}
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${sm.cls} bg-transparent cursor-pointer`}
                >
                  {Object.entries(PART_STATUS).map(([k, v]) => (
                    <option key={k} value={k} className="bg-[#0a0e14] text-white">{v.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => removePart(idx)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-600 hover:text-red-400 transition"
                  title="Remove part"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      ) : !adding && (
        <div className="text-xs text-slate-600 italic py-1">No parts logged yet — tap "Add Part" to track what you need.</div>
      )}
    </div>
  );
}

// ─── work order card ─────────────────────────────────────────────────────────

function WorkOrderCard({ order, vehicles, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes]     = useState(order.mechanic_notes || '');
  const [saving, setSaving]   = useState(false);

  const vName = vehicles.find((v) => v.id === order.vehicle_id)?.name || '—';
  const pri   = PRIORITY[order.priority] || PRIORITY.normal;

  const partsCost = (order.parts || []).reduce((acc, p) => {
    const lc = p.unit_cost != null ? (p.qty || 1) * p.unit_cost : 0;
    return acc + lc;
  }, 0);
  const totalCost = (order.cost || 0) + partsCost;
  const pendingParts = (order.parts || []).filter((p) => ['need_to_order', 'ordered'].includes(p.status)).length;

  async function toggleComplete() {
    setSaving(true);
    try {
      const r = await api.patch(`/maintenance/${order.id}`, {
        completed: !order.completed,
        completed_at: !order.completed ? new Date().toISOString() : null,
      });
      onUpdate(r.data);
    } catch { toast.error('Failed to update.'); }
    finally { setSaving(false); }
  }

  async function saveNotes() {
    setSaving(true);
    try {
      const r = await api.patch(`/maintenance/${order.id}`, { mechanic_notes: notes });
      onUpdate(r.data);
      toast.success('Notes saved.');
    } catch { toast.error('Failed to save notes.'); }
    finally { setSaving(false); }
  }

  async function del() {
    if (!window.confirm('Delete this work order?')) return;
    try {
      await api.delete(`/maintenance/${order.id}`);
      onDelete(order.id);
    } catch { toast.error('Failed to delete.'); }
  }

  return (
    <div
      className={`hp-panel rounded-xl overflow-hidden transition-shadow ${order.completed ? 'opacity-60' : ''}`}
      data-testid={`work-order-${order.id}`}
    >
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02] transition"
        onClick={() => setExpanded((v) => !v)}
        data-testid={`work-order-toggle-${order.id}`}
      >
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <Wrench className={`w-4 h-4 shrink-0 ${order.completed ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="font-medium text-white truncate">{order.service_type}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${pri.cls} shrink-0`}>{pri.label}</span>
            {pendingParts > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-orange-500/15 text-orange-300 border-orange-500/30 shrink-0 flex items-center gap-0.5">
                <ShoppingCart className="w-2.5 h-2.5" /> {pendingParts} parts
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
            <span className="font-medium text-slate-300">{vName}</span>
            {order.assigned_to && <span>· {order.assigned_to}</span>}
            {order.due_at && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{fmt(order.due_at)}</span>}
            {order.due_miles && <span>{order.due_miles.toLocaleString()} mi</span>}
            {totalCost > 0 && <span className="text-emerald-300">${totalCost.toFixed(2)}</span>}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/5 px-4 py-4 space-y-4">
          {/* Parts */}
          <PartsSection order={order} vehicles={vehicles} onChange={onUpdate} />

          {/* Mechanic notes */}
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Mechanic Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="What was done, what's still needed, any observations…"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 text-sm text-white p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500/50 placeholder-slate-600"
            />
            <div className="flex items-center justify-between mt-1.5 gap-2">
              <Button
                size="sm" disabled={saving} onClick={saveNotes}
                className="h-7 text-xs bg-sky-600 hover:bg-sky-500 text-white"
              >
                {saving ? 'Saving…' : 'Save Notes'}
              </Button>
              <div className="flex gap-2">
                <Button
                  size="sm" disabled={saving} onClick={toggleComplete}
                  variant="outline"
                  className={`h-7 text-xs border-white/15 ${order.completed ? 'text-amber-300 hover:text-amber-200' : 'text-emerald-300 hover:text-emerald-200'}`}
                >
                  {saving ? '…' : order.completed
                    ? <><AlertCircle className="w-3 h-3 mr-1" /> Reopen</>
                    : <><CheckCircle2 className="w-3 h-3 mr-1" /> Mark Complete</>
                  }
                </Button>
                <Button
                  size="sm" variant="ghost" onClick={del}
                  className="h-7 text-xs text-slate-500 hover:text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── new work order form ─────────────────────────────────────────────────────

function NewOrderModal({ vehicles, onClose, onCreated }) {
  const [form, setForm] = useState({ ...EMPTY_ORDER });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.vehicle_id) { toast.error('Select a truck.'); return; }
    setSaving(true);
    try {
      const payload = {
        vehicle_id: form.vehicle_id,
        service_type: form.service_type,
        priority: form.priority,
        assigned_to: form.assigned_to || undefined,
        notes: form.notes || undefined,
        due_at: form.due_at || undefined,
        due_miles: form.due_miles ? parseInt(form.due_miles) : undefined,
        cost: form.cost ? parseFloat(form.cost) : undefined,
        completed: false,
        parts: [],
      };
      const r = await api.post('/maintenance', payload);
      toast.success('Work order created.');
      onCreated(r.data);
      onClose();
    } catch { toast.error('Failed to create work order.'); }
    finally { setSaving(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-[#0e1319] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <div className="text-xs uppercase tracking-widest text-sky-400/80">New</div>
            <div className="font-semibold text-white">Work Order</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          {/* Truck */}
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Truck *</label>
            <select
              value={form.vehicle_id} onChange={set('vehicle_id')} required
              className="mt-1 h-9 w-full rounded-md border border-white/10 bg-[#0a0e14] text-sm text-white px-2"
            >
              <option value="">— Select truck —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          {/* Service type + priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-400">Service Type</label>
              <select
                value={form.service_type} onChange={set('service_type')}
                className="mt-1 h-9 w-full rounded-md border border-white/10 bg-[#0a0e14] text-sm text-white px-2"
              >
                {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-400">Priority</label>
              <select
                value={form.priority} onChange={set('priority')}
                className="mt-1 h-9 w-full rounded-md border border-white/10 bg-[#0a0e14] text-sm text-white px-2"
              >
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {/* Assigned mechanic */}
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Assigned Mechanic</label>
            <Input
              value={form.assigned_to} onChange={set('assigned_to')}
              placeholder="e.g. Mike"
              className="mt-1 h-9 text-sm bg-white/5 border-white/10 text-white"
            />
          </div>

          {/* Due date + miles */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-400">Due Date</label>
              <Input
                type="date" value={form.due_at} onChange={set('due_at')}
                className="mt-1 h-9 text-sm bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-400">Due Miles</label>
              <Input
                type="number" value={form.due_miles} onChange={set('due_miles')}
                placeholder="e.g. 95000"
                className="mt-1 h-9 text-sm bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>

          {/* Labour cost */}
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Labour / Other Cost ($)</label>
            <Input
              type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')}
              placeholder="0.00"
              className="mt-1 h-9 text-sm bg-white/5 border-white/10 text-white"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400">Description / Notes</label>
            <textarea
              value={form.notes} onChange={set('notes')} rows={2}
              placeholder="Describe the problem or job scope…"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 text-sm text-white p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500/50 placeholder-slate-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400">Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-sky-600 hover:bg-sky-500 text-white">
              {saving ? 'Creating…' : 'Create Work Order'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function Maintenance() {
  const [rows, setRows]       = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter]   = useState('open'); // open | complete | all

  useEffect(() => {
    (async () => {
      const [m, v] = await Promise.all([api.get('/maintenance'), api.get('/vehicles')]);
      setRows(m.data || []);
      setVehicles(v.data || []);
    })();
  }, []);

  const displayed = useMemo(() => {
    if (filter === 'open')     return rows.filter((r) => !r.completed);
    if (filter === 'complete') return rows.filter((r) => r.completed);
    return rows;
  }, [rows, filter]);

  const stats = useMemo(() => {
    const open     = rows.filter((r) => !r.completed).length;
    const critical = rows.filter((r) => !r.completed && r.priority === 'critical').length;
    const pending  = rows.flatMap((r) => r.parts || []).filter((p) => ['need_to_order', 'ordered'].includes(p.status)).length;
    const totalCost = rows.reduce((acc, r) => {
      const parts = (r.parts || []).reduce((a, p) => a + (p.unit_cost != null ? (p.qty || 1) * p.unit_cost : 0), 0);
      return acc + (r.cost || 0) + parts;
    }, 0);
    return { open, critical, pending, totalCost };
  }, [rows]);

  function handleUpdate(updated) {
    setRows((prev) => prev.map((r) => r.id === updated.id ? updated : r));
  }
  function handleDelete(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }
  function handleCreated(order) {
    setRows((prev) => [order, ...prev]);
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-5xl" data-testid="admin-maintenance">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-sky-400/80">Fleet</div>
          <h1 className="text-3xl font-bold text-white mt-1">Mechanic Shop</h1>
          <p className="text-xs text-slate-500 mt-1">Work orders, parts tracking, and service history — no more pen and pad.</p>
        </div>
        <div className="flex gap-2">
          <Button
            data-testid="new-work-order-btn"
            onClick={() => setShowNew(true)}
            className="bg-sky-600 hover:bg-sky-500 text-white"
          >
            <Plus className="w-4 h-4 mr-1" /> New Work Order
          </Button>
          <Button
            data-testid="export-maintenance-btn"
            onClick={() => download(`${process.env.REACT_APP_BACKEND_URL}/api/exports/maintenance.csv`, 'maintenance.csv')}
            variant="outline"
            className="border-white/15 text-slate-200"
          >
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="hp-panel rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Open Orders</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.open}</div>
        </div>
        <div className="hp-panel rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wider text-red-400/80 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Critical</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.critical}</div>
        </div>
        <div className="hp-panel rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wider text-orange-400/80 flex items-center gap-1"><ShoppingCart className="w-3 h-3" /> Parts Pending</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.pending}</div>
        </div>
        <div className="hp-panel rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wider text-emerald-400/80">Total Cost</div>
          <div className="text-2xl font-bold text-white mt-1">${stats.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white/[0.03] border border-white/5 p-1 rounded-xl w-fit">
        {[['open', 'Open'], ['complete', 'Completed'], ['all', 'All']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`px-4 py-1.5 rounded-lg text-sm transition ${filter === v ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Work orders */}
      <div className="space-y-3">
        {displayed.length === 0 && (
          <div className="hp-panel rounded-xl p-8 text-center text-slate-500 text-sm">
            {filter === 'open' ? 'No open work orders — nice!' : 'Nothing here yet.'}
          </div>
        )}
        {displayed.map((order) => (
          <WorkOrderCard
            key={order.id}
            order={order}
            vehicles={vehicles}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* New order modal */}
      {showNew && (
        <NewOrderModal
          vehicles={vehicles}
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
