import React from 'react';
import { getUser, auth } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut, Volume2, Bell, Mic, Sparkles, BookOpen } from 'lucide-react';
import { triggerDriverTour } from '@/components/DriverOnboardingTour';
import PushNotificationToggle from '@/components/PushNotificationToggle';
import { toast } from 'sonner';

export default function DriverSettings() {
  const user = getUser();
  const navigate = useNavigate();
  const test = () => {
    try {
      const u = new SpeechSynthesisUtterance('Pilot voice test. Drive safe out there.');
      window.speechSynthesis.speak(u);
    } catch {}
  };
  const replayTour = () => {
    triggerDriverTour();
    toast.success('Replaying onboarding tour');
  };
  return (
    <div className="p-5 space-y-4">
      <h1 className="text-2xl font-bold text-white">Settings</h1>
      <div className="hp-panel rounded-2xl p-5">
        <div className="text-xs uppercase tracking-widest text-slate-500">Driver</div>
        <div className="text-lg text-white mt-1">{user?.name}</div>
        <div className="text-xs text-slate-400">{user?.email}</div>
      </div>
      <div className="hp-panel rounded-2xl divide-y divide-white/5">
        <button
          onClick={test}
          data-testid="settings-test-voice"
          className="w-full p-4 flex items-center gap-3 text-left hover:bg-white/[0.02]"
        >
          <Volume2 className="w-4 h-4 text-sky-300" />
          <div className="flex-1">
            <div className="text-sm text-white">Test voice playback</div>
            <div className="text-xs text-slate-500">Plays a short TTS sample</div>
          </div>
        </button>
        <button
          onClick={replayTour}
          data-testid="settings-replay-tour"
          className="w-full p-4 flex items-center gap-3 text-left hover:bg-white/[0.02]"
        >
          <Sparkles className="w-4 h-4 text-emerald-300" />
          <div className="flex-1">
            <div className="text-sm text-white">Replay onboarding tour</div>
            <div className="text-xs text-slate-500">60-second walkthrough of voice, wake word & safety</div>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
            New
          </span>
        </button>
        <a
          href="/guide"
          target="_blank"
          rel="noreferrer"
          data-testid="settings-open-manual"
          className="w-full p-4 flex items-center gap-3 text-left hover:bg-white/[0.02]"
        >
          <BookOpen className="w-4 h-4 text-amber-300" />
          <div className="flex-1">
            <div className="text-sm text-white">Open user manual</div>
            <div className="text-xs text-slate-500">Full instructions for voice, DVIR, crash, GPS, billing</div>
          </div>
        </a>
        <div className="w-full p-4 flex items-center gap-3">
          <Mic className="w-4 h-4 text-sky-300" />
          <div className="flex-1">
            <div className="text-sm text-white">Voice command</div>
            <div className="text-xs text-slate-500">Web Speech API · native iOS coming</div>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 uppercase tracking-wider">
            Beta
          </span>
        </div>
      </div>
      <PushNotificationToggle variant="driver" />
      <Button
        onClick={() => {
          auth.logout();
          navigate('/login');
        }}
        data-testid="settings-signout"
        variant="outline"
        className="w-full border-red-500/40 text-red-300 hover:bg-red-500/10"
      >
        <LogOut className="w-4 h-4 mr-2" /> Sign out
      </Button>
    </div>
  );
}
