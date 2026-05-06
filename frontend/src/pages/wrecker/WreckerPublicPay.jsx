import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2, Lock, CheckCircle2, AlertCircle, Truck, CreditCard, Smartphone, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import axios from 'axios';
import { initSquarePayments } from '@/lib/squareSdk';
import { toast } from 'sonner';

/**
 * Public customer-facing payment page (NO auth).
 *
 * Customer arrives via tokenized SMS/email link:  /pay/abc123XYZ...
 *
 * - Fetches GET /api/wrecker/pay/:token (public) for amount + Square config
 * - Mounts Square Web Payments SDK (Card + Apple Pay)
 * - Tokenizes card on Square's iframe (PCI-safe)
 * - POSTs to /api/wrecker/pay/:token/charge
 * - Shows success state with last 4 + Square receipt link
 */
export default function WreckerPublicPay() {
  const { token } = useParams();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  const apiBase = `${backendUrl}/api/wrecker/pay/${token}`;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState('');
  const containerRef = useRef(null);
  const cardRef = useRef(null);
  const paymentsRef = useRef(null);
  const applePayRef = useRef(null);
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [applePayLoading, setApplePayLoading] = useState(false);

  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(null);
  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');

  // ---- Fetch pay-link details ----
  const load = useCallback(async () => {
    try {
      const r = await axios.get(apiBase);
      setData(r.data);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404) setLoadError('Payment link not found.');
      else if (status === 410) setLoadError('This payment link has expired or been canceled.');
      else setLoadError(e?.response?.data?.detail || 'Could not load payment details.');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  // ---- Mount Square SDK once we have config + open balance ----
  useEffect(() => {
    if (!data || data.status !== 'open' || !data.square) return;
    let cancelled = false;
    let cardEl = null;
    (async () => {
      try {
        const payments = await initSquarePayments(
          data.square.application_id, data.square.location_id, data.square.environment,
        );
        if (cancelled) return;
        paymentsRef.current = payments;

        cardEl = await payments.card({
          style: {
            input: { color: '#0f172a', fontSize: '16px', fontFamily: 'Helvetica Neue, Arial, sans-serif' },
            '.input-container': { borderColor: '#e2e8f0', borderRadius: '8px' },
            '.input-container.is-focus': { borderColor: '#f59e0b' },
            '.input-container.is-error': { borderColor: '#ef4444' },
            '.message-text': { color: '#475569' },
            '.message-icon': { color: '#475569' },
          },
        });
        if (cancelled) { await cardEl.destroy().catch(() => {}); return; }
        await cardEl.attach(containerRef.current);
        cardRef.current = cardEl;

        // Try Apple Pay
        try {
          const paymentRequest = payments.paymentRequest({
            countryCode: 'US',
            currencyCode: 'USD',
            total: { amount: data.balance_due.toFixed(2), label: data.company_name || 'Total' },
          });
          const apple = await payments.applePay(paymentRequest);
          if (!cancelled) {
            applePayRef.current = apple;
            setApplePayAvailable(true);
          }
        } catch (_) { /* not on this browser */ }

        setSdkReady(true);
      } catch (e) {
        setSdkError(`Square SDK failed to load: ${e?.message || e}`);
      }
    })();
    return () => {
      cancelled = true;
      if (cardEl?.destroy) cardEl.destroy().catch(() => {});
    };
  }, [data]);

  const charge = async (sourceId, methodLabel) => {
    setPaying(true);
    try {
      const r = await axios.post(`${apiBase}/charge`, {
        source_id: sourceId,
        payer_name: payerName || null,
        payer_email: payerEmail || null,
      });
      setSuccess({ ...r.data, method: methodLabel });
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Payment failed. Try again or contact the shop.';
      toast.error(detail);
    } finally {
      setPaying(false);
    }
  };

  const payWithCard = async () => {
    if (!cardRef.current) return;
    setPaying(true);
    try {
      const tokenResult = await cardRef.current.tokenize();
      if (tokenResult.status !== 'OK') {
        const errs = (tokenResult.errors || []).map((x) => x.message || x.detail).filter(Boolean);
        throw new Error(errs.join('; ') || 'Card validation failed');
      }
      await charge(tokenResult.token, 'Card');
    } catch (e) {
      toast.error(e?.message || 'Card validation failed');
      setPaying(false);
    }
  };

  const payWithApplePay = async () => {
    if (!applePayRef.current) return;
    setApplePayLoading(true);
    try {
      const tokenResult = await applePayRef.current.tokenize();
      if (tokenResult.status !== 'OK') {
        const errs = (tokenResult.errors || []).map((x) => x.message || x.detail).filter(Boolean);
        throw new Error(errs.join('; ') || 'Apple Pay validation failed');
      }
      await charge(tokenResult.token, 'Apple Pay');
    } catch (e) {
      toast.error(e?.message || 'Apple Pay failed');
    } finally {
      setApplePayLoading(false);
    }
  };

  // ---- Render states ----
  if (loading) {
    return (
      <Centered>
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        <div className="text-slate-500 text-sm mt-2">Loading payment details…</div>
      </Centered>
    );
  }

  if (loadError) {
    return (
      <Centered>
        <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
        <div className="text-lg font-bold text-slate-900">Payment link unavailable</div>
        <div className="text-sm text-slate-600 mt-1 text-center max-w-sm">{loadError}</div>
        <div className="text-xs text-slate-400 mt-4">If you believe this is an error, contact the wrecker shop directly.</div>
      </Centered>
    );
  }

  if (!data) return null;

  // Paid in full
  if (data.status === 'paid' || success) {
    const card_brand = success?.card_brand;
    const last_4 = success?.last_4;
    return (
      <Page>
        <Header data={data} />
        <Card className="p-6 text-center bg-emerald-50 border-emerald-200">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
          <div className="text-2xl font-bold text-emerald-900" data-testid="public-pay-paid">
            {success ? 'Payment Approved!' : 'Already Paid'}
          </div>
          <div className="text-emerald-800 mt-1">
            {success ? `$${success.amount_paid?.toFixed(2)} via ${success.method || 'card'}` : `Invoice #${data.job_short_id} is paid in full`}
          </div>
          {card_brand && last_4 && (
            <div className="text-emerald-700/80 text-sm mt-2">{card_brand} ···· {last_4}</div>
          )}
          {success?.receipt_url && (
            <a href={success.receipt_url} target="_blank" rel="noreferrer" data-testid="public-pay-square-receipt"
              className="inline-block mt-4 text-emerald-700 hover:text-emerald-900 underline text-sm">
              View Square receipt →
            </a>
          )}
          <div className="text-xs text-slate-500 mt-6">
            Thanks for choosing {data.company_name}. You can safely close this window.
          </div>
        </Card>
      </Page>
    );
  }

  if (data.status === 'unconfigured') {
    return (
      <Page>
        <Header data={data} />
        <Card className="p-6 text-center bg-amber-50 border-amber-200">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <div className="text-lg font-bold text-amber-900">Online payment temporarily unavailable</div>
          <div className="text-sm text-amber-800 mt-2">
            Please contact <span className="font-semibold">{data.company_name}</span> to settle this invoice.
          </div>
        </Card>
      </Page>
    );
  }

  // Open balance — show card form
  return (
    <Page>
      <Header data={data} />

      {/* Amount summary */}
      <Card className="p-5 bg-white border-slate-200" data-testid="public-pay-summary">
        <div className="flex items-baseline justify-between">
          <span className="text-slate-500 uppercase tracking-widest text-[11px]">Amount Due</span>
          <span className="text-3xl font-bold tabular-nums text-slate-900">${data.balance_due.toFixed(2)}</span>
        </div>
        <div className="mt-3 text-sm text-slate-600 flex items-center gap-1.5">
          <Truck className="w-4 h-4" /> {data.vehicle_label}{data.plate ? ` · ${data.plate}` : ''}
        </div>
        <div className="text-xs text-slate-500 mt-1">Invoice #{data.job_short_id}</div>
      </Card>

      {sdkError && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">{sdkError}</div>
          </div>
        </Card>
      )}

      {/* Optional contact info */}
      <Card className="p-5 bg-white border-slate-200 space-y-3">
        <div className="text-[11px] uppercase tracking-widest text-slate-500">Your Contact (optional)</div>
        <Input data-testid="public-pay-name" placeholder="Your name" value={payerName} onChange={(e) => setPayerName(e.target.value)} className="bg-white border-slate-200 text-slate-900" />
        <Input data-testid="public-pay-email" placeholder="Email (for the receipt)" type="email" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} className="bg-white border-slate-200 text-slate-900" />
      </Card>

      {/* Apple Pay */}
      {applePayAvailable && (
        <button
          type="button"
          onClick={payWithApplePay}
          disabled={paying || applePayLoading}
          data-testid="public-pay-applepay"
          className="w-full h-14 rounded-xl bg-black text-white font-medium flex items-center justify-center gap-2 hover:bg-zinc-800 active:scale-[0.99] transition disabled:opacity-50"
        >
          {applePayLoading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Authorizing…</>
          ) : (
            <>
              <Smartphone className="w-4 h-4" />
              <span className="text-[15px]">Pay</span>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M16.365 1.43c0 1.14-.46 2.23-1.21 3.04-.81.86-2.1 1.51-3.16 1.43-.13-1.13.43-2.31 1.16-3.07.83-.85 2.21-1.48 3.21-1.4Zm3.5 16.18c-.6 1.39-.88 2.01-1.66 3.24-1.08 1.71-2.61 3.84-4.51 3.86-1.69.01-2.12-1.1-4.41-1.08-2.29.01-2.76 1.1-4.45 1.08-1.9-.02-3.34-1.94-4.42-3.65C-.7 17.31-.97 12.78 1.13 9.71 2.59 7.5 4.78 6.16 6.83 6.16c2.09 0 3.41 1.16 5.14 1.16 1.68 0 2.7-1.16 5.12-1.16 1.83 0 3.78 1 5.16 2.74-4.54 2.49-3.81 9.01-1.39 9.71Z" /></svg>
            </>
          )}
        </button>
      )}

      {applePayAvailable && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[10px] uppercase tracking-widest text-slate-400">or pay with card</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
      )}

      {/* Card form */}
      <Card className="p-5 bg-white border-slate-200">
        <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" /> Card Information
        </div>
        <div className="relative">
          <div ref={containerRef} data-testid="public-pay-card-container" className="min-h-[88px] bg-white border border-slate-200 rounded-lg p-2" />
          {!sdkReady && !sdkError && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm bg-white/90 rounded-lg">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading secure card form…
            </div>
          )}
        </div>

        <Button
          data-testid="public-pay-charge-btn"
          onClick={payWithCard}
          disabled={paying || !sdkReady}
          size="lg"
          className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-black font-bold h-14 text-base"
        >
          {paying ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing…</>
          ) : (
            <><Lock className="w-4 h-4 mr-2" /> Pay ${data.balance_due.toFixed(2)}</>
          )}
        </Button>
      </Card>

      {/* Trust footer */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-2">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        Secured by Square. Your card details are never stored on our servers.
      </div>
    </Page>
  );
}

const Page = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-900 py-6 px-4" data-testid="public-pay-page">
    <div className="max-w-md mx-auto space-y-3">{children}</div>
  </div>
);

const Centered = ({ children }) => (
  <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6">{children}</div>
);

const Header = ({ data }) => (
  <div className="text-center pt-4 pb-2">
    <div className="text-[11px] uppercase tracking-widest text-amber-600">Tow Service Payment</div>
    <div className="text-2xl font-bold text-slate-900 mt-1" data-testid="pay-company-name">{data.company_name}</div>
    {(data.company_phone || data.company_email || data.company_location) && (
      <div className="text-xs text-slate-500 mt-1.5 space-x-2" data-testid="pay-company-contact">
        {data.company_phone && <span>{data.company_phone}</span>}
        {data.company_email && <><span className="text-slate-300">·</span><span>{data.company_email}</span></>}
        {data.company_location && <><span className="text-slate-300">·</span><span>{data.company_location}</span></>}
      </div>
    )}
  </div>
);
