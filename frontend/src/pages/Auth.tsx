import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { Button, Panel } from '../components/ui';

/** First visit sets the password; afterwards it's a login gate. */
export function Auth({ configured }: { configured: boolean }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!configured && password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      await api('POST', configured ? '/auth/login' : '/auth/setup', { password });
      await qc.invalidateQueries();
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
          <h1 className="font-display text-3xl font-black tracking-[0.3em] text-accent">ARISE</h1>
          <p className="mt-2 text-sm text-ink2">{configured ? 'The System awaits your return.' : 'Seal the System with a password.'}</p>
        </div>
        <Panel className="p-6">
          <form onSubmit={submit} className="space-y-3">
            <input type="password" className="field" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
              autoComplete={configured ? 'current-password' : 'new-password'} />
            {!configured && (
              <input type="password" className="field" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            )}
            {error && <p className="text-sm font-semibold text-bad">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || password.length < (configured ? 1 : 6)}>
              {configured ? 'Enter' : 'Set password'}
            </Button>
            {!configured && <p className="text-center text-xs text-muted">At least 6 characters.</p>}
          </form>
        </Panel>
      </motion.div>
    </div>
  );
}
