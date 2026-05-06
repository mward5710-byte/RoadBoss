import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield, Users, Briefcase, Truck, ChevronRight, LogOut,
  UserPlus, Eye, RefreshCw, Mail, Copy, Search,
  ShieldCheck, Loader2, Sparkles, Megaphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Logo } from '@/components/Logo';
import { api, getUser, beginImpersonation, auth } from '@/lib/api';
import { toast } from 'sonner';

/**
 * SuperAdmin — Mike's god-mode console.
 *
 * Three tabs:
 *   1. STATS    — top-level platform health
 *   2. USERS    — list / search every user, change roles, "Login as" (impersonate)
 *   3. INVITE   — quick-create a new wrecker company admin (Kenny etc.)
 *
 * Impersonation flow:
 *   - Click "Login as" on any user
 *   - Backend issues that user's JWT
 *   - Current super_admin token is stashed in `localStorage.rb_super_token`
 *   - We swap to the impersonation token + user, redirect to their landing
 *   - A red sticky banner appears app-wide: "Acting as Kenny — End Session"
 *   - Click End → restore super_admin token → back to /super
 */

const ROLE_OPTIONS = [
  { value: 'driver',              label: 'Driver',              tint: 'sky' },
  { value: 'dispatcher',          label: 'Dispatcher',          tint: 'amber' },
  { value: 'fleet_admin',         label: 'Fleet Admin',         tint: 'rose' },
  { value: 'wrecker_operator',    label: 'Wrecker Operator',    tint: 'sky' },
  { value: 'wrecker_dispatcher',  label: 'Wrecker Dispatcher',  tint: 'amber' },
  { value: 'wrecker_supervisor',  label: 'Wrecker Supervisor',  tint: 'purple' },
  { value: 'super_admin',         label: 'Super Admin',         tint: 'emerald' },
];

const TINT_CLASSES = {
  sky: 'bg-sky-500/15 border-sky-500/30 text-sky-300',
  amber: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  rose: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
  purple: 'bg-purple-500/15 border-purple-500/30 text-purple-300',
  emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  slate: 'bg-slate-500/15 border-slate-500/30 text-slate-300',
};

function roleTint(role) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.tint || 'slate';
}

