import React from 'react';
import { Outlet, NavLink, useNavigate, Link, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Truck, Lock, Building2, Fuel, CreditCard, LogOut,
  User, BookOpen, Mic, Wrench, Users, Briefcase, Clock
} from 'lucide-react';
import { auth, getUser } from '@/lib/api';
import { Button } from '@/components/ui/button';

const ALL_NAV = [
  { to: '/wrecker',            icon: LayoutDashboard, label: 'Dispatch Board', end: true,  roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
  { to: '/wrecker/me',         icon: Truck,           label: 'My Calls',       end: true,  roles: ['wrecker_operator'] },
  { to: '/wrecker/jobs/new',   icon: Truck,           label: 'New Tow Job',                  roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
  { to: '/wrecker/clock',      icon: Clock,           label: 'Time Clock',                    roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'wrecker_operator'] },
  { to: '/wrecker/trucks',     icon: Wrench,          label: 'Trucks',                        roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'wrecker_operator'] },
  { to: '/wrecker/impound',    icon: Lock,            label: 'Impound',                       roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
  { to: '/wrecker/accounts',   icon: Briefcase,       label: 'Accounts',                      roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
  { to: '/wrecker/clubs',      icon: Building2,       label: 'Motor Clubs',                   roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
  { to: '/wrecker/fuel',       icon: Fuel,            label: 'Fuel',                          roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'wrecker_operator'] },
  { to: '/wrecker/billing',    icon: CreditCard,      label: 'Billing',                       roles: ['wrecker_supervisor', 'fleet_admin', 'super_admin'] },
];

const ROLE_LABEL = {
  wrecker_operator: 'Driver',
  wrecker_dispatcher: 'Dispatcher',
  wrecker_supervisor: 'Foreman',
  fleet_admin: 'Fleet Admin',
  super_admin: 'Super Admin',
};

const ROLE_COLOR = {
  wrecker_operator: 'bg-sky-500/15 border-sky-500/30 text-sky-300',
  wrecker_dispatcher: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  wrecker_supervisor: 'bg-violet-500/15 border-violet-500/30 text-violet-300',
  fleet_admin: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  super_admin: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
};

export default function WreckerShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const role = user?.role || 'wrecker_operator';
  const logout = () => { auth.logout(); navigate('/login'); };

  // If a driver lands on the dispatch board (/wrecker), bounce them to /wrecker/me
  if (role === 'wrecker_operator' && (location.pathname === '/wrecker' || location.pathname === '/wrecker/')) {
    return <Navigate to="/wrecker/me" replace />;
  }

  const visibleNav = ALL_NAV.filter((n) => n.roles.includes(role) || role === 'super_admin');

  return (
    <div className="min-h-screen flex bg-[#07090d]">
      <aside className="w-60 border-r border-white/5 bg-[#0a0e14] flex flex-col">
        <div className="p-3 border-b border-white/5 flex items-center gap-2">
          <Link to={role === 'wrecker_operator' ? '/wrecker/me' : '/wrecker'} className="flex items-center gap-2 min-w-0 flex-1" data-testid="wrecker-logo-link">
            <img
              src="/assets/wreckerlogix-logo.jpeg"
              alt="Wreckerlogix"
              className="w-10 h-10 rounded-md object-contain bg-white/[0.04] border border-white/10"
            />
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-white tracking-wider leading-tight">WRECKER<span className="text-amber-400">LOGIX</span></div>
              <div className="text-[8px] uppercase tracking-widest text-slate-500 leading-tight">on RoadBoss · v0.1</div>
            </div>
          </Link>
        </div>
        <div className="px-3 pt-3">
          <span data-testid="wrecker-role-badge" className={`text-[9px] uppercase tracking-widest px-2 py-1 rounded-full border font-semibold inline-flex items-center gap-1.5 ${ROLE_COLOR[role] || ROLE_COLOR.wrecker_operator}`}>
            {ROLE_LABEL[role] || role}
          </span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {visibleNav.map((n) => (
            <NavLink data-testid={`wrecker-nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`} key={n.to} to={n.to} end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${isActive ? 'bg-amber-500/15 text-amber-200 border border-amber-500/25' : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
              <n.icon className="w-4 h-4" /> {n.label}
            </NavLink>
          ))}
          <div className="pt-3 mt-3 border-t border-white/5">
            <Link
              to="/wrecker/voice"
              data-testid="wrecker-nav-voice"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sky-300 hover:bg-sky-500/10 border border-transparent transition"
            >
              <Mic className="w-4 h-4" /> Hands-Free Mode
            </Link>
          </div>
        </nav>
        <div className="p-3 border-t border-white/5">
          <a
            href="/guide"
            target="_blank"
            rel="noreferrer"
            data-testid="wrecker-nav-manual"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 border border-transparent transition mb-2"
          >
            <BookOpen className="w-4 h-4" /> User Manual
          </a>
          <div className="flex items-center gap-3 mb-2 hover:bg-white/[0.03] rounded-lg p-1 -m-1">
            <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300 text-sm font-semibold">
              {(user?.name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white truncate">{user?.name || 'Operator'}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{ROLE_LABEL[role] || role}</div>
            </div>
            <User className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <Button data-testid="wrecker-logout" onClick={logout} variant="ghost" size="sm" className="w-full justify-start text-slate-400 hover:text-white">
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
