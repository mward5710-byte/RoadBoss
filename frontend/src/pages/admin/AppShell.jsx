import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import {
  LayoutDashboard, Users, Truck, Route, Wrench, Bell, Camera, Mail, LogOut,
  MapPin, User, CreditCard, ClipboardCheck, AlertTriangle, LifeBuoy,
  MessageSquare, Settings, BookOpen, Menu, X,
} from 'lucide-react';
import { auth, getUser } from '@/lib/api';
import { Button } from '@/components/ui/button';

const nav = [
  { to: '/app', icon: LayoutDashboard, label: 'Overview', end: true },
  { to: '/app/drivers', icon: Users, label: 'Drivers' },
  { to: '/app/vehicles', icon: Truck, label: 'Vehicles' },
  { to: '/app/trips', icon: Route, label: 'Trips' },
  { to: '/app/inspections', icon: ClipboardCheck, label: 'Inspections' },
  { to: '/app/maintenance', icon: Wrench, label: 'Maintenance' },
  { to: '/app/roadside', icon: LifeBuoy, label: 'Roadside' },
  { to: '/app/crash-events', icon: AlertTriangle, label: 'Crash Events' },
  { to: '/app/alerts', icon: Bell, label: 'Alerts' },
  { to: '/app/notifications', icon: MessageSquare, label: 'Notifications' },
  { to: '/app/dashcam', icon: Camera, label: 'Dashcam' },
  { to: '/app/ifta', icon: MapPin, label: 'IFTA' },
  { to: '/app/billing', icon: CreditCard, label: 'Billing' },
  { to: '/app/settings', icon: Settings, label: 'Settings' },
  { to: '/app/waitlist', icon: Mail, label: 'Waitlist' },
];

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const logout = () => { auth.logout(); navigate('/login'); };

  // Mobile drawer state — sidebar collapses to a hamburger on phones.
  // Pattern matches WreckerShell so both products feel identical on mobile.
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-close the drawer on route change (so tapping a nav item always closes it)
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    const original = document.body.style.overflow;
    if (mobileOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [mobileOpen]);

  // Active page label for the mobile header (so user knows where they are)
  const activeLabel = (() => {
    const match = nav.find((n) => n.end ? location.pathname === n.to : location.pathname.startsWith(n.to));
    return match?.label || 'RoadBoss';
  })();

  return (
    <div className="min-h-screen flex bg-[#07090d]" data-testid="admin-shell">
      {/* ═══ MOBILE TOP BAR (only visible on phones) ═══ */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-[#0a0e14]/95 backdrop-blur border-b border-white/5 px-3 py-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-slate-300 hover:bg-white/5 transition"
          data-testid="admin-mobile-menu"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Logo size={22} />
        <div className="text-sm font-semibold text-white truncate flex-1">{activeLabel}</div>
        <Link to="/app/profile" className="p-1 rounded-lg hover:bg-white/5 transition" data-testid="admin-mobile-profile">
          <div className="w-7 h-7 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-300 text-[11px] font-semibold">
            {(user?.name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('')}
          </div>
        </Link>
      </div>

      {/* ═══ MOBILE DRAWER OVERLAY ═══ */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setMobileOpen(false)}
          data-testid="admin-mobile-overlay"
        />
      )}

      {/* ═══ SIDEBAR ═══
           Desktop: static, w-60.
           Mobile: fixed off-canvas drawer, slides in when mobileOpen=true. */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-white/5 bg-[#0a0e14] flex flex-col
          transform transition-transform duration-200 ease-out
          lg:static lg:translate-x-0 lg:w-60 lg:max-w-none
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        data-testid="admin-sidebar"
      >
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <Link to="/app" onClick={() => setMobileOpen(false)}><Logo size={28} /></Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
            aria-label="Close menu"
            data-testid="admin-mobile-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((n) => (
            <NavLink
              data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-sky-500/15 text-sky-200 border border-sky-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`
              }
            >
              <n.icon className="w-4 h-4 shrink-0" /> {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-white/5">
          <a
            href="/guide"
            target="_blank"
            rel="noreferrer"
            data-testid="nav-manual"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 border border-transparent transition mb-2"
          >
            <BookOpen className="w-4 h-4" /> User Manual
          </a>
          <Link
            to="/app/profile"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 mb-2 hover:bg-white/[0.03] rounded-lg p-1 -m-1"
            data-testid="admin-profile-link"
          >
            <div className="w-9 h-9 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-300 text-sm font-semibold shrink-0">
              {(user?.name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white truncate">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{user?.role?.replace('_', ' ')}</div>
            </div>
            <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          </Link>
          <Button
            data-testid="logout"
            onClick={logout}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-400 hover:text-white"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* ═══ MAIN CONTENT ═══
           Top padding on mobile makes room for the fixed top bar. */}
      <main className="flex-1 overflow-x-hidden pt-14 lg:pt-0 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
