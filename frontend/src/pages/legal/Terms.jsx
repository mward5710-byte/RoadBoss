import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';
import BrandedFooter from '@/components/BrandedFooter';

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <header className="border-b border-white/5 sticky top-0 bg-[#07090d]/90 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={26} withWordmark={false} />
            <span className="text-sm font-semibold text-white">WreckerLogix</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/legal/privacy" className="text-slate-300 hover:text-white transition">Privacy</Link>
            <Link to="/wrecker/signup" className="text-slate-300 hover:text-white transition">Sign up</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-5 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-slate-300 mt-3">
          These Terms govern use of WreckerLogix and related RoadBoss services.
        </p>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-slate-300 mt-3">
            <strong className="text-white">RoadBoss Technologies / Apex Epoxy &amp; Flooring LLC</strong>
            <br />
            715 S. McCann St., Kokomo, IN 46901, United States
            <br />
            mward5710@gmail.com · https://www.apexepoxyflooringllc.com
          </p>
        </section>
        <BrandedFooter className="py-10" />
      </main>
    </div>
  );
}
