import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, CreditCard, Lock, AlertCircle, CheckCircle2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { initSquarePayments } from '@/lib/squareSdk';
import { toast } from 'sonner';

/**
 * Square Card Charge widget.
 * Mounts the Square Web Payments SDK card form, lets the operator type an
 * amount + a card, tokenizes the card, and POSTs to our backend to charge.
 *
 * Props:
 *   jobId          — required, the tow job to apply the payment to
 *   defaultAmount  — pre-filled amount (e.g. balance_due)
 *   onSuccess      — callback({payment, totals}) after a successful charge
 *
 * The card data is tokenized on Square's side — it never touches our backend.
 */
export default function SquareCardCharge({ jobId, defaultAmount = 0, onSuccess }) {
  const containerRef = useRef(null);
  const cardRef = useRef(null);
  const paymentsRef = useRef(null);
  const applePayBtnRef = useRef(null);
  const applePayRef = useRef(null);
  const lastPaymentReqRef = useRef(null);

  const [config, setConfig] = useState(null);
  const [loadingSdk, setLoadingSdk] = useState(true);
  const [sdkError, setSdkError] = useState('');
  const [amount, setAmount] = useState(
    defaultAmount > 0 ? defaultAmount.toFixed(2) : ''
  );
  const [charging, setCharging] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [applePayLoading, setApplePayLoading] = useState(false);

  // ---- Charge handler shared by card form AND Apple Pay flow ----
  const sendChargeToBackend = useCallback(async (sourceId, amt, methodLabel = 'card') => {
    const r = await api.post(`/wrecker/jobs/${jobId}/square-charge`, {
      source_id: sourceId,
      amount: amt,
      autocomplete: true,
    });
    setLastResult(r.data);
    toast.success(`Charged $${amt.toFixed(2)} via ${methodLabel}`);
    if (onSuccess) onSuccess(r.data);
    return r.data;
  }, [jobId, onSuccess]);

  // Fetch the per-tenant Square config from our backend
  const loadConfig = useCallback(async () => {
    try {
      setLoadingSdk(true);
      setSdkError('');
      const r = await api.get('/wrecker/integrations/square/webpayments-config');
      setConfig(r.data);
      return r.data;
    } catch (e) {
      const detail = e?.response?.data?.detail
        || 'Square is not connected. Visit Settings → Payments and click "Connect with Square".';
      setSdkError(detail);
      setLoadingSdk(false);
      return null;
    }
  }, []);

  // Mount Square card element once we have config
  useEffect(() => {
    let cancelled = false;
    let cardEl = null;
    (async () => {
      const cfg = await loadConfig();
      if (!cfg || cancelled) return;
      try {
        const payments = await initSquarePayments(
          cfg.application_id, cfg.location_id, cfg.environment,
        );
        if (cancelled) return;
        paymentsRef.current = payments;
        cardEl = await payments.card({
          style: {
            input: {
              color: '#ffffff',
              fontSize: '15px',
              fontFamily: 'Helvetica Neue, Arial, sans-serif',
            },
            '.input-container': {
              borderColor: '#1f2937',
              borderRadius: '8px',
            },
            '.input-container.is-focus': {
              borderColor: '#fbbf24',
            },
            '.input-container.is-error': {
              borderColor: '#f87171',
            },
            '.message-text': {
              color: '#cbd5e1',
            },
            '.message-icon': {
              color: '#cbd5e1',
            },
            '.message-icon.is-error': {
              color: '#f87171',
            },
          },
        });
        if (cancelled) {
          await cardEl.destroy().catch(() => {});
          return;
        }
        await cardEl.attach(containerRef.current);
        cardRef.current = cardEl;
        setLoadingSdk(false);
      } catch (e) {
        setSdkError(`Square SDK failed to load: ${e?.message || e}`);
        setLoadingSdk(false);
      }
    })();
    return () => {
      cancelled = true;
      if (cardEl && cardEl.destroy) cardEl.destroy().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Apple Pay init / re-init whenever the amount changes ----
  // Square's paymentRequest needs the dollar amount baked in, so we destroy
  // and re-create the Apple Pay button each time the amount changes.
  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      const payments = paymentsRef.current;
      if (!payments) return;
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) {
        // Clean up any existing button
        if (applePayRef.current?.destroy) {
          try { await applePayRef.current.destroy(); } catch (_) { /* */ }
        }
        applePayRef.current = null;
        setApplePayAvailable(false);
        return;
      }
      try {
        // Destroy any previous instance
        if (applePayRef.current?.destroy) {
          try { await applePayRef.current.destroy(); } catch (_) { /* */ }
          applePayRef.current = null;
        }
        const paymentRequest = payments.paymentRequest({
          countryCode: 'US',
          currencyCode: 'USD',
          total: { amount: amt.toFixed(2), label: 'Total' },
        });
        lastPaymentReqRef.current = paymentRequest;
        const apple = await payments.applePay(paymentRequest);
        if (cancelled) {
          if (apple?.destroy) await apple.destroy().catch(() => {});
          return;
        }
        applePayRef.current = apple;
        setApplePayAvailable(true);
      } catch (e) {
        // Apple Pay not available on this browser/device — silently hide
        applePayRef.current = null;
        setApplePayAvailable(false);
      }
    };
    setup();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, loadingSdk]);

  const payWithApplePay = async () => {
    if (!applePayRef.current) { toast.error('Apple Pay not ready'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter an amount greater than $0'); return; }
    setApplePayLoading(true);
    setLastResult(null);
    try {
      const tokenResult = await applePayRef.current.tokenize();
      if (tokenResult.status !== 'OK') {
        const errs = (tokenResult.errors || []).map((x) => x.message || x.detail).filter(Boolean);
        throw new Error(errs.join('; ') || 'Apple Pay tokenization failed');
      }
      await sendChargeToBackend(tokenResult.token, amt, 'Apple Pay');
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || 'Apple Pay charge failed';
      toast.error(detail);
      setLastResult({ ok: false, error: detail });
    } finally {
      setApplePayLoading(false);
    }
  };

  const charge = async () => {
    if (!cardRef.current) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter an amount greater than $0'); return; }
    setCharging(true);
    setLastResult(null);
    try {
      const tokenResult = await cardRef.current.tokenize();
      if (tokenResult.status !== 'OK') {
        const errs = (tokenResult.errors || []).map((x) => x.message || x.detail).filter(Boolean);
        throw new Error(errs.join('; ') || 'Card tokenization failed');
      }
      await sendChargeToBackend(tokenResult.token, amt, 'Card');
      // Reset card form for next charge
      try { await cardRef.current.clear(); } catch (_) { /* sdk version may not have clear */ }
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || 'Charge failed';
      toast.error(detail);
      setLastResult({ ok: false, error: detail });
    } finally {
      setCharging(false);
    }
  };

  if (sdkError) {
    return (
      <Card className="bg-amber-500/10 border-amber-500/30 p-5" data-testid="square-not-connected">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-amber-200">Square not ready</div>
            <div className="text-amber-200/80 mt-1">{sdkError}</div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="square-card-charge">
      {/* Environment / merchant header */}
      {config && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px]">
            <Lock className="w-3 h-3 mr-1" /> PCI-Safe
          </Badge>
          <Badge variant="outline" className={
            (config.environment === 'production'
              ? 'border-emerald-500/40 text-emerald-300'
              : 'border-amber-500/40 text-amber-300') + ' text-[10px] uppercase tracking-wider'
          }>
            {config.environment === 'production' ? 'Live' : 'Sandbox'}
          </Badge>
          {config.merchant_name && (
            <span className="text-[11px] text-slate-500">→ {config.merchant_name}</span>
          )}
        </div>
      )}

      {/* Amount */}
      <div>
        <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 block">Amount</label>
        <div className="flex items-center bg-[#07090d] border border-white/10 rounded-lg overflow-hidden">
          <span className="px-3 text-slate-500 text-base">$</span>
          <Input
            data-testid="square-amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="bg-transparent border-0 text-white text-lg h-12 focus-visible:ring-0 tabular-nums"
            disabled={charging || applePayLoading}
          />
        </div>
      </div>

      {/* Apple Pay — shown only when supported on this browser/device */}
      {applePayAvailable && (
        <div data-testid="apple-pay-section">
          <button
            ref={applePayBtnRef}
            type="button"
            onClick={payWithApplePay}
            disabled={applePayLoading || charging || !amount || parseFloat(amount) <= 0}
            data-testid="apple-pay-btn"
            className="w-full h-12 rounded-lg bg-black text-white font-medium flex items-center justify-center gap-2 hover:bg-zinc-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
            aria-label="Pay with Apple Pay"
          >
            {applePayLoading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Authorizing…</>
            ) : (
              <>
                <Smartphone className="w-4 h-4" />
                <span className="text-[15px]">Pay</span>
                {/*  Apple logo via SVG path so we don't need an image asset */}
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <path d="M16.365 1.43c0 1.14-.46 2.23-1.21 3.04-.81.86-2.1 1.51-3.16 1.43-.13-1.13.43-2.31 1.16-3.07.83-.85 2.21-1.48 3.21-1.4Zm3.5 16.18c-.6 1.39-.88 2.01-1.66 3.24-1.08 1.71-2.61 3.84-4.51 3.86-1.69.01-2.12-1.1-4.41-1.08-2.29.01-2.76 1.1-4.45 1.08-1.9-.02-3.34-1.94-4.42-3.65C-.7 17.31-.97 12.78 1.13 9.71 2.59 7.5 4.78 6.16 6.83 6.16c2.09 0 3.41 1.16 5.14 1.16 1.68 0 2.7-1.16 5.12-1.16 1.83 0 3.78 1 5.16 2.74-4.54 2.49-3.81 9.01-1.39 9.71Z" />
                </svg>
              </>
            )}
          </button>
          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[10px] uppercase tracking-widest text-slate-600">or pay with card</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>
        </div>
      )}

      {/* Card element */}
      <div>
        <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 block flex items-center gap-1.5">
          <CreditCard className="w-3 h-3" /> Card
        </label>
        <div className="relative">
          <div
            ref={containerRef}
            data-testid="square-card-container"
            className="min-h-[88px] bg-[#07090d] border border-white/10 rounded-lg p-2"
          />
          {loadingSdk && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm bg-[#07090d]/80 rounded-lg pointer-events-none">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading secure card form…
            </div>
          )}
        </div>
      </div>

      {/* Charge button */}
      <Button
        data-testid="square-charge-btn"
        onClick={charge}
        disabled={charging || loadingSdk || !amount || parseFloat(amount) <= 0}
        size="lg"
        className="w-full bg-amber-500 text-black hover:bg-amber-400 font-bold h-12 text-base"
      >
        {charging ? (
          <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing…</>
        ) : (
          <><Lock className="w-4 h-4 mr-2" /> Charge ${parseFloat(amount || 0).toFixed(2)}</>
        )}
      </Button>

      {/* Last result */}
      {lastResult?.ok && (
        <Card className="bg-emerald-500/10 border-emerald-500/30 p-4" data-testid="charge-success-card">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-emerald-200">
                Approved — ${lastResult.payment.amount.toFixed(2)}
              </div>
              <div className="text-emerald-200/80 text-[12px] mt-1">
                {lastResult.payment.square?.card_brand} ···· {lastResult.payment.square?.last_4}
                {' · '}
                Status: {lastResult.square_status}
              </div>
              {lastResult.receipt_url && (
                <a
                  href={lastResult.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="square-receipt-link"
                  className="text-emerald-300 hover:text-emerald-200 text-[12px] underline mt-1 inline-block"
                >
                  View Square receipt →
                </a>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Footer microcopy */}
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Card data is tokenized by Square. Wreckerlogix never sees or stores card numbers.
        Funds settle to your connected Square account, not Wreckerlogix.
      </p>
    </div>
  );
}
