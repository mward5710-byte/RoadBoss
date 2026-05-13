import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, Link, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Truck, Lock, Building2, Fuel, CreditCard, LogOut,
  User, BookOpen, Mic, Wrench, Briefcase, Clock, Settings, Sliders, Plug,
  BarChart3, Camera, Navigation as NavIcon, Menu, X, ExternalLink,
} from 'lucide-react';
import { auth, getUser, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { WreckerLogixLogo } from '@/components/WreckerLogixLogo';
import AppFooter from '@/components/AppFooter';

// Sidebar nav grouped into sections:
//   OPERATIONS — day-to-day dispatch + driving stuff
//   OFFICE     — back-office stuff your wife / bookkeeper lives in (accounting, photos, settings)
// Each item has a stable `key` that matches the DEFAULT_NAV_ITEMS list in
// WreckerCustomize.jsx so the editor can hide/rename items by key.
const NAV_GROUPS = [
  {
    section: 'Operations',
    items: [
      { key: 'dispatch',    to: '/wrecker',            icon: LayoutDashboard, label: 'Dispatch Board', end: true,  roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
      { key: 'my_calls',    to: '/wrecker/me',         icon: Truck,           label: 'My Calls',       end: true,  roles: ['wrecker_operator'] },
      { key: 'new_job',     to: '/wrecker/jobs/new',   icon: Truck,           label: 'New Tow Job',                  roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
      { key: 'navigation',  to: '/wrecker/navigation', icon: NavIcon,         label: 'Navigation',                    roles: ['wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
      { key: 'clock',       to: '/wrecker/clock',      icon: Clock,           label: 'Time Clock',                    roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'wrecker_operator'] },
      { key: 'trucks',      to: '/wrecker/trucks',     icon: Wrench,          label: 'Trucks',                        roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'wrecker_operator'] },
      { key: 'impound',     to: '/wrecker/impound',    icon: Lock,            label: 'Impound',                       roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
      { key: 'accounts',    to: '/wrecker/accounts',   icon: Briefcase,       label: 'Accounts',                      roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
      { key: 'clubs',       to: '/wrecker/clubs',      icon: Building2,       label: 'Motor Clubs',                   roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
      { key: 'fuel',        to: '/wrecker/fuel',       icon: Fuel,            label: 'Fuel',                          roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin', 'wrecker_operator'] },
    ],
  },
  {
    section: 'Office',
    items: [
      { key: 'billing',     to: '/wrecker/billing',    icon: CreditCard,      label: 'Billing',                       roles: ['wrecker_supervisor', 'fleet_admin', 'super_admin'] },
      { key: 'accounting',  to: '/wrecker/accounting', icon: BarChart3,       label: 'Accounting',                    roles: ['wrecker_supervisor', 'fleet_admin', 'super_admin'] },
      { key: 'photos',      to: '/wrecker/photos',     icon: Camera,          label: 'Photo Vault',                   roles: ['wrecker_supervisor', 'fleet_admin', 'super_admin', 'wrecker_dispatcher'] },
      { key: 'customize',   to: '/wrecker/customize',  icon: Sliders,         label: 'Customize',                     roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
      { key: 'connections', to: '/wrecker/connections', icon: Plug,           label: 'Connections',                   roles: ['wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
      { key: 'settings',    to: '/wrecker/settings',   icon: Settings,        label: 'Settings',                      roles: ['wrecker_operator', 'wrecker_dispatcher', 'wrecker_supervisor', 'fleet_admin', 'super_admin'] },
    ],
  },
  {
    section: 'My Stuff',
    items: [
      { key: 'my_photos',   to: '/wrecker/photos',     icon: Camera,          label: 'My Photos',                     roles: ['wrecker_operator'] },
    ],
  },
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
  wrecker_supervisor: 'bg-purple-500/15 border-purple-500/30 text-purple-300',
  fleet_admin: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
  super_admin: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
};

export default function WreckerShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const role = user?.role || 'wrecker_operator';
  const logout = () => { auth.logout(); navigate('/login'); };

  // Mobile drawer state — kept off-screen by default. Auto-closes on navigation
  // so tapping a link doesn't leave the drawer open over the new page.
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    const original = document.body.style.overflow;
    if (mobileOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [mobileOpen]);

  // ── Tier 1 customizations: hide / rename nav items + render custom links.
  //    Saved by Mike on /wrecker/customize. Falls back to defaults silently.
  const [navOverrides, setNavOverrides] = useState(null); // { byKey: {...}, customs: [...] }
  useEffect(() => {
    let cancelled = false;
    api.get('/wrecker/customizations').then((r) => {
      if (cancelled) return;
      const items = Array.isArray(r?.data?.menu_items) ? r.data.menu_items : [];
      if (items.length === 0) { setNavOverrides({ byKey: {}, customs: [] }); return; }
      const byKey = {};
      const customs = [];
      const coreKeys = new Set();
      NAV_GROUPS.forEach((g) => g.items.forEach((it) => coreKeys.add(it.key)));
      items.forEach((m) => {
        if (coreKeys.has(m.key)) byKey[m.key] = m;
        else if (m.label && m.to) customs.push(m);
      });
      setNavOverrides({ byKey, customs });
    }).catch(() => setNavOverrides({ byKey: {}, customs: [] }));
    return () => { cancelled = true; };
  }, []);

  // If a driver lands on the dispatch board (/wrecker), bounce them to /wrecker/me
  if (role === 'wrecker_operator' && (location.pathname === '/wrecker' || location.pathname === '/wrecker/')) {
    return <Navigate to="/wrecker/me" replace />;
  }

  const visibleGroups = (() => {
    const overrides = navOverrides?.byKey || {};
    const groups = NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items
        // Role gate first
        .filter((n) => n.roles.includes(role) || role === 'super_admin')
        // Then apply tenant overrides (hide if visible === false)
        .filter((n) => {
          const o = overrides[n.key];
          return !(o && o.visible === false);
        })
        // Then rename if override label is present
        .map((n) => {
          const o = overrides[n.key];
          return o && o.label ? { ...n, label: o.label } : n;
        }),
    })).filter((g) => g.items.length > 0);

    // Append any user-added custom links as their own "Custom" group.
    const customs = (navOverrides?.customs || []).filter((m) => m.visible !== false && m.label && m.to);
    if (customs.length > 0) {
      groups.push({
        section: 'Custom',
        items: customs.map((m) => ({
          key: m.key,
          to: m.to,
          icon: ExternalLink,
          label: m.label,
          end: false,
        })),
      });
    }
    return groups;
  })();

  /* ---------------- Sidebar contents (shared between desktop aside + mobile drawer) ---------------- */
  const sidebarContents = (
    <>
      <div className="p-3 border-b border-white/5 flex items-center gap-2">
        <Link
          to={role === 'wrecker_operator' ? '/wrecker/me' : '/wrecker'}
          className="flex items-center gap-2 min-w-0 flex-1"
          data-testid="wrecker-logo-link"
          onClick={() => setMobileOpen(false)}
        >
          <WreckerLogixLogo size={36} withWordmark />
        </Link>
        {/* Close button visible only inside the mobile drawer */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5"
          data-testid="wrecker-mobile-nav-close"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="px-3 pt-3">
        <span
          data-testid="wrecker-role-badge"
          className={`text-[9px] uppercase tracking-widest px-2 py-1 rounded-full border font-semibold inline-flex items-center gap-1.5 ${ROLE_COLOR[role] || ROLE_COLOR.wrecker_operator}`}
        >
          {ROLE_LABEL[role] || role}
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleGroups.map((group, gi) => (
          <div key={group.section} className={gi > 0 ? 'pt-3 mt-2 border-t border-white/5' : ''}>
            <div
              className="text-[9px] uppercase tracking-widest text-slate-600 font-semibold px-3 py-1.5"
              data-testid={`wrecker-nav-section-${group.section.toLowerCase()}`}
            >
              {group.section}
            </div>
            {group.items.map((n) => (
              <NavLink
                data-testid={`wrecker-nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
                key={n.key || n.to}
                to={n.to}
                end={n.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-200 border border-amber-500/25'
                      : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`
                }
              >
                <n.icon className="w-4 h-4" /> {n.label}
              </NavLink>
            ))}
          </div>
        ))}
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
        <AppFooter className="mt-2" />
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-[#07090d]">
      {/* DESKTOP SIDEBAR — hidden on phones AND iPhone-landscape, persistent at lg+ (≥1024px) */}
      <aside className="hidden lg:flex w-60 border-r border-white/5 bg-[#0a0e14] flex-col" data-testid="wrecker-sidebar-desktop">
        {sidebarContents}
      </aside>

      {/* MOBILE TOP BAR — WreckerLogix-branded (not RoadBoss). Mike asked
          for clean separation between the two brands. */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 h-12 bg-[#0a0e14]/95 backdrop-blur border-b border-white/5 flex items-center px-3 gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-md text-slate-200 hover:bg-white/5 active:bg-white/10"
          data-testid="wrecker-mobile-nav-open"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link
          to={role === 'wrecker_operator' ? '/wrecker/me' : '/wrecker'}
          className="flex items-center gap-2 min-w-0 flex-1"
        >
          <WreckerLogixLogo size={28} withWordmark={false} />
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-white tracking-wider leading-tight truncate">
              WRECKER<span className="text-amber-400">LOGIX</span>
            </div>
            <div className="text-[8px] uppercase tracking-widest text-slate-500 leading-tight">{ROLE_LABEL[role] || role}</div>
          </div>
        </Link>
      </div>

      {/* MOBILE DRAWER — slides in from the left when hamburger is tapped */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40" data-testid="wrecker-mobile-nav-drawer">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
          />
          {/* Panel */}
          <aside
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[#0a0e14] border-r border-white/5 flex flex-col shadow-2xl shadow-black/60 animate-in slide-in-from-left"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContents}
          </aside>
        </div>
      )}

      {/* MAIN — pads top on phones/tablets/landscape so content clears the fixed top bar */}
      <main className="flex-1 overflow-x-hidden pt-12 lg:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
