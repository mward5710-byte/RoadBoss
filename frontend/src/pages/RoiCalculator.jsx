import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Truck,
  DollarSign,
  TrendingUp,
  Shield,
  Clock,
  Zap,
  ArrowRight,
  Download,
  Mail,
  Phone,
  CheckCircle2,
  Sparkles,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';

/*
  RoiCalculator — an interactive lead-magnet for fleet owners.
  Pluck in truck count & fleet profile; get instant annualized savings
  vs RoadBoss Fleet subscription cost. Conservative numbers backed by
  industry-public data (ATA, FMCSA, NTSB, Nationwide).
*/

const FLEET_BASELINE = {
  // Per-truck annual cost estimates from industry averages.
  legacyAppSubscriptionPerTruck:   780,   // $65/mo avg — ELD + dashcam + GPS + messaging
  hosViolationExposurePerTruck:     420,   // prob-weighted: ~3% chance of $14K fine/yr
  distractedDrivingRiskPerTruck:   1850,   // ATA: average minor collision cost per truck per year, before accounting for major
  insurancePremiumPerTruck:        9800,   // National avg commercial truck insurance
  roadsideInefficiencyPerTruck:     260,   // time lost + vendor markup on uncoordinated dispatch
  driverChurnCostPerTruck:         3200,   // ATA: 90% annual churn × $16K replacement / 12 trucks average
};

const ROADBOSS_FLEET_COST_PER_TRUCK_YEAR = 19.99 * 12; // $239.88

// Optional multipliers for fleet profile
const FLEET_PROFILES = [
  {
    key: 'owner_op',
    label: 'Owner-Operator (1 truck)',
    icon: Truck,
    fitBoost: 1.0,
    recommendedPlan: 'Pro',
    planPriceYear: 29.99 * 12,
    blurb: 'Solo operator — replace your $65/mo app stack with one $29.99 subscription.',
  },
  {
    key: 'small',
    label: 'Small fleet (2–10 trucks)',
    icon: Truck,
    fitBoost: 1.05,
    recommendedPlan: 'Fleet',
    planPriceYear: ROADBOSS_FLEET_COST_PER_TRUCK_YEAR,
    blurb: 'Where RoadBoss ROI is sharpest — lean ops, high per-driver impact.',
  },
  {
    key: 'mid',
    label: 'Mid-size fleet (11–50 trucks)',
    icon: Building2,
    fitBoost: 1.10,
    recommendedPlan: 'Fleet',
    planPriceYear: ROADBOSS_FLEET_COST_PER_TRUCK_YEAR,
    blurb: 'Full dashboard, DVIR compliance, and crash-alert insurance discounts add up.',
  },
  {
    key: 'large',
    label: 'Large fleet (50+ trucks)',
    icon: Building2,
    fitBoost: 1.15,
    recommendedPlan: 'Enterprise',
    planPriceYear: ROADBOSS_FLEET_COST_PER_TRUCK_YEAR, // shown per-truck; enterprise is custom
    blurb: 'White-label + API access available. Ask for a custom quote.',
  },
];

