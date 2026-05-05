import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, CreditCard, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
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

  const [config, setConfig] = useState(null);
  const [loadingSdk, setLoadingSdk] = useState(true);
  const [sdkError, setSdkError] = useState('');
  const [amount, setAmount] = useState(
    defaultAmount > 0 ? defaultAmount.toFixed(2) : ''
  );
  const [charging, setCharging] = useState(false);
  const [lastResult, setLastResult] = useState(null);

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
      const r = await api.post(`/wrecker/jobs/${jobId}/square-charge`, {
        source_id: tokenResult.token,
        amount: amt,
        autocomplete: true,
      });
      setLastResult(r.data);
      toast.success(`Charged $${amt.toFixed(2)} to card`);
      // Reset card form for next charge
      try { await cardRef.current.clear(); } catch (_) { /* sdk version may not have clear */ }
      if (onSuccess) onSuccess(r.data);
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
            disabled={charging}
          />
        </div>
      </div>

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
