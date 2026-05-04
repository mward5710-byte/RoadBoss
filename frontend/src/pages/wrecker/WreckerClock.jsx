import React, { useEffect, useState, useCallback } from 'react';
import { api, getUser } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, LogIn, LogOut, Coffee, Play, Pause, Users, Calendar, DollarSign, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

function formatHM(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function activeWorkedMinutes(shift) {
  if (!shift?.clocked_in_at) return 0;
  const start = new Date(shift.clocked_in_at).getTime();
  const now = Date.now();
  let total = (now - start) / 60000;
  let lunch = 0;
  for (const l of shift.lunches || []) {
    const ls = new Date(l.start).getTime();
    const le = l.end ? new Date(l.end).getTime() : now;
    lunch += Math.max(0, (le - ls) / 60000);
  }
  return Math.max(0, total - lunch);
}

function shiftStatus(shift) {
  if (!shift) return 'off';
  if (shift.clocked_out_at) return 'closed';
  const lunches = shift.lunches || [];
  if (lunches.length && !lunches[lunches.length - 1].end) return 'lunch';
  return 'on';
}

export default function WreckerClock() {
  const me = getUser();
  const isDispatcher = ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'dispatcher'].includes(me?.role);

  const [activeShifts, setActiveShifts] = useState([]);
  const [todayMine, setTodayMine] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [payroll, setPayroll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('clock');

  const load = useCallback(async () => {
    try {
      const tasks = [api.get('/wrecker/clock/today')];
      if (isDispatcher) {
        tasks.push(api.get('/wrecker/clock/active'));
        tasks.push(api.get('/wrecker/drivers'));
      }
      const [me, act, drv] = await Promise.all(tasks);
      setTodayMine(me.data);
      setActiveShifts(act?.data || []);
      setDrivers(drv?.data || []);
    } catch (e) { /* */ }
    finally { setLoading(false); }
  }, [isDispatcher]);
  useEffect(() => { load(); }, [load]);

  // Tick every second so the live clock counter updates
  const [, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const loadPayroll = useCallback(async () => {
    try { const r = await api.get('/wrecker/payroll/preview'); setPayroll(r.data); }
    catch (e) { toast.error('Could not load payroll'); }
  }, []);
  useEffect(() => { if (tab === 'payroll' && isDispatcher) loadPayroll(); }, [tab, isDispatcher, loadPayroll]);

  const action = async (act, driver_id) => {
    try {
      await api.post('/wrecker/clock', { action: act, driver_id });
      const labels = { in: 'Clocked in', out: 'Clocked out', lunch_start: 'Lunch started', lunch_end: 'Back from lunch' };
      toast.success(labels[act] || 'Done');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Clock action failed');
    }
  };

  const myOpen = todayMine.find((s) => !s.clocked_out_at);
  const myStatus = shiftStatus(myOpen);

  if (loading) return <div className="p-6 text-slate-400">Loading time clock...</div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-400">Time Clock</div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-1 flex items-center gap-2"><Clock className="w-6 h-6 text-amber-400" /> Clock In / Out</h1>
          <p className="text-sm text-slate-400 mt-1">Crew time tracking · feeds payroll auto-fill</p>
        </div>
        <div className="flex gap-2">
          {isDispatcher && (
            <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/10 rounded-lg">
              <TabBtn active={tab === 'clock'}    onClick={() => setTab('clock')}    icon={Clock} label="Clock" testId="tab-clock" />
              <TabBtn active={tab === 'crew'}     onClick={() => setTab('crew')}     icon={Users} label="Crew" testId="tab-crew" />
              <TabBtn active={tab === 'payroll'}  onClick={() => setTab('payroll')}  icon={DollarSign} label="Payroll" testId="tab-payroll" />
            </div>
          )}
        </div>
      </header>

      {tab === 'clock' && (
        <>
          {/* My status big card */}
          <Card className={`p-6 border ${myStatus === 'on' ? 'bg-emerald-500/10 border-emerald-500/30' : myStatus === 'lunch' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-[#0a0e14] border-white/5'}`}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400">My Shift</div>
                <div className="text-3xl font-bold text-white mt-1">
                  {myStatus === 'on'    && <span className="text-emerald-300">On the Clock</span>}
                  {myStatus === 'lunch' && <span className="text-amber-300">On Lunch</span>}
                  {myStatus === 'off'   && <span className="text-slate-300">Off the Clock</span>}
                </div>
                {myOpen && (
                  <div className="text-sm text-slate-400 mt-1">
                    Clocked in {formatTime(myOpen.clocked_in_at)} · Worked: <span className="text-white font-semibold tabular-nums">{formatHM(activeWorkedMinutes(myOpen))}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {myStatus === 'off' && (
                  <Button data-testid="me-clock-in" size="lg" onClick={() => action('in')} className="bg-emerald-500 text-black hover:bg-emerald-400 font-bold">
                    <LogIn className="w-5 h-5 mr-2" /> Clock In
                  </Button>
                )}
                {myStatus === 'on' && (
                  <>
                    <Button data-testid="me-lunch-start" size="lg" onClick={() => action('lunch_start')} variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10">
                      <Coffee className="w-5 h-5 mr-2" /> Start Lunch
                    </Button>
                    <Button data-testid="me-clock-out" size="lg" onClick={() => action('out')} className="bg-red-500 text-white hover:bg-red-400 font-bold">
                      <LogOut className="w-5 h-5 mr-2" /> Clock Out
                    </Button>
                  </>
                )}
                {myStatus === 'lunch' && (
                  <Button data-testid="me-lunch-end" size="lg" onClick={() => action('lunch_end')} className="bg-amber-500 text-black hover:bg-amber-400 font-bold">
                    <Play className="w-5 h-5 mr-2" /> Back from Lunch
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Today's history */}
          <Card className="p-5 bg-[#0a0e14] border-white/5">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">My Recent Shifts (24h)</div>
            {todayMine.length === 0 ? (
              <div className="text-sm text-slate-500 italic">No shifts in the last 24 hours.</div>
            ) : (
              <div className="divide-y divide-white/5">
                {todayMine.map((s) => (
                  <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="text-slate-200">{formatTime(s.clocked_in_at)} → {s.clocked_out_at ? formatTime(s.clocked_out_at) : <span className="text-emerald-300">on duty</span>}</div>
                      {(s.lunches || []).length > 0 && (
                        <div className="text-[11px] text-slate-500">{s.lunches.length} lunch break{s.lunches.length > 1 ? 's' : ''}</div>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-white font-semibold tabular-nums">{formatHM(s.worked_minutes ?? activeWorkedMinutes(s))}</div>
                      {s.lunch_minutes > 0 && <div className="text-[11px] text-slate-500">{formatHM(s.lunch_minutes)} lunch</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'crew' && isDispatcher && (
        <Card className="p-5 bg-[#0a0e14] border-white/5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">Crew On The Clock ({activeShifts.length})</div>
            <Button onClick={load} size="sm" variant="outline" className="border-white/10 text-slate-300"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          </div>
          {activeShifts.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">No crew currently clocked in.</div>
          ) : (
            <div className="space-y-2">
              {activeShifts.map((s) => {
                const inLunch = (s.lunches || []).length && !s.lunches[s.lunches.length - 1].end;
                return (
                  <div key={s.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/5 flex items-center gap-3 flex-wrap" data-testid={`shift-${s.driver_id}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${inLunch ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white">{s.driver_name || s.driver_id?.slice(0, 8)} {s.truck_number && <span className="text-slate-500 text-xs">· Truck {s.truck_number}</span>}</div>
                      <div className="text-[11px] text-slate-500">In {formatTime(s.clocked_in_at)} · {inLunch ? <span className="text-amber-300">on lunch</span> : 'working'} · {formatHM(activeWorkedMinutes(s))}</div>
                    </div>
                    <div className="flex gap-1.5">
                      {!inLunch ? (
                        <Button onClick={() => action('lunch_start', s.driver_id)} size="sm" variant="outline" className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10" data-testid={`lunch-start-${s.driver_id}`}>
                          <Coffee className="w-3.5 h-3.5 mr-1" /> Lunch
                        </Button>
                      ) : (
                        <Button onClick={() => action('lunch_end', s.driver_id)} size="sm" variant="outline" className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10" data-testid={`lunch-end-${s.driver_id}`}>
                          <Play className="w-3.5 h-3.5 mr-1" /> End Lunch
                        </Button>
                      )}
                      <Button onClick={() => action('out', s.driver_id)} size="sm" className="bg-red-500/80 text-white hover:bg-red-500" data-testid={`clock-out-${s.driver_id}`}>
                        <LogOut className="w-3.5 h-3.5 mr-1" /> Out
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Clock-in for off-duty drivers */}
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Clock In an Off-Duty Driver</div>
            <div className="flex flex-wrap gap-1.5">
              {drivers.filter((d) => !activeShifts.some((s) => s.driver_id === d.id)).map((d) => (
                <Button key={d.id} onClick={() => action('in', d.id)} size="sm" variant="outline" className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5" data-testid={`clock-in-${d.id}`}>
                  <LogIn className="w-3.5 h-3.5 mr-1" /> {d.name}
                </Button>
              ))}
              {drivers.filter((d) => !activeShifts.some((s) => s.driver_id === d.id)).length === 0 && (
                <span className="text-xs text-slate-500 italic">All drivers are clocked in.</span>
              )}
            </div>
          </div>
        </Card>
      )}

      {tab === 'payroll' && isDispatcher && (
        <Card className="p-5 bg-[#0a0e14] border-white/5">
          {payroll ? (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400">Payroll Preview · last 14 days</div>
                  <div className="text-[11px] text-slate-500 mt-1">{new Date(payroll.start).toLocaleDateString()} — {new Date(payroll.end).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-emerald-300 tabular-nums">${payroll.total_gross.toFixed(2)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{payroll.total_hours} hrs total</div>
                </div>
              </div>
              {payroll.drivers.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">No completed shifts in this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                    <tr>
                      <th className="text-left py-2">Driver</th>
                      <th className="text-right py-2">Shifts</th>
                      <th className="text-right py-2">Hours</th>
                      <th className="text-right py-2">Lunch</th>
                      <th className="text-right py-2">Jobs</th>
                      <th className="text-right py-2">Rate</th>
                      <th className="text-right py-2">Gross</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {payroll.drivers.map((d) => (
                      <tr key={d.driver_id} data-testid={`payroll-${d.driver_id}`}>
                        <td className="py-2 text-white">{d.driver_name} {d.truck_number && <span className="text-[10px] text-slate-500">· Truck {d.truck_number}</span>}</td>
                        <td className="py-2 text-right text-slate-300 tabular-nums">{d.shifts}</td>
                        <td className="py-2 text-right text-white tabular-nums font-semibold">{d.hours}</td>
                        <td className="py-2 text-right text-amber-300 tabular-nums">{formatHM(d.total_lunch_min)}</td>
                        <td className="py-2 text-right text-sky-300 tabular-nums">{d.completed_jobs}</td>
                        <td className="py-2 text-right text-slate-300 tabular-nums">${d.pay_rate.toFixed(2)}</td>
                        <td className="py-2 text-right text-emerald-300 tabular-nums font-semibold">${d.gross_pay.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-3 text-[10px] text-slate-500">
                Default pay rate $18/hr (admin can set per-driver later). Commission per completed job comes next phase.
              </div>
            </>
          ) : <div className="py-8 text-slate-500 text-sm">Loading payroll preview...</div>}
        </Card>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, testId }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-wider transition ${active ? 'bg-amber-500 text-black font-semibold' : 'text-slate-400 hover:text-white'}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
