import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

const SERVICE_TYPES = [
  ['tow_light_duty', 'Tow — Light Duty'],
  ['tow_medium_duty', 'Tow — Medium Duty'],
  ['tow_heavy_duty', 'Tow — Heavy Duty'],
  ['flatbed', 'Flatbed'],
  ['winch_out', 'Winch Out'],
  ['lockout', 'Lockout'],
  ['jumpstart', 'Jumpstart'],
  ['tire_change', 'Tire Change'],
  ['fuel_delivery', 'Fuel Delivery'],
  ['accident_recovery', 'Accident Recovery'],
  ['impound', 'Impound Tow'],
  ['private_property', 'Private Property'],
];

export default function WreckerJobNew() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    service_type: 'tow_light_duty',
    priority: 'normal',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    veh_year: '', veh_make: '', veh_model: '', veh_color: '', veh_plate: '', veh_vin: '',
    pickup_address: '', dropoff_address: '',
    quoted_price: '',
    motor_club_id: '',
    payment_method: 'invoice',
    notes: '',
  });

  useEffect(() => { api.get('/wrecker/motor-clubs').then((r) => setClubs(r.data)).catch(() => {}); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target?.value ?? e });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.customer_name) { toast.error('Customer name is required'); return; }
    if (!form.pickup_address) { toast.error('Pickup address is required'); return; }
    setSaving(true);
    try {
      const club = clubs.find((c) => c.id === form.motor_club_id);
      const payload = {
        service_type: form.service_type,
        priority: form.priority,
        customer: { name: form.customer_name, phone: form.customer_phone || null, email: form.customer_email || null },
        vehicle: {
          year: form.veh_year ? parseInt(form.veh_year) : null,
          make: form.veh_make || null,
          model: form.veh_model || null,
          color: form.veh_color || null,
          plate: form.veh_plate || null,
          vin: form.veh_vin || null,
        },
        pickup: { lat: 0, lng: 0, address: form.pickup_address },
        dropoff: form.dropoff_address ? { lat: 0, lng: 0, address: form.dropoff_address } : null,
        quoted_price: form.quoted_price ? parseFloat(form.quoted_price) : null,
        motor_club_id: form.motor_club_id || null,
        motor_club_name: club ? club.name : null,
        payment_method: form.payment_method,
        notes: form.notes || null,
      };
      const r = await api.post('/wrecker/jobs', payload);
      toast.success('Tow job created');
      navigate(`/wrecker/jobs/${r.data.id}`);
    } catch (err) {
      toast.error('Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <Link to="/wrecker"><Button variant="ghost" size="sm" data-testid="back-to-board"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80">New Tow Job</div>
          <h1 className="text-2xl font-bold text-white mt-1">Create dispatch ticket</h1>
        </div>
      </header>

      <form onSubmit={submit} className="space-y-5">
        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Service</div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Service Type</Label>
              <Select value={form.service_type} onValueChange={(v) => setForm({ ...form, service_type: v })}>
                <SelectTrigger data-testid="service-type" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger data-testid="priority" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Customer</div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>Name *</Label><Input data-testid="customer-name" value={form.customer_name} onChange={set('customer_name')} required /></div>
            <div><Label>Phone</Label><Input data-testid="customer-phone" value={form.customer_phone} onChange={set('customer_phone')} placeholder="+1..." /></div>
            <div className="md:col-span-2"><Label>Email</Label><Input data-testid="customer-email" value={form.customer_email} onChange={set('customer_email')} /></div>
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Vehicle</div>
          <div className="grid md:grid-cols-3 gap-4">
            <div><Label>Year</Label><Input data-testid="veh-year" value={form.veh_year} onChange={set('veh_year')} /></div>
            <div><Label>Make</Label><Input data-testid="veh-make" value={form.veh_make} onChange={set('veh_make')} /></div>
            <div><Label>Model</Label><Input data-testid="veh-model" value={form.veh_model} onChange={set('veh_model')} /></div>
            <div><Label>Color</Label><Input data-testid="veh-color" value={form.veh_color} onChange={set('veh_color')} /></div>
            <div><Label>Plate</Label><Input data-testid="veh-plate" value={form.veh_plate} onChange={set('veh_plate')} /></div>
            <div><Label>VIN</Label><Input data-testid="veh-vin" value={form.veh_vin} onChange={set('veh_vin')} /></div>
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Locations</div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>Pickup Address *</Label><Input data-testid="pickup-address" value={form.pickup_address} onChange={set('pickup_address')} required /></div>
            <div><Label>Dropoff Address</Label><Input data-testid="dropoff-address" value={form.dropoff_address} onChange={set('dropoff_address')} /></div>
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Billing</div>
          <div className="grid md:grid-cols-3 gap-4">
            <div><Label>Quoted Price ($)</Label><Input data-testid="quoted-price" type="number" step="0.01" value={form.quoted_price} onChange={set('quoted_price')} /></div>
            <div>
              <Label>Payment Method</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger data-testid="payment-method" className="bg-[#07090d] border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="motor_club">Motor Club</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motor Club</Label>
              <Select value={form.motor_club_id || 'none'} onValueChange={(v) => setForm({ ...form, motor_club_id: v === 'none' ? '' : v })}>
                <SelectTrigger data-testid="motor-club" className="bg-[#07090d] border-white/10 text-white"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / Direct</SelectItem>
                  {clubs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-2">
          <Label>Dispatch Notes</Label>
          <Textarea data-testid="notes" value={form.notes} onChange={set('notes')} rows={3} placeholder="Hazards, gate codes, special instructions..." />
        </Card>

        <div className="flex justify-end gap-2">
          <Link to="/wrecker"><Button type="button" variant="outline" className="border-white/10">Cancel</Button></Link>
          <Button data-testid="save-job" type="submit" disabled={saving} className="bg-amber-500 text-black hover:bg-amber-400">
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Creating...' : 'Create Tow Job'}
          </Button>
        </div>
      </form>
    </div>
  );
}
