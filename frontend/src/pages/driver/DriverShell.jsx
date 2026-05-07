import React from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Home, Route, Truck, Settings, LogOut, User } from 'lucide-react';
import { auth, getUser } from '@/lib/api';
// Wake-word listening was lifted to the GlobalCopilotFAB so the mic now lives
// on every page — not just driver. WakeWordBar import retired.
import { CrashGuardian } from '@/components/CrashGuardian';
import DriverOnboardingTour from '@/components/DriverOnboardingTour';

const tabs = [
  { to: '/driver', icon: Home, label: 'Home', end: true },
  { to: '/driver/trips', icon: Route, label: 'Trips' },
  { to: '/driver/vehicle', icon: Truck, label: 'Truck' },
  { to: '/driver/settings', icon: Settings, label: 'Settings' },
];

export default function DriverShell() {
  const navigate = useNavigate();
  const user = getUser();
  const logout = () => { auth.logout(); navigate('/login'); };
  return (
    <div className="min-h-screen bg-[#07090d] flex flex-col max-w-md mx-auto relative">
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/5 sticky top-0 bg-[#07090d]/95 backdrop-blur z-30">
        <Link to="/driver"><Logo size={24} withWordmark={false} /></Link>
        <Link to="/driver/profile" className="flex-1 px-3 cursor-pointer">
          <div className="text-[10px] uppercase tracking-widest text-sky-400/80">Cab</div>
          <div className="text-sm font-semibold text-white truncate flex items-center gap-1">{user?.name?.split(' ')[0]} <User className="w-3 h-3 text-slate-500" /></div>
        </Link>
        <button data-testid="driver-logout" onClick={logout} className="text-slate-500 hover:text-white p-1"><LogOut className="w-4 h-4" /></button>
      </header>
      <main className="flex-1 pb-24"><Outlet /></main>
      <CrashGuardian />
      <DriverOnboardingTour />
      <nav style={{ zIndex: 2147483000 }} className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#0a0e14]/95 backdrop-blur border-t border-white/10 grid grid-cols-4">
        {tabs.map((t) => (
          <NavLink data-testid={`driver-tab-${t.label.toLowerCase()}`} key={t.to} to={t.to} end={t.end} className={({ isActive }) => `flex flex-col items-center justify-center py-3 text-[11px] ${isActive ? 'text-sky-300' : 'text-slate-500'}`}>
            <t.icon className="w-5 h-5 mb-1" /> {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
