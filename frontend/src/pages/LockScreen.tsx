import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Fingerprint, KeyRound, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { deviceHasPasskey, passkeysSupported, unlockWithPasskey } from '../lib/passkey';
import { Button, Panel } from '../components/ui';

/** Shown instead of the app while this device is locked. The server sends no data until it's unlocked. */
export function LockScreen({ passkeys }: { passkeys: number }) {
  const qc = useQueryClient();
  const canFingerprint = passkeys > 0 && passkeysSupported();
  const [mode, setMode] = useState<'passkey' | 'password'>(canFingerprint ? 'passkey' : 'password');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const prompted = useRef(false);

  const unlocked = () => qc.invalidateQueries();

  const fingerprint = async () => {
    setError('');
    setBusy(true);
    try {
      await unlockWithPasskey();
      await unlocked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // This device has a passkey: ask for the fingerprint straight away (once, even under StrictMode).
  useEffect(() => {
    if (mode === 'passkey' && deviceHasPasskey() && !prompted.current) {
      prompted.current = true;
      void fingerprint();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('POST', '/lock/password', { password });
      await unlocked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icons/icon.svg" alt="" className="mx-auto mb-4 h-20 w-20" />
          <h1 className="font-display text-2xl font-black tracking-[0.25em] text-accent">UNLOCK TO ARISE</h1>
          <p className="mt-2 text-sm italic text-ink2">[ The System is sealed. Prove it's you. ]</p>
        </div>
        <Panel className="p-6">
          {mode === 'passkey' ? (
            <div className="space-y-3 text-center">
              <button onClick={fingerprint} disabled={busy} aria-label="Unlock with fingerprint"
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-accent/50 bg-accent/10 text-accent transition active:scale-95 disabled:opacity-60">
                {busy ? <Loader2 size={34} className="animate-spin" /> : <Fingerprint size={40} />}
              </button>
              <p className="text-sm text-ink2">Touch to unlock with your fingerprint</p>
              {error && <p className="text-sm font-semibold text-bad">{error}</p>}
              <button onClick={() => { setError(''); setMode('password'); }} className="text-xs font-bold text-muted hover:text-ink2">Use password instead</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <input type="password" className="field" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
              {error && <p className="text-sm font-semibold text-bad">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy || !password}><KeyRound size={15} /> Unlock</Button>
              {canFingerprint && (
                <button type="button" onClick={() => { setError(''); setMode('passkey'); }} className="block w-full text-center text-xs font-bold text-muted hover:text-ink2">
                  Use fingerprint instead
                </button>
              )}
            </form>
          )}
        </Panel>
      </motion.div>
    </div>
  );
}
