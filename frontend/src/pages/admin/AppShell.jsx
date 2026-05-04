import React from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { LayoutDashboard, Users, Truck, Route, Wrench, Bell, Camera, Mail, LogOut, MapPin, User, CreditCard, ClipboardCheck, AlertTriangle, LifeBuoy, MessageSquare, Settings } from 'lucide-react';
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
  const user = getUser();
  const logout = () => { auth.logout(); navigate('/login'); };

  return (
    <div className="min-h-screen flex bg-[#07090d]">
      <aside className="w-60 border-r border-white/5 bg-[#0a0e14] flex flex-col">
        <div className="p-4 border-b border-white/5"><Link to="/app"><Logo size={28} /></Link></div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => (
            <NavLink data-testid={`nav-${n.label.toLowerCase()}`} key={n.to} to={n.to} end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${isActive ? 'bg-sky-500/15 text-sky-200 border border-sky-500/25' : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
              <n.icon className="w-4 h-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/5">
          <Link to="/app/profile" className="flex items-center gap-3 mb-2 hover:bg-white/[0.03] rounded-lg p-1 -m-1">
            <div className="w-9 h-9 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-300 text-sm font-semibold">
              {(user?.name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white truncate">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{user?.role?.replace('_', ' ')}</div>
            </div>
            <User className="w-3.5 h-3.5 text-slate-500" />
          </Link>
          <Button data-testid="logout" onClick={logout} variant="ghost" size="sm" className="w-full justify-start text-slate-400 hover:text-white"><LogOut className="w-4 h-4 mr-2" /> Sign out</Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
