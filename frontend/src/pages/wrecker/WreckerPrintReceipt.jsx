import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';

/**
 * Print-friendly receipt page. Auto-launches the browser print dialog on load.
 * Designed for AirPrint / network printer / save-as-PDF workflow.
 *
 * Route: /wrecker/jobs/:id/print
 */
export default function WreckerPrintReceipt() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [companyName, setCompanyName] = useState('Your Wrecker Service');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/wrecker/jobs/${id}`);
        setJob(r.data);
        // Best-effort company name from waiver template
        try {
          const w = await api.get('/wrecker/waiver-template');
          if (w?.data?.company_name) setCompanyName(w.data.company_name);
        } catch (_) { /* non-fatal */ }
      } catch (e) {
        setErr('Job not found');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Auto-trigger print once the receipt is rendered
  useEffect(() => {
    if (!loading && job) {
      // Slight delay so images and fonts have time to settle
      const t = setTimeout(() => {
        try { window.print(); } catch (_) { /* user can hit Ctrl/Cmd+P */ }
      }, 600);
      return () => clearTimeout(t);
    }
  }, [loading, job]);

  if (loading) return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Loading receipt…</div>;
  if (err || !job) return <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#dc2626' }}>{err || 'Not found'}</div>;

  const v = job.vehicle || {};
  const c = job.customer || {};
  const charges = job.charges || [];
  const payments = job.payments || [];
  const subtotal = charges.reduce((s, x) => s + (Number(x.subtotal) || 0), 0);
  const tax = Number(job.tax) || 0;
  const invoiceTotal = Number(job.invoice_total) || subtotal + tax;
  const amountPaid = Number(job.amount_paid) || payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balanceDue = Number(job.balance_due) || (invoiceTotal - amountPaid);
  const veh = [v.year, v.color, v.make, v.model].filter(Boolean).join(' ');
  const jobShort = (job.id || '').slice(0, 8).toUpperCase();
  const completedAt = job.completed_at || job.updated_at || job.created_at;

  return (
    <>
      {/* Print-specific styles */}
      <style>{`
        @page { size: letter; margin: 0.5in; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
        body { background: #f1f5f9; margin: 0; }
      `}</style>

      <div data-testid="print-receipt-root" style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        color: '#0f172a',
        maxWidth: 720,
        margin: '0 auto',
        padding: 24,
        background: '#fff',
        minHeight: '100vh',
      }}>
        {/* Toolbar (hidden on print) */}
        <div className="no-print" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 24, paddingBottom: 12, borderBottom: '1px solid #e2e8f0',
        }}>
          <button onClick={() => window.history.back()} style={{
            background: 'transparent', border: '1px solid #cbd5e1', padding: '6px 12px',
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }} data-testid="print-back-btn">← Back</button>
          <button onClick={() => window.print()} style={{
            background: '#0f172a', color: '#fff', border: 'none', padding: '8px 16px',
            borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }} data-testid="print-trigger-btn">🖨️ Print</button>
        </div>

        {/* Header */}
        <div style={{
          background: '#0f172a', color: '#fff', padding: '20px 24px',
          borderRadius: '12px 12px 0 0',
        }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#fbbf24' }}>
            Tow Service Receipt
          </div>
          <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 6 }}>{companyName}</div>
        </div>

        {/* Body */}
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0', borderTop: 'none',
          borderRadius: '0 0 12px 12px', padding: 24,
        }}>
          {/* Meta row */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between',
            gap: 16, fontSize: 13, color: '#475569', marginBottom: 16,
          }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#94a3b8' }}>Job</div>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>#{jobShort}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#94a3b8' }}>Date</div>
              <div style={{ color: '#0f172a' }}>{completedAt ? new Date(completedAt).toLocaleString() : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#94a3b8' }}>Vehicle</div>
              <div style={{ color: '#0f172a' }}>{veh || '—'} {v.plate ? `· ${v.plate}` : ''}</div>
            </div>
          </div>

          {/* Customer */}
          {(c.name || c.phone || c.email) && (
            <div style={{
              border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16,
              fontSize: 13,
            }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4 }}>Customer</div>
              {c.name && <div style={{ color: '#0f172a', fontWeight: 600 }}>{c.name}</div>}
              {c.phone && <div style={{ color: '#475569' }}>{c.phone}</div>}
              {c.email && <div style={{ color: '#475569' }}>{c.email}</div>}
            </div>
          )}

          {/* Charges */}
          {charges.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 0', borderBottom: '2px solid #0f172a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', borderBottom: '2px solid #0f172a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, width: 80 }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', borderBottom: '2px solid #0f172a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, width: 100 }}>Rate</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', borderBottom: '2px solid #0f172a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, width: 100 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((ch, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>{ch.label}</td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>{ch.qty || 1}</td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>${(Number(ch.rate) || 0).toFixed(2)}</td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: 600 }}>${(Number(ch.subtotal) || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Totals */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              <tr><td style={{ padding: '4px 0' }}>Subtotal</td><td style={{ padding: '4px 0', textAlign: 'right' }}>${subtotal.toFixed(2)}</td></tr>
              <tr><td style={{ padding: '4px 0' }}>Tax</td><td style={{ padding: '4px 0', textAlign: 'right' }}>${tax.toFixed(2)}</td></tr>
              <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 0', fontSize: 16, fontWeight: 'bold' }}>Invoice Total</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontSize: 16, fontWeight: 'bold' }}>${invoiceTotal.toFixed(2)}</td>
              </tr>
              {amountPaid > 0 && (
                <tr><td style={{ padding: '4px 0', color: '#16a34a' }}>Payments Received</td><td style={{ padding: '4px 0', textAlign: 'right', color: '#16a34a' }}>−${amountPaid.toFixed(2)}</td></tr>
              )}
              <tr style={{ borderTop: '2px solid #0f172a' }}>
                <td style={{ padding: '10px 0', color: balanceDue > 0 ? '#dc2626' : '#16a34a', fontWeight: 'bold', fontSize: 16 }}>
                  Balance {balanceDue > 0 ? 'Due' : 'Paid in Full'}
                </td>
                <td style={{ padding: '10px 0', textAlign: 'right', color: balanceDue > 0 ? '#dc2626' : '#16a34a', fontWeight: 'bold', fontSize: 16 }}>
                  ${balanceDue.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Payments breakdown */}
          {payments.length > 0 && (
            <div style={{ marginTop: 20, fontSize: 12, color: '#475569' }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>Payments</div>
              {payments.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span>{p.method || 'payment'} {p.note ? `· ${p.note}` : ''} {p.at ? `· ${new Date(p.at).toLocaleDateString()}` : ''}</span>
                  <span style={{ fontWeight: 600 }}>${(Number(p.amount) || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{
            marginTop: 28, paddingTop: 16, borderTop: '1px solid #e2e8f0',
            color: '#94a3b8', fontSize: 11, textAlign: 'center',
          }}>
            Thanks for choosing {companyName}. Powered by Wreckerlogix on RoadBoss.
          </div>
        </div>
      </div>
    </>
  );
}
