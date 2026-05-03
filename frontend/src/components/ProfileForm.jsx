import React, { useState } from 'react';
import { api, getUser, setSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { User, Lock, Save } from 'lucide-react';

export default function ProfileForm({ titleSize = 'text-2xl' }) {
  const u = getUser();
  const [name, setName] = useState(u?.name || '');
  const [curr, setCurr] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (name && name !== u.name) payload.name = name;
      if (pw) {
        if (pw !== pw2) { toast.error('New passwords do not match'); setSaving(false); return; }
        if (pw.length < 8) { toast.error('Password must be at least 8 chars'); setSaving(false); return; }
        payload.current_password = curr;
        payload.new_password = pw;
      }
      if (Object.keys(payload).length === 0) { toast.info('Nothing to update'); setSaving(false); return; }
      const r = await api.put('/auth/profile', payload);
      // refresh local user
      const tok = localStorage.getItem('hp_token');
      setSession(tok, r.data);
      setCurr(''); setPw(''); setPw2('');
      toast.success('Profile updated');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Update failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className={`${titleSize} font-bold text-white`}>Profile</h1>
        <div className="text-xs text-slate-500 mt-1">{u?.email} · {u?.role?.replace('_', ' ')}</div>
      </div>

      <div className="hp-panel rounded-xl p-5 space-y-3">
        <div className="text-sm font-semibold text-white flex items-center gap-2"><User className="w-4 h-4 text-sky-400" /> Account</div>
        <Input data-testid="profile-name" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="bg-[#0a0e14] border-white/10" />
        <div className="text-xs text-slate-500">Email cannot be changed in Stage 2.</div>
      </div>

      <div className="hp-panel rounded-xl p-5 space-y-3">
        <div className="text-sm font-semibold text-white flex items-center gap-2"><Lock className="w-4 h-4 text-amber-400" /> Change password</div>
        <Input data-testid="profile-curr" type="password" placeholder="Current password" value={curr} onChange={(e) => setCurr(e.target.value)} className="bg-[#0a0e14] border-white/10" />
        <Input data-testid="profile-pw" type="password" placeholder="New password (min 8 chars)" value={pw} onChange={(e) => setPw(e.target.value)} className="bg-[#0a0e14] border-white/10" />
        <Input data-testid="profile-pw2" type="password" placeholder="Confirm new password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="bg-[#0a0e14] border-white/10" />
      </div>

      <Button data-testid="profile-save" onClick={save} disabled={saving} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"><Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save changes'}</Button>
    </div>
  );
}