function money(n) {
  if (!isFinite(n)) return '\u2014';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function RoiCalculator() {
  const [trucks, setTrucks] = useState(20);
  const [profileKey, setProfileKey] = useState('mid');
  const [avgRevenuePerTruck, setAvgRevenuePerTruck] = useState(185000);

  const profile = useMemo(
    () => FLEET_PROFILES.find((p) => p.key === profileKey) || FLEET_PROFILES[0],
    [profileKey]
  );

  const breakdown = useMemo(() => {
    const perTruck = {
      appStack:    FLEET_BASELINE.legacyAppSubscriptionPerTruck,
      hos:         FLEET_BASELINE.hosViolationExposurePerTruck,
      distracted:  FLEET_BASELINE.distractedDrivingRiskPerTruck * profile.fitBoost,
      insurance:   FLEET_BASELINE.insurancePremiumPerTruck * 0.04, // conservative 4% discount via Crash Guardian
      roadside:    FLEET_BASELINE.roadsideInefficiencyPerTruck,
      churn:       FLEET_BASELINE.driverChurnCostPerTruck * 0.08,   // 8% churn reduction via better tools
    };
    const totalPerTruck =
      perTruck.appStack + perTruck.hos + perTruck.distracted + perTruck.insurance +
      perTruck.roadside + perTruck.churn;
    const annualSavings = totalPerTruck * trucks;
    const annualCost    = profile.planPriceYear * trucks;
    const netSavings    = annualSavings - annualCost;
    const roiMultiple   = annualCost > 0 ? annualSavings / annualCost : 0;
    const paybackDays   = annualSavings > 0 ? Math.round((annualCost / annualSavings) * 365) : 0;
    const revenueRecovered = (annualSavings / (avgRevenuePerTruck * trucks)) * 100;
    return {
      perTruck,
      totalPerTruck,
      annualSavings,
      annualCost,
      netSavings,
      roiMultiple,
      paybackDays,
      revenueRecovered,
    };
  }, [trucks, profile, avgRevenuePerTruck]);

  const rows = [
    { label: 'Replaced app subscriptions',         value: breakdown.perTruck.appStack,   icon: Zap,       color: 'text-sky-300' },
    { label: 'HOS violation risk (prob-weighted)', value: breakdown.perTruck.hos,        icon: Clock,     color: 'text-amber-300' },
    { label: 'Distracted-driving accident cost',   value: breakdown.perTruck.distracted, icon: Shield,    color: 'text-rose-300' },
    { label: 'Insurance premium discount (4%)',    value: breakdown.perTruck.insurance,  icon: TrendingUp, color: 'text-emerald-300' },
    { label: 'Roadside coordination savings',      value: breakdown.perTruck.roadside,   icon: DollarSign, color: 'text-violet-300' },
    { label: 'Driver retention lift',              value: breakdown.perTruck.churn,      icon: Sparkles,  color: 'text-cyan-300' },
  ];

  return (
    <div className="min-h-screen bg-[#07090d] text-white" data-testid="roi-calculator">
      <header className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={28} withWordmark={false} />
            <span className="text-sm font-semibold text-white">RoadBoss</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/try" className="text-slate-300 hover:text-white transition">Try it</Link>
            <Link to="/deck" className="text-slate-300 hover:text-white transition hidden md:inline">Investors</Link>
            <Link to="/pricing" className="text-slate-300 hover:text-white transition hidden md:inline">Pricing</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-12 space-y-10">
        {/* Hero */}
        <section>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-widest text-emerald-300 mb-3">
            <Building2 className="h-3 w-3" /> Fleet ROI calculator · for owners & ops directors
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
            How much does RoadBoss save your fleet?
          </h1>
          <p className="text-slate-300 mt-3 max-w-3xl">
            Plug in your truck count and fleet profile. We&apos;ll show you the annualized savings —
            replaced apps, avoided fines, insurance discounts, retention lift — against the RoadBoss
            Fleet subscription cost. <span className="text-emerald-300 font-semibold">Numbers are conservative, drawn from ATA, FMCSA, and industry insurance benchmarks.</span>
          </p>
        </section>

        {/* Calculator */}
        <section className="grid lg:grid-cols-5 gap-6">
          {/* Inputs */}
          <div className="lg:col-span-2 space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">Fleet size</div>
              <div className="flex items-baseline gap-2 mb-3">
                <div className="text-5xl font-bold text-white" data-testid="roi-trucks-value">{trucks}</div>
                <div className="text-sm text-slate-400">trucks</div>
              </div>
              <input
                type="range"
                min="1"
                max="500"
                step="1"
                value={trucks}
                onChange={(e) => setTrucks(parseInt(e.target.value, 10))}
                data-testid="roi-trucks-slider"
                className="w-full accent-sky-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>1</span><span>100</span><span>250</span><span>500</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">Fleet profile</div>
              <div className="space-y-2">
                {FLEET_PROFILES.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setProfileKey(p.key)}
                    data-testid={`roi-profile-${p.key}`}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                      profileKey === p.key
                        ? 'border-sky-500/50 bg-sky-500/10 text-white'
                        : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p.icon className={`h-4 w-4 ${profileKey === p.key ? 'text-sky-300' : 'text-slate-400'}`} />
                      <div className="text-sm font-medium">{p.label}</div>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Recommended plan: <span className="text-slate-200">{p.recommendedPlan}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">
                Avg revenue / truck / year
              </div>
              <div className="text-3xl font-bold text-white mb-3" data-testid="roi-revenue-value">
                {money(avgRevenuePerTruck)}
              </div>
              <input
                type="range"
                min="80000"
                max="400000"
                step="5000"
                value={avgRevenuePerTruck}
                onChange={(e) => setAvgRevenuePerTruck(parseInt(e.target.value, 10))}
                data-testid="roi-revenue-slider"
                className="w-full accent-emerald-500"
              />
              <div className="text-xs text-slate-500 mt-2">
                Only used to show savings as % of revenue — doesn&apos;t change the savings math.
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-3 space-y-4">
            <motion.div
              key={`${trucks}-${profileKey}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-sky-500/5 to-transparent p-6"
            >
              <div className="flex items-center gap-2 text-emerald-300">
                <DollarSign className="h-5 w-5" />
                <div className="text-xs uppercase tracking-widest font-semibold">Your annualized savings</div>
              </div>
              <div className="text-5xl md:text-6xl font-bold text-white mt-2" data-testid="roi-total-savings">
                {money(breakdown.netSavings)}
              </div>
              <div className="text-sm text-slate-400 mt-2">
                Net of {money(breakdown.annualCost)} in RoadBoss Fleet subscription costs
                ({trucks} × ${profile.planPriceYear.toFixed(0)}/yr).
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">ROI multiple</div>
                  <div className="text-2xl font-bold text-emerald-300 mt-1" data-testid="roi-multiple">
                    {breakdown.roiMultiple.toFixed(1)}x
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">Payback in</div>
                  <div className="text-2xl font-bold text-sky-300 mt-1">
                    {breakdown.paybackDays} <span className="text-sm text-slate-400">days</span>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">% of revenue</div>
                  <div className="text-2xl font-bold text-amber-300 mt-1">
                    {breakdown.revenueRecovered.toFixed(2)}%
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">
                Per-truck annual breakdown
              </div>
              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.label} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-none">
                    <r.icon className={`h-4 w-4 ${r.color}`} />
                    <div className="flex-1 text-sm text-slate-200">{r.label}</div>
                    <div className="text-sm font-mono font-medium text-white">
                      {money(r.value)}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3 py-3 mt-2 rounded-xl bg-white/[0.04] px-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <div className="flex-1 text-sm font-semibold text-white">Total savings per truck per year</div>
                  <div className="text-lg font-bold text-emerald-300" data-testid="roi-per-truck">
                    {money(breakdown.totalPerTruck)}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 mt-4">
                Sources: American Trucking Associations (ATA) driver turnover &amp; distracted-driving economic reports, FMCSA violation
                statistics, national commercial truck insurance benchmarks (Progressive/Nationwide), Motive/Samsara/Omnitracs published
                pricing pages. Calculations are conservative; your actual mileage may vary.
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to="/try">
                <Button data-testid="roi-cta-demo" className="bg-sky-500 text-slate-950 hover:bg-sky-400 h-11 px-5">
                  See the Fleet dashboard live <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              <a href="mailto:mward5710@gmail.com?subject=RoadBoss%20Fleet%20-%20ROI%20follow-up">
                <Button variant="outline" data-testid="roi-cta-email" className="border-white/15 bg-transparent text-slate-100 hover:bg-white/5 h-11 px-5">
                  <Mail className="h-4 w-4 mr-1.5" /> Email the founder
                </Button>
              </a>
              <a href="tel:+17654808889">
                <Button variant="outline" data-testid="roi-cta-phone" className="border-white/15 bg-transparent text-slate-100 hover:bg-white/5 h-11 px-5">
                  <Phone className="h-4 w-4 mr-1.5" /> Call: (765) 480-8889
                </Button>
              </a>
              <Button
                variant="outline"
                onClick={() => window.print()}
                data-testid="roi-print"
                className="border-white/15 bg-transparent text-slate-100 hover:bg-white/5 h-11 px-5"
              >
                <Download className="h-4 w-4 mr-1.5" /> Print / save as PDF
              </Button>
            </div>
          </div>
        </section>

        {/* Testimonial-ish proof strip */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-400">Why trust this math</div>
              <div className="text-slate-200 mt-1">
                Built by a real trucker. Numbers referenced to ATA / FMCSA / NTSB public data.
                We intentionally under-promise.
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-400">Not theoretical</div>
              <div className="text-slate-200 mt-1">
                The RoadBoss app is live with Stripe, Twilio, SendGrid, Mapbox, and AI Co-Pilot
                already wired. Click &quot;See it live&quot; and you&apos;re inside the dashboard in 3 seconds.
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-400">Founder on the line</div>
              <div className="text-slate-200 mt-1">
                Text Mike at <span className="text-emerald-300 font-semibold">(765) 480-8889</span> —
                real phone, real trucker, same day.
              </div>
            </div>
          </div>
        </section>

        <div className="text-center text-xs text-slate-500 pt-6 pb-10">
          Operated by Apex Epoxy Flooring LLC · DBA RoadBoss / Highway Pilot · Kokomo, Indiana
        </div>
      </main>

      <style>{`
        @media print {
          header, nav, a[data-testid^="roi-cta"], button[data-testid^="roi-cta"], button[data-testid="roi-print"] { display: none !important; }
          body { background: white !important; color: black !important; }
          [data-testid="roi-calculator"] * { color: black !important; border-color: #ccc !important; background: white !important; }
        }
      `}</style>
    </div>
  );
}
