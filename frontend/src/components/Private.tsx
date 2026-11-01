import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen } from 'lucide-react';
import { useAction, type AppState } from '../lib/api';
import { Button, Sheet, useToast } from './ui';

// Private habits and quests: names stay masked until this device unlocks with the password (5 minutes).

export function UnlockSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const action = useAction();
  const toast = useToast();
  const [password, setPassword] = useState('');
  useEffect(() => { if (open) setPassword(''); }, [open]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    action.mutate({ path: '/private/unlock', body: { password } }, {
      onSuccess: () => { toast('Private items visible for 5 minutes', 'good'); onClose(); },
      onError: (err) => toast(err.message, 'bad'),
    });
  };
  return (
    <Sheet open={open} onClose={onClose} title="Private items">
      <form onSubmit={submit}>
        <p className="mb-4 flex items-start gap-2 text-sm text-ink2">
          <Lock size={16} className="mt-0.5 shrink-0 text-accent" />
          Enter your password to see private habits and quests on this device for 5 minutes.
        </p>
        <input type="password" className="field" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        <Button type="submit" className="mt-4 w-full" disabled={!password || action.isPending}>Unlock</Button>
      </form>
    </Sheet>
  );
}

/** Shown while private habits are revealed: time left, and a way to hide them now. */
export function PrivateUnlockedBar({ s }: { s: AppState }) {
  const action = useAction();
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const until = s.privateUntil ? Date.parse(s.privateUntil) : 0;
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => {
      setNow(Date.now());
      // Re-fetch at expiry so the names are masked again without waiting for the next poll.
      if (Date.now() >= until) {
        clearInterval(t);
        void qc.invalidateQueries();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [until, qc]);
  if (!until || now >= until) return null;
  const left = Math.ceil((until - now) / 1000);
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
      <LockOpen size={15} className="text-accent" />
      <span className="flex-1 text-ink2">Private items visible · <span className="tabular-nums text-ink">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span></span>
      <button onClick={() => action.mutate({ path: '/private/lock' })} className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-ink2 hover:text-ink">Lock now</button>
    </div>
  );
}
