import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, TrendingUp, TrendingDown, Wallet, Calendar, Download, Loader2,
  Receipt, Wrench, Clock, FileSpreadsheet, ArrowUpRight, ArrowDownRight,
  Building2, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_30',    label: 'Last 30 Days' },
  { value: 'ytd',        label: 'Year to Date' },
  { value: 'custom',     label: 'Custom Range\u2026' },
];

function usd(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function num(n) { return Number(n || 0).toLocaleString('en-US'); }

export default function WreckerAccounting() {
  const [period, setPeriod] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [overview, setOverview] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [payroll, setPayroll] = useState(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);

  const periodParams = useMemo(() => {
    const p = new URLSearchParams({ period });
    if (period === 'custom' && customStart && customEnd) {
      p.set('start', customStart);
      p.set('end', customEnd);
    }
    return p.toString();
  }, [period, customStart, customEnd]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, rv, ex, py] = await Promise.all([
        api.get(`/wrecker/accounting/overview?${periodParams}`),
        api.get(`/wrecker/accounting/revenue?${periodParams}`),
        api.get(`/wrecker/accounting/expenses?${periodParams}`),
        api.get(`/wrecker/accounting/payroll?${periodParams}`),
      ]);
      setOverview(ov.data); setRevenue(rv.data); setExpenses(ex.data); setPayroll(py.data);
    } catch (e) {
      toast.error('Could not load accounting data');
    } finally {
      setLoading(false);
    }
  }, [periodParams]);

  useEffect(() => {
    if (period !== 'custom' || (customStart && customEnd)) { load(); }
  }, [load, period, customStart, customEnd]);

  const downloadCsv = async (which) => {
    setExporting(which);
    try {
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/wrecker/accounting/export.csv?tab=${which}&${periodParams}`;
      const token = localStorage.getItem('hp_token');
      const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${which}_${period}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      toast.success(`${which.charAt(0).toUpperCase() + which.slice(1)} CSV downloaded`);
    } catch (e) {
      toast.error(`Export failed: ${e.message}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6" data-testid="wrecker-accounting-page">
      {/* Header */}
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Office · Accounting
          </div>
          <h1 className="text-3xl font-bold text-white mt-1" data-testid="accounting-page-title">Owner&apos;s Books</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real numbers from real jobs. Pull a CSV to hand to your bookkeeper or accountant in one click.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger data-testid="period-select" className="w-44 bg-[#0a0e14] border-white/10 text-white">
              <Calendar className="w-4 h-4 mr-2 text-slate-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} data-testid={`period-${o.value}`}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {period === 'custom' && (
            <>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                     data-testid="period-custom-start" className="w-40 bg-[#0a0e14] border-white/10 text-white" />
              <span className="text-slate-500 text-sm">to</span>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                     data-testid="period-custom-end" className="w-40 bg-[#0a0e14] border-white/10 text-white" />
            </>
          )}
        </div>
      </header>

      {/* Period label */}
      {overview && (
        <div className="text-[11px] uppercase tracking-widest text-slate-500" data-testid="period-label">
          Showing: <span className="text-amber-300 font-semibold">{overview.period_label}</span>
        </div>
      )}

      {loading && !overview && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Crunching the numbers…
        </div>
      )}

      {overview && (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="bg-[#0a0e14] border border-white/10">
            <TabsTrigger value="overview" data-testid="acc-tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="revenue" data-testid="acc-tab-revenue">Revenue</TabsTrigger>
            <TabsTrigger value="expenses" data-testid="acc-tab-expenses">Expenses</TabsTrigger>
            <TabsTrigger value="payroll" data-testid="acc-tab-payroll">Payroll</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard icon={TrendingUp} label="Revenue" value={usd(overview.revenue)}
                       sub={`${overview.job_count} job${overview.job_count === 1 ? '' : 's'}`} accent="emerald" testid="kpi-revenue" />
              <KpiCard icon={Wrench} label="Expenses" value={usd(overview.expenses)}
                       sub={`${overview.expense_count} entries`} accent="rose" testid="kpi-expenses" />
              <KpiCard icon={Clock} label="Payroll" value={usd(overview.payroll)}
                       sub={`${overview.payroll_hours} hrs · ${overview.driver_count} drivers`} accent="sky" testid="kpi-payroll" />
              <KpiCard icon={Wallet} label="Net Profit" value={usd(overview.net_profit)}
                       sub={overview.net_profit >= 0 ? 'in the black' : 'review expenses'}
                       accent={overview.net_profit >= 0 ? 'amber' : 'rose'} testid="kpi-net" />
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="bg-[#0d1218] border-white/5 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-400" /> Revenue by Motor Club / Customer Type
                  </h3>
                </div>
                {overview.by_motor_club?.length ? (
                  <div className="space-y-2" data-testid="by-motor-club">
                    {overview.by_motor_club.map((mc) => {
                      const pct = overview.revenue ? (mc.amount / overview.revenue) * 100 : 0;
                      return (
                        <div key={mc.name} className="text-sm" data-testid={`mc-row-${mc.name.replace(/\s+/g, '-').toLowerCase()}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-slate-300">{mc.name}</span>
                            <span className="text-white tabular-nums">{usd(mc.amount)} <span className="text-slate-500 text-xs">({pct.toFixed(0)}%)</span></span>
                          </div>
                          <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500/60" style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm py-4">No revenue this period yet.</div>
                )}
              </Card>

              <Card className="bg-[#0d1218] border-white/5 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-rose-300" /> Expenses by Category
                  </h3>
                </div>
                {overview.by_expense_category?.length ? (
                  <div className="space-y-2" data-testid="by-expense-cat">
                    {overview.by_expense_category.map((c) => {
                      const pct = overview.expenses ? (c.amount / overview.expenses) * 100 : 0;
                      return (
                        <div key={c.name} className="text-sm" data-testid={`exp-cat-${c.name}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-slate-300 capitalize">{c.name}</span>
                            <span className="text-white tabular-nums">{usd(c.amount)} <span className="text-slate-500 text-xs">({pct.toFixed(0)}%)</span></span>
                          </div>
                          <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500/60" style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm py-4">No expenses recorded this period.</div>
                )}
              </Card>
            </div>

            <div className="flex flex-wrap gap-2">
              <ExportBtn label="Download Overview CSV" onClick={() => downloadCsv('overview')} loading={exporting === 'overview'} testid="export-overview" />
              <ExportBtn label="Revenue CSV" onClick={() => downloadCsv('revenue')} loading={exporting === 'revenue'} testid="export-revenue-quick" />
              <ExportBtn label="Expenses CSV" onClick={() => downloadCsv('expenses')} loading={exporting === 'expenses'} testid="export-expenses-quick" />
              <ExportBtn label="Payroll CSV" onClick={() => downloadCsv('payroll')} loading={exporting === 'payroll'} testid="export-payroll-quick" />
            </div>
          </TabsContent>

          {/* REVENUE */}
          <TabsContent value="revenue" className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-slate-400">
                <span className="text-emerald-300 font-semibold">{usd(revenue?.total)}</span> billed · <span className="text-emerald-200">{usd(revenue?.paid)}</span> collected · <span className="text-amber-300">{usd(revenue?.outstanding)}</span> outstanding
              </div>
              <ExportBtn label="Download Revenue CSV" onClick={() => downloadCsv('revenue')} loading={exporting === 'revenue'} testid="export-revenue" />
            </div>
            <Card className="bg-[#0d1218] border-white/5 overflow-hidden">
              {revenue?.items?.length ? (
                <table className="w-full text-sm" data-testid="revenue-table">
                  <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Customer</th>
                      <th className="text-left px-3 py-2">Vehicle</th>
                      <th className="text-left px-3 py-2">Service</th>
                      <th className="text-left px-3 py-2">Motor Club</th>
                      <th className="text-right px-3 py-2">Amount</th>
                      <th className="text-right px-3 py-2">Paid</th>
                      <th className="text-right px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {revenue.items.map((it) => (
                      <tr key={it.job_id} className="hover:bg-white/[0.02]" data-testid={`rev-row-${it.job_id}`}>
                        <td className="px-3 py-2 text-slate-400 tabular-nums">{(it.date || '').slice(0, 10)}</td>
                        <td className="px-3 py-2 text-white">{it.customer || '—'}</td>
                        <td className="px-3 py-2 text-slate-300">{it.vehicle} {it.plate && <span className="text-slate-500">· {it.plate}</span>}</td>
                        <td className="px-3 py-2 text-slate-300 capitalize">{(it.service || '').replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-slate-300">{it.motor_club}</td>
                        <td className="px-3 py-2 text-right text-white tabular-nums">{usd(it.amount)}</td>
                        <td className="px-3 py-2 text-right text-emerald-300 tabular-nums">{usd(it.paid)}</td>
                        <td className="px-3 py-2 text-right">
                          <PaymentBadge status={it.payment_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-500 text-sm">No completed jobs in this period.</div>
              )}
            </Card>
          </TabsContent>

          {/* EXPENSES */}
          <TabsContent value="expenses" className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-slate-400">
                <span className="text-rose-300 font-semibold">{usd(expenses?.total)}</span> in {num(expenses?.count)} expense{expenses?.count === 1 ? '' : 's'}
              </div>
              <ExportBtn label="Download Expenses CSV" onClick={() => downloadCsv('expenses')} loading={exporting === 'expenses'} testid="export-expenses" />
            </div>
            <Card className="bg-[#0d1218] border-white/5 overflow-hidden">
              {expenses?.items?.length ? (
                <table className="w-full text-sm" data-testid="expenses-table">
                  <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Category</th>
                      <th className="text-left px-3 py-2">Description</th>
                      <th className="text-left px-3 py-2">Truck</th>
                      <th className="text-right px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {expenses.items.map((it) => (
                      <tr key={it.id} className="hover:bg-white/[0.02]" data-testid={`exp-row-${it.id}`}>
                        <td className="px-3 py-2 text-slate-400 tabular-nums">{(it.date || '').slice(0, 10)}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="capitalize border-white/10 text-slate-300 text-[10px]">{it.category}</Badge></td>
                        <td className="px-3 py-2 text-white">{it.description || '—'}</td>
                        <td className="px-3 py-2 text-slate-400">{it.truck_name || '—'}</td>
                        <td className="px-3 py-2 text-right text-rose-300 tabular-nums">{usd(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-500 text-sm">No expenses recorded for this period.</div>
              )}
            </Card>
          </TabsContent>

          {/* PAYROLL */}
          <TabsContent value="payroll" className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-slate-400">
                <span className="text-sky-300 font-semibold">{usd(payroll?.total_gross)}</span> gross · <span className="text-sky-200">{num(payroll?.total_hours)} hrs</span> across {num(payroll?.driver_count)} driver{payroll?.driver_count === 1 ? '' : 's'}
              </div>
              <ExportBtn label="Download Payroll CSV" onClick={() => downloadCsv('payroll')} loading={exporting === 'payroll'} testid="export-payroll" />
            </div>
            <Card className="bg-[#0d1218] border-white/5 overflow-hidden">
              {payroll?.drivers?.length ? (
                <table className="w-full text-sm" data-testid="payroll-table">
                  <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2">Driver</th>
                      <th className="text-right px-3 py-2">Shifts</th>
                      <th className="text-right px-3 py-2">Hours</th>
                      <th className="text-right px-3 py-2">Pay Rate</th>
                      <th className="text-right px-3 py-2">Gross Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {payroll.drivers.map((d) => (
                      <tr key={d.driver_id} className="hover:bg-white/[0.02]" data-testid={`payroll-row-${d.driver_id}`}>
                        <td className="px-3 py-2 text-white">{d.driver_name}</td>
                        <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{d.shifts}</td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{d.hours.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{usd(d.pay_rate)}/hr</td>
                        <td className="px-3 py-2 text-right text-sky-300 font-semibold tabular-nums">{usd(d.gross_pay)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-white/[0.02] font-semibold">
                    <tr>
                      <td className="px-3 py-2 text-white">TOTAL</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right text-white tabular-nums">{num(payroll.total_hours)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right text-sky-300 tabular-nums">{usd(payroll.total_gross)}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-500 text-sm">No completed shifts in this period yet.</div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent, testid }) {
  const a = {
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    rose:    'border-rose-500/30 bg-rose-500/10 text-rose-300',
    sky:     'border-sky-500/30 bg-sky-500/10 text-sky-300',
    amber:   'border-amber-500/30 bg-amber-500/10 text-amber-300',
  }[accent] || 'border-white/10 bg-white/[0.04] text-slate-300';
  return (
    <div className="hp-panel rounded-xl p-4" data-testid={testid}>
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${a}`}><Icon className="w-4 h-4" /></div>
      <div className="mt-3 text-2xl font-semibold text-white tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-slate-500 mt-1">{label}</div>
      <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function PaymentBadge({ status }) {
  if (status === 'paid') return <Badge className="bg-emerald-500/15 border-emerald-500/30 text-emerald-300 text-[10px]">Paid</Badge>;
  if (status === 'partial') return <Badge className="bg-amber-500/15 border-amber-500/30 text-amber-300 text-[10px]">Partial</Badge>;
  return <Badge className="bg-rose-500/15 border-rose-500/30 text-rose-300 text-[10px]">Unpaid</Badge>;
}

function ExportBtn({ label, onClick, loading, testid }) {
  return (
    <Button onClick={onClick} disabled={loading} variant="outline" size="sm"
            className="border-white/10 text-slate-300 hover:bg-white/5" data-testid={testid}>
      {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
      {label}
    </Button>
  );
}
