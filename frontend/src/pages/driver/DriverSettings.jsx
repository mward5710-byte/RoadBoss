import React from 'react';
import { getUser, auth } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut, Volume2, Bell, Mic } from 'lucide-react';

export default function DriverSettings() {
  const user = getUser();
  const navigate = useNavigate();
  const test = () => { try { const u = new SpeechSynthesisUtterance('Pilot voice test. Drive safe out there.'); window.speechSynthesis.speak(u); } catch {} };
  return (
    <div className="p-5 space-y-4">
      <h1 className="text-2xl font-bold text-white">Settings</h1>
      <div className="hp-panel rounded-2xl p-5">
        <div className="text-xs uppercase tracking-widest text-slate-500">Driver</div>
        <div className="text-lg text-white mt-1">{user?.name}</div>
        <div className="text-xs text-slate-400">{user?.email}</div>
      </div>
      <div className="hp-panel rounded-2xl divide-y divide-white/5">
        <button onClick={test} className="w-full p-4 flex items-center gap-3 text-left hover:bg-white/[0.02]"><Volume2 className="w-4 h-4 text-sky-300" /><div className="flex-1"><div className="text-sm text-white">Test voice playback</div><div className="text-xs text-slate-500">Plays a short TTS sample</div></div></button>
        <div className="w-full p-4 flex items-center gap-3"><Mic className="w-4 h-4 text-sky-300" /><div className="flex-1"><div className="text-sm text-white">Voice command</div><div className="text-xs text-slate-500">Web Speech API · native iOS coming</div></div><span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 uppercase tracking-wider">Beta</span></div>
        <div className="w-full p-4 flex items-center gap-3"><Bell className="w-4 h-4 text-amber-300" /><div className="flex-1"><div className="text-sm text-white">Notifications</div><div className="text-xs text-slate-500">Push, SMS · coming soon</div></div></div>
      </div>
      <Button onClick={() => { auth.logout(); navigate('/login'); }} variant="outline" className="w-full border-red-500/40 text-red-300 hover:bg-red-500/10"><LogOut className="w-4 h-4 mr-2" /> Sign out</Button>
    </div>
  );
}