export default function SuperAdmin() {
  const navigate = useNavigate();
  const me = getUser();

  if (!me || me.role !== 'super_admin') {
    return (
      <div className="min-h-screen bg-[#070b12] text-slate-200 flex items-center justify-center p-6">
        <Card className="bg-slate-900/60 border-slate-800 p-8 max-w-md text-center">
          <Shield className="w-10 h-10 mx-auto text-rose-400 mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">Super Admin only.</h1>
          <p className="text-sm text-slate-400 mb-5">This console is restricted to platform owners.</p>
          <Link to="/"><Button variant="outline" className="border-slate-700 text-slate-200">Back to home</Button></Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200" data-testid="super-admin-page">
      <Header me={me} navigate={navigate} />
      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-5 pb-12">
        {/* BIG SHORTCUTS — Mike asked for this. One-tap jump straight into
            the main parts of the platform, without hunting through menus. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => navigate('/wrecker')}
            data-testid="super-shortcut-wrecker"
            className="group relative overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-amber-900/10 p-5 sm:p-6 text-left transition-all hover:border-amber-400/70 hover:from-amber-500/30 active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 shrink-0 rounded-xl bg-amber-500/25 border border-amber-400/40 flex items-center justify-center">
                <Truck className="w-7 h-7 text-amber-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300/80 font-bold">Open</div>
                <div className="text-xl sm:text-2xl font-black text-white leading-tight">WreckerLogix</div>
                <div className="text-xs text-amber-200/80 mt-0.5">Dispatch · impound · photos</div>
              </div>
              <ChevronRight className="w-6 h-6 text-amber-300 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </button>

          <button
            onClick={() => navigate('/app')}
            data-testid="super-shortcut-fleet"
            className="group relative overflow-hidden rounded-2xl border-2 border-sky-500/40 bg-gradient-to-br from-sky-500/15 via-sky-600/10 to-sky-900/10 p-5 sm:p-6 text-left transition-all hover:border-sky-400/70 hover:from-sky-500/25 active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 shrink-0 rounded-xl bg-sky-500/25 border border-sky-400/40 flex items-center justify-center">
                <Briefcase className="w-7 h-7 text-sky-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.3em] text-sky-300/80 font-bold">Open</div>
                <div className="text-xl sm:text-2xl font-black text-white leading-tight">Fleet Admin</div>
                <div className="text-xs text-sky-200/80 mt-0.5">Drivers · trips · alerts</div>
              </div>
              <ChevronRight className="w-6 h-6 text-sky-300 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </button>

          <button
            onClick={() => navigate('/media')}
            data-testid="super-shortcut-media"
            className="group relative overflow-hidden rounded-2xl border-2 border-purple-500/40 bg-gradient-to-br from-purple-500/15 via-purple-600/10 to-purple-900/10 p-5 sm:p-6 text-left transition-all hover:border-purple-400/70 hover:from-purple-500/25 active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 shrink-0 rounded-xl bg-purple-500/25 border border-purple-400/40 flex items-center justify-center">
                <Megaphone className="w-7 h-7 text-purple-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.3em] text-purple-300/80 font-bold">Open</div>
                <div className="text-xl sm:text-2xl font-black text-white leading-tight">Media Hub</div>
                <div className="text-xs text-purple-200/80 mt-0.5">Logos · cuts · captions · QR</div>
              </div>
              <ChevronRight className="w-6 h-6 text-purple-300 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </button>
        </div>

        <MobileTabBar navigate={navigate} />
      </main>
    </div>
  );
}

/**
 * MobileTabBar — replaces the tiny default Shadcn tabs with a proper
 * 3-button grid that's actually readable and tappable on a 390px phone.
 * Each tab is a full card with icon + label; active tab is bold and tinted.
 */
function MobileTabBar({ navigate }) {
  const [tab, setTab] = useState('stats');

  const tabs = [
    { id: 'stats',  label: 'Stats',   icon: Sparkles, tint: 'emerald' },
    { id: 'users',  label: 'Users',   icon: Users,    tint: 'sky' },
    { id: 'invite', label: 'Invite',  icon: UserPlus, tint: 'amber' },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-5 sticky top-[56px] z-10 bg-[#070b12]/95 backdrop-blur py-1 -mx-1 px-1">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`super-tab-${t.id}`}
              className={`flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-xl border-2 text-[11px] sm:text-sm font-semibold uppercase tracking-wider transition-all min-h-[60px] ${
                active
                  ? TINT_CLASSES[t.tint] + ' shadow-lg scale-[1.02]'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <t.icon className="w-5 h-5" />
              <span className="leading-none">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'stats'  && <StatsPanel />}
      {tab === 'users'  && <UsersPanel navigate={navigate} />}
      {tab === 'invite' && <InvitePanel />}
    </div>
  );
}

/* ============================================================ HEADER ============================================================ */

function Header({ me, navigate }) {
  const logout = () => { auth.logout(); navigate('/login'); };
  return (
    <header className="border-b border-slate-800 bg-[#0a0e14]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2"><Logo size={28} withWordmark={false} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-200 font-semibold">Super Admin Console</span>
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px] uppercase tracking-widest">
              <Shield className="w-2.5 h-2.5 mr-1" /> God Mode
            </Badge>
          </div>
        </Link>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="hidden sm:inline">{me?.email}</span>
          <Button size="sm" variant="ghost" onClick={logout} data-testid="super-logout">
            <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ============================================================ STATS PANEL ============================================================ */

function StatsPanel() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/super/stats');
      setStats(r.data);
    } catch (e) {
      toast.error('Could not load stats.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  if (loading && !stats) return <div className="text-center py-12 text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading…</div>;
  if (!stats) return null;

  const cards = [
    { label: 'Total Users',     value: stats.total_users,        icon: Users,        tint: 'sky' },
    { label: 'Super Admins',    value: stats.super_admins,       icon: Shield,       tint: 'emerald' },
    { label: 'Fleet Admins',    value: stats.fleet_admins,       icon: Briefcase,    tint: 'rose' },
    { label: 'Wrecker Users',   value: stats.wrecker_users,      icon: Truck,        tint: 'amber' },
    { label: 'Drivers',         value: stats.drivers,            icon: Truck,        tint: 'sky' },
    { label: 'Tow Jobs',        value: stats.tow_jobs,           icon: Truck,        tint: 'purple' },
    { label: 'Investor Leads',  value: stats.investor_inquiries, icon: Mail,         tint: 'emerald' },
    { label: 'Pending Invites', value: stats.pending_invites,    icon: UserPlus,     tint: 'amber' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Platform Overview</h2>
        <Button size="sm" variant="outline" onClick={refresh} data-testid="super-stats-refresh" className="border-slate-700 text-slate-200">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="bg-slate-900/60 border-slate-800 p-4" data-testid={`super-stat-${c.label}`}>
            <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${TINT_CLASSES[c.tint]} mb-2`}>
              <c.icon className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">{c.value ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{c.label}</div>
          </Card>
        ))}
      </div>
      <Card className="mt-5 bg-slate-900/40 border-slate-800 p-4 text-xs text-slate-400">
        <strong className="text-slate-300">Note:</strong> Some figures include seeded demo records (e.g. 11 sample tow jobs)
        so the dispatch board doesn't render empty. Real users + real jobs grow on top of those baselines.
      </Card>
    </div>
  );
}

/* ============================================================ USERS PANEL ============================================================ */

function UsersPanel({ navigate }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const me = getUser();

  const refresh = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.q = search;
      if (roleFilter !== 'all') params.role = roleFilter;
      const r = await api.get('/admin/super/users', { params });
      setUsers(r.data?.items || []);
    } catch (e) {
      toast.error('Could not load users.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [roleFilter]);

  const changeRole = async (userId, newRole) => {
    try {
      await api.put(`/admin/super/users/${userId}/role`, { role: newRole });
      toast.success(`Role updated.`);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not change role.');
    }
  };

  const impersonate = async (target) => {
    if (!window.confirm(`Log in AS ${target.email}? You'll see what they see. Tap "End Session" in the red banner to come back.`)) return;
    try {
      const r = await api.post(`/admin/super/impersonate/${target.id}`);
      const newToken = r.data?.access_token;
      const newUser = r.data?.user;
      if (!newToken || !newUser) throw new Error('No token returned');
      beginImpersonation(newToken, newUser);
      toast.success(`Now acting as ${newUser.name || newUser.email}.`);
      const landing = newUser.role === 'driver'              ? '/driver'
                    : newUser.role === 'wrecker_operator'    ? '/wrecker/me'
                    : ['wrecker_dispatcher','wrecker_supervisor'].includes(newUser.role) ? '/wrecker'
                    : newUser.role === 'fleet_admin'         ? '/wrecker'
                    : '/app';
      setTimeout(() => navigate(landing), 200);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Impersonation failed.');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && refresh()}
            placeholder="Search by email or name…"
            className="pl-9 bg-slate-900 border-slate-800 text-white"
            data-testid="super-users-search"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px] bg-slate-900 border-slate-800 text-white" data-testid="super-users-role-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={refresh} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold" data-testid="super-users-refresh">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {users.length === 0 && !loading && (
        <Card className="bg-slate-900/60 border-slate-800 p-8 text-center text-slate-500">No users match the filter.</Card>
      )}

      <div className="space-y-2">
        {users.map((u) => {
          const tint = roleTint(u.role);
          const isMe = u.id === me?.id;
          return (
            <Card key={u.id} data-testid={`super-user-${u.email}`} className="bg-slate-900/60 border-slate-800 p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-semibold ${TINT_CLASSES[tint]} shrink-0`}>
                  {(u.name || u.email).split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                    {u.name || '(no name)'}
                    {isMe && <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/5 text-emerald-300 text-[9px] uppercase tracking-widest">You</Badge>}
                    {u.company_name && <Badge variant="outline" className="border-slate-700 text-slate-400 text-[10px]">{u.company_name}</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={u.role}
                    onValueChange={(v) => changeRole(u.id, v)}
                    disabled={isMe}
                  >
                    <SelectTrigger className="w-[180px] bg-slate-950 border-slate-800 text-white text-xs h-9" data-testid={`super-role-select-${u.email}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => impersonate(u)}
                    disabled={isMe}
                    className="border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                    data-testid={`super-impersonate-${u.email}`}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> Login as
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================ INVITE PANEL ============================================================ */

function InvitePanel() {
  const [form, setForm] = useState({
    company_name: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    role: 'fleet_admin',
    use_password: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const f = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.company_name || !form.admin_name || !form.admin_email) {
      toast.error('Company, admin name, and email are required.');
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const payload = {
        company_name: form.company_name,
        admin_name: form.admin_name,
        admin_email: form.admin_email,
        role: form.role,
      };
      if (form.use_password && form.admin_password) {
        payload.admin_password = form.admin_password;
      }
      const r = await api.post('/admin/super/invite-company', payload);
      setResult(r.data);
      toast.success(form.use_password ? 'Account created.' : 'Magic link generated.');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard.');
  };

  return (
    <div className="space-y-4">
      {/* Invite form — full width always on mobile; no side-by-side crowding. */}
      <Card className="bg-slate-900/60 border-slate-800 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus className="w-5 h-5 text-amber-400" />
          <h2 className="text-base sm:text-lg font-bold text-white">Onboard a Wrecker Company</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          One-shot admin account. Set a password now for text-ready creds, or send a magic link.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-500">Company Name</Label>
            <Input
              data-testid="super-invite-company"
              placeholder="Martin Wrecker Service"
              value={form.company_name}
              onChange={(e) => f('company_name', e.target.value)}
              className="bg-slate-950 border-slate-800 text-white mt-1 h-11 text-base"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-500">Admin Name</Label>
            <Input
              data-testid="super-invite-admin-name"
              placeholder="Kenny Smith"
              value={form.admin_name}
              onChange={(e) => f('admin_name', e.target.value)}
              className="bg-slate-950 border-slate-800 text-white mt-1 h-11 text-base"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-500">Admin Email</Label>
            <Input
              data-testid="super-invite-admin-email"
              type="email"
              placeholder="kenny@martinwrecker.com"
              value={form.admin_email}
              onChange={(e) => f('admin_email', e.target.value)}
              className="bg-slate-950 border-slate-800 text-white mt-1 h-11 text-base"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-500">Role</Label>
            <Select value={form.role} onValueChange={(v) => f('role', v)}>
              <SelectTrigger data-testid="super-invite-role" className="bg-slate-950 border-slate-800 text-white mt-1 h-11 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fleet_admin">Fleet Admin (full company control)</SelectItem>
                <SelectItem value="wrecker_supervisor">Wrecker Supervisor (manages drivers)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex items-center gap-2 mb-2">
              <input
                id="use-password"
                type="checkbox"
                checked={form.use_password}
                onChange={(e) => f('use_password', e.target.checked)}
                data-testid="super-invite-use-password"
                className="accent-amber-500 w-4 h-4"
              />
              <Label htmlFor="use-password" className="text-sm text-slate-300 cursor-pointer">
                Set password now (text-ready creds)
              </Label>
            </div>
            {form.use_password ? (
              <Input
                data-testid="super-invite-password"
                type="text"
                placeholder="e.g. WreckerLogix2026!"
                value={form.admin_password}
                onChange={(e) => f('admin_password', e.target.value)}
                className="bg-slate-950 border-slate-800 text-white h-11 text-base"
              />
            ) : (
              <div className="text-[11px] text-slate-500 leading-relaxed">
                Magic-link mode — a one-click setup link valid for 7 days will be generated.
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold h-12 text-base"
            data-testid="super-invite-submit"
          >
            {submitting
              ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Creating…</>
              : <><UserPlus className="w-5 h-5 mr-2" /> {form.use_password ? 'Create Account' : 'Generate Magic Link'}</>}
          </Button>
        </form>
      </Card>

      {/* Hand-off package — appears BELOW the form after creation, not beside it.
          Progressive disclosure = less confusing on phones. */}
      {result && (
        <Card className="bg-emerald-500/5 border-emerald-500/30 p-4 sm:p-5 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base sm:text-lg font-bold text-white">Ready to send</h2>
          </div>
          {result?.mode === 'created' && (
            <div className="space-y-3" data-testid="super-invite-result-created">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-xs text-emerald-200">
                ✅ Account created. Text these creds.
              </div>
              <CredentialRow label="Login URL" value={result.login_url} copy={copyToClipboard} />
              <CredentialRow label="Email" value={result.email} copy={copyToClipboard} />
              <CredentialRow label="Password" value={form.admin_password} copy={copyToClipboard} />
              <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-400 leading-relaxed">
                <div className="text-[10px] uppercase tracking-widest text-amber-400 mb-1">Suggested text message</div>
                <pre className="whitespace-pre-wrap font-mono text-slate-300 text-[11px] mb-2">
{`Hey ${form.admin_name.split(' ')[0] || 'there'} — Mike Ward.
Got your RoadBoss account live. Install + log in:

${result.login_url}
Email: ${result.email}
Pass:  ${form.admin_password}

Holler if you need help. Brutal feedback welcome.`}
                </pre>
                <Button
                  size="sm"
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold"
                  onClick={() => copyToClipboard(`Hey ${form.admin_name.split(' ')[0] || 'there'} — Mike Ward.\nGot your RoadBoss account live. Install + log in:\n\n${result.login_url}\nEmail: ${result.email}\nPass:  ${form.admin_password}\n\nHoller if you need help. Brutal feedback welcome.`)}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy full text message
                </Button>
              </div>
            </div>
          )}
          {result?.mode === 'magic_link' && (
            <div className="space-y-3" data-testid="super-invite-result-magic">
              <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 p-2.5 text-xs text-cyan-200">
                🔗 Magic link generated. Expires in {result.expires_in_days} days.
              </div>
              <CredentialRow label="Magic Link" value={result.magic_link} copy={copyToClipboard} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function CredentialRow({ label, value, copy }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <Input value={value} readOnly className="bg-slate-950 border-slate-800 text-white text-xs font-mono" />
        <Button size="sm" variant="outline" className="border-slate-700 text-slate-200 shrink-0" onClick={() => copy(value)}>
          <Copy className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
