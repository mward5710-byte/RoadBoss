// Home Splash — the very first thing the user sees when they tap the app
// icon on their home screen. Per Mike's V2 spec
// (/app/memory/v2_architecture_spec.md §2):
//
//   ┌──────────────────────────────────────┐
//   │   [ INVESTORS · View Demo ]          │  ← top, smaller pill
//   │                                      │
//   │   ┌──────────────┐  ┌──────────────┐ │
//   │   │  WRECKERLOGIX│  │  ROADBOSS    │ │  ← two big primary buttons
//   │   │  Towing      │  │  Fleet       │ │
//   │   └──────────────┘  └──────────────┘ │
//   └──────────────────────────────────────┘
//
// Strict product wall: each button takes the user into ONE product's world.
// Inside WreckerLogix, no RoadBoss; inside RoadBoss, no WreckerLogix.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Truck, ArrowRight, ChevronRight, BookOpen } from 'lucide-react';
import { WreckerLogixLogo } from '@/components/WreckerLogixLogo';
import { Logo as RoadBossLogo } from '@/components/Logo';
import { getUser } from '@/lib/api';

export default function Home() {
  const navigate = useNavigate();
  const user = getUser();

  // If user is already logged in, the product buttons jump them straight
  // into that product's workspace — no need to log in again. If not logged
  // in, the buttons route to /login with an `app` hint so the login screen
  // can theme itself appropriately.
  const goWrecker = () => {
    if (user) {
      const role = user.role || '';
      if (role === 'wrecker_operator') return navigate('/wrecker/me');
      return navigate('/wrecker');
    }
    navigate('/login?app=wreckerlogix');
  };

  const goRoadBoss = () => {
    if (user) {
      const role = user.role || '';
      if (role === 'driver') return navigate('/driver');
      if (['fleet_admin', 'super_admin', 'dispatcher'].includes(role)) return navigate('/app');
      return navigate('/app');
    }
    navigate('/login?app=roadboss');
  };

  const goInvestors = () => navigate('/investors');

  return (
    <div
      className="min-h-screen w-full bg-[#04060a] text-white relative overflow-hidden"
      data-testid="home-splash"
    >
      {/* Ambient backdrop — subtle radial glow, no garish gradients per
          design rules. Stays under 20% of viewport. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 40% at 25% 12%, rgba(245,158,11,0.08), transparent 70%), radial-gradient(60% 40% at 80% 90%, rgba(56,189,248,0.06), transparent 70%)',
        }}
      />

      {/* Top bar — Investors / View Demo pill, plus a small Sign In link */}
      <div className="relative z-10 flex items-center justify-between px-5 sm:px-8 py-5">
        <button
          type="button"
          onClick={goInvestors}
          data-testid="home-investors"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.04] border border-white/10 hover:border-amber-400/40 hover:bg-amber-500/[0.06] text-slate-300 hover:text-white transition group"
        >
          <BookOpen className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[12px] font-semibold tracking-wider uppercase">Investors · View Demo</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition" />
        </button>

        {!user && (
          <button
            type="button"
            onClick={() => navigate('/login')}
            data-testid="home-signin"
            className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 hover:text-white transition px-3 py-2"
          >
            Sign In
          </button>
        )}
        {user && (
          <button
            type="button"
            onClick={() => navigate('/login')}
            data-testid="home-signin"
            className="text-[12px] font-semibold uppercase tracking-wider text-emerald-300 hover:text-emerald-200 transition px-3 py-2"
            title={`Signed in as ${user.email || user.name || ''}`}
          >
            Switch Account
          </button>
        )}
      </div>

      {/* Hero — wordmark + tagline */}
      <div className="relative z-10 max-w-3xl mx-auto px-5 pt-6 sm:pt-10 text-center">
        <div className="inline-flex flex-col items-center">
          <RoadBossLogo size={44} withWordmark tagline="The Operator's Operating System" />
        </div>
        <p className="mt-5 text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
          Pick the workspace you're walking into today.
        </p>
      </div>

      {/* The two big product buttons */}
      <div className="relative z-10 max-w-3xl mx-auto px-5 mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProductButton
          testId="home-pick-wreckerlogix"
          accent="amber"
          icon={<WreckerLogixLogo size={48} withWordmark={false} />}
          title="WreckerLogix"
          subtitle="Towing & Recovery"
          tagline="Dispatch, impound, billing, drivers."
          onClick={goWrecker}
        />
        <ProductButton
          testId="home-pick-roadboss"
          accent="sky"
          icon={<RoadBossLogo size={32} withWordmark={false} />}
          title="RoadBoss"
          subtitle="Fleet · Long-haul"
          tagline="Inspections, IFTA, dashcam, drivers."
          onClick={goRoadBoss}
        />
      </div>

      {/* Public CTA — start a 14-day free trial of WreckerLogix.
          Anyone (even unauth'd visitors) can self-serve sign up. */}
      {!user && (
        <div className="relative z-10 max-w-2xl mx-auto px-5 mt-8 text-center">
          <button
            type="button"
            onClick={() => navigate('/wrecker/signup')}
            data-testid="home-start-trial"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold text-sm transition shadow-lg shadow-amber-500/20"
          >
            Start a 14-day free trial
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="text-[11px] text-slate-500 mt-3">
            No card required · Cancel anytime · Half the price of the closest competitor
          </div>
        </div>
      )}

      {/* Footer — small print so the page still feels finished */}
      <div className="relative z-10 max-w-3xl mx-auto px-5 mt-12 sm:mt-20 pb-10 text-center">
        <div className="text-[11px] uppercase tracking-[0.32em] text-slate-600">
          RoadBoss · Built for the road, run from one screen
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function ProductButton({ testId, accent, icon, title, subtitle, tagline, onClick }) {
  // Two accent palettes — amber for WreckerLogix (towing world), sky for
  // RoadBoss (fleet world). Per design rules: no raw red/blue/green, no
  // jarring multi-hue gradients.
  const styles = accent === 'amber'
    ? {
        ring: 'hover:border-amber-400/50 focus-visible:border-amber-400/70',
        glow: 'group-hover:shadow-[0_0_40px_rgba(245,158,11,0.18)]',
        chip: 'text-amber-300',
        cta: 'text-amber-300 group-hover:text-amber-200',
      }
    : {
        ring: 'hover:border-sky-400/50 focus-visible:border-sky-400/70',
        glow: 'group-hover:shadow-[0_0_40px_rgba(56,189,248,0.18)]',
        chip: 'text-sky-300',
        cta: 'text-sky-300 group-hover:text-sky-200',
      };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`group relative text-left rounded-2xl bg-[#0a0e14] border border-white/10 p-6 sm:p-7 transition-all duration-200 ${styles.ring} ${styles.glow} active:scale-[0.99]`}
    >
      {/* Icon */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="w-14 h-14 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center overflow-hidden">
          {icon}
        </div>
        <ArrowRight className={`w-5 h-5 ${styles.cta} transition-transform group-hover:translate-x-1`} />
      </div>

      {/* Title block */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <div className="text-xl sm:text-2xl font-bold text-white">{title}</div>
          <div className={`text-[10px] uppercase tracking-[0.28em] font-semibold ${styles.chip}`}>{subtitle}</div>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">{tagline}</p>
      </div>

      {/* CTA hint */}
      <div className={`mt-5 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider ${styles.cta}`}>
        Enter <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
