import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Send, Mail, MessageCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function WreckerReceipt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [channel, setChannel] = useState('email'); // email | sms | both
  const [toEmail, setToEmail] = useState('');
  const [toPhone, setToPhone] = useState('');
  const [hideCharges, setHideCharges] = useState(false);
  const [hidePhotos, setHidePhotos] = useState(false);
  const [hideDiscounts, setHideDiscounts] = useState(false);
  const [includeLink, setIncludeLink] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/wrecker/jobs/${id}`);
      setJob(r.data);
      setToEmail(r.data?.customer?.email || '');
      setToPhone(r.data?.customer?.phone || '');
    } catch (e) { toast.error('Job not found'); navigate(`/wrecker`); }
    finally { setLoading(false); }
  }, [id, navigate]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (channel !== 'sms' && !toEmail) { toast.error('Email required'); return; }
    if (channel !== 'email' && !toPhone) { toast.error('Phone required'); return; }
    setSending(true);
    try {
      const r = await api.post(`/wrecker/jobs/${id}/receipt`, {
        channel,
        to_email: toEmail || null,
        to_phone: toPhone || null,
        hide_charges: hideCharges,
        hide_discounts: hideDiscounts,
        hide_photos: hidePhotos,
        include_payment_link: includeLink,
        message: message || null,
      });
      const sent = r.data?.sent || {};
      const okEmail = !sent.email || sent.email.ok;
      const okSms = !sent.sms || sent.sms.ok;
      if (okEmail && okSms) toast.success('Receipt sent');
      else toast.warning('Receipt queued, but some channels failed (check provider config)');
      navigate(`/wrecker/jobs/${id}`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Send failed'); }
    finally { setSending(false); }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading receipt...</div>;
  if (!job) return null;

  const totals = {
    invoice_total: job.invoice_total || 0,
    amount_paid: job.amount_paid || 0,
    balance_due: job.balance_due || 0,
  };

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <header className="sticky top-0 z-10 bg-[#0a0e14]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to={`/wrecker/jobs/${id}`} className="text-slate-400 hover:text-white" data-testid="back-to-job">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber-400">Receipt</div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Send to Customer</h1>
            </div>
          </div>
          <Button data-testid="receipt-send" onClick={send} disabled={sending} size="sm" className="bg-amber-500 text-black hover:bg-amber-400 font-semibold">
            {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Send
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5 pb-32">
        {/* Totals preview */}
        <Card className="p-5 bg-[#0a0e14] border-white/5 grid grid-cols-3 gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Invoice</div>
            <div className="text-lg font-bold text-white tabular-nums">${totals.invoice_total.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Paid</div>
            <div className="text-lg font-bold text-emerald-300 tabular-nums">${totals.amount_paid.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Balance</div>
            <div className={`text-lg font-bold tabular-nums ${totals.balance_due > 0 ? 'text-red-300' : 'text-emerald-300'}`}>${totals.balance_due.toFixed(2)}</div>
          </div>
        </Card>

        {/* Channel */}
        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">Channel</div>
          <div className="flex gap-2">
            {[
              { key: 'email', label: 'Email', icon: Mail },
              { key: 'sms',   label: 'SMS',   icon: MessageCircle },
              { key: 'both',  label: 'Both',  icon: Send },
            ].map((c) => (
              <button key={c.key} data-testid={`channel-${c.key}`} onClick={() => setChannel(c.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition ${channel === c.key ? 'bg-amber-500 text-black border-amber-400 font-semibold' : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/5'}`}>
                <c.icon className="w-4 h-4" /> {c.label}
              </button>
            ))}
          </div>
          {channel !== 'sms' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Email or phone #</label>
              <Input data-testid="receipt-email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="customer@example.com" className="bg-[#07090d] border-white/10 text-white" />
            </div>
          )}
          {channel !== 'email' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Phone (E.164)</label>
              <Input data-testid="receipt-phone" value={toPhone} onChange={(e) => setToPhone(e.target.value)} placeholder="+13175550199" className="bg-[#07090d] border-white/10 text-white" />
            </div>
          )}
        </Card>

        {/* Toggles */}
        <Card className="p-5 bg-[#0a0e14] border-white/5 space-y-3">
          <div className="text-xs uppercase tracking-wider text-slate-400">Receipt Details</div>
          <ToggleRow label="Hide Charges"          checked={hideCharges}    onChange={setHideCharges}    testId="toggle-hide-charges" />
          <ToggleRow label="Hide Discounts"        checked={hideDiscounts}  onChange={setHideDiscounts}  testId="toggle-hide-discounts" />
          <ToggleRow label="Hide Photos"           checked={hidePhotos}     onChange={setHidePhotos}     testId="toggle-hide-photos" />
          <ToggleRow label="Include Online Payment Link" checked={includeLink} onChange={setIncludeLink} testId="toggle-include-link" />
        </Card>

        {/* Message */}
        <Card className="p-5 bg-[#0a0e14] border-white/5">
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Message (optional)</label>
          <Textarea data-testid="receipt-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Thanks for choosing us — drive safe." rows={3} className="bg-[#07090d] border-white/10 text-white text-sm resize-none" />
        </Card>

        <Button data-testid="receipt-send-bottom" onClick={send} disabled={sending} size="lg" className="w-full bg-amber-500 text-black hover:bg-amber-400 font-semibold h-12 text-base">
          {sending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />} Send Receipt
        </Button>
      </main>
    </div>
  );
}

function ToggleRow({ label, checked, onChange, testId }) {
  return (
    <label className="flex items-center justify-between cursor-pointer" data-testid={testId}>
      <span className="text-sm text-slate-200 uppercase tracking-wider text-[11px]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
