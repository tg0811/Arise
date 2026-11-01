import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Fingerprint, Lock, LockOpen } from 'lucide-react';
import { useAction, useAppState, type AppState } from '../lib/api';
import { passkeysSupported, unlockWithPasskey } from '../lib/passkey';
import { Button, Sheet, useToast } from './ui';

// Private habits and quests: names stay masked until this device unlocks with the password (5 minutes).

export function UnlockSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const action = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: s } = useAppState();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPassword(''); }, [open]);
  const canFingerprint = !!s?.lock.passkeys.length && passkeysSupported();
  const fingerprint = async () => {
    setBusy(true);
    try {
      await unlockWithPasskey('private');
      await qc.invalidateQueries({ queryKey: ['state'] });
      toast('Private items visible for 5 minutes', 'good');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };
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
          Enter your password (or use your fingerprint) to see private habits and quests on this device for 5 minutes.
        </p>
        <input type="password" className="field" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        <Button type="submit" className="mt-4 w-full" disabled={!password || action.isPending}>Unlock</Button>
        {canFingerprint && (
          <Button type="button" variant="ghost" className="mt-2 w-full" onClick={fingerprint} disabled={busy}><Fingerprint size={16} /> Use fingerprint</Button>
        )}
      </form>
    </Sheet>
  );
}

/** Shown while private habits are revealed: time left, and a way to hide them now. */
export function PrivateUnlockedBar({ s, className = '' }: { s: AppState; className?: string }) {
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
    <div className={`flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm ${className}`}>
      <LockOpen size={15} className="text-accent" />
      <span className="flex-1 text-ink2">Private items visible · <span className="tabular-nums text-ink">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span></span>
      <button onClick={() => action.mutate({ path: '/private/lock' })} className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-ink2 hover:text-ink">Lock now</button>
    </div>
  );
}
