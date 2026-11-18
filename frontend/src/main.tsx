import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/900.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import './index.css';
import { LOCKED_EVENT, api, useAppState, type AppState } from './lib/api';
import { LOCK_AFTER_MINUTES } from '@shared';
import { LockScreen } from './pages/LockScreen';
import { applyTheme } from './lib/theme';
import { ToastProvider } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { LevelChange } from './components/LevelChange';
import { Auth } from './pages/Auth';
import { Awakening } from './pages/Awakening';
import { Today } from './pages/Today';
import { Character } from './pages/Character';
import { Settings } from './pages/Settings';
import { Rules } from './pages/Rules';
import { Goals } from './pages/Goals';
import { Store } from './pages/Store';
import { TitleWatcher } from './components/TitleWatcher';
import { GateLayout } from './pages/gate/GateLayout';
import { GateToday } from './pages/gate/GateToday';
import { Plan as GatePlan } from './pages/gate/Plan';
import { GateHistory } from './pages/gate/History';
import { Exercises as GateExercises } from './pages/gate/Exercises';
import { Runs as GateRuns } from './pages/gate/Runs';
import { AmbientParticles } from './components/fx';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (n, err: any) => err?.status !== 401 && n < 2 } },
});

function Splash() {
  return <div className="flex min-h-dvh items-center justify-center font-display text-xl tracking-[0.4em] text-accent">ARISE</div>;
}

function Game() {
  const { data: s, error } = useAppState();
  useEffect(() => { if (s) applyTheme(s.progress.rank); }, [s?.progress.rank]);
  if (error) return <div className="p-8 text-center text-bad">{(error as Error).message}</div>;
  if (!s) return <Splash />;
  if (!s.profile.onboarded) return <><AmbientParticles rank="E" /><Awakening /></>;
  return (
    <>
      <AmbientParticles rank={s.progress.rank} />
      <LevelChange s={s} />
      <TitleWatcher s={s} />
      <Routes>
        {/* The Gate: its own dimension, outside the main layout (no Arise header or nav). */}
        <Route path="gate" element={<GateLayout />}>
          <Route index element={<GateToday />} />
          <Route path="plan" element={<GatePlan />} />
          <Route path="runs" element={<GateRuns />} />
          <Route path="history" element={<GateHistory />} />
          <Route path="exercises" element={<GateExercises />} />
        </Route>
        <Route element={<Layout s={s} />}>
          <Route index element={<Today s={s} />} />
          <Route path="goals" element={<Goals s={s} />} />
          <Route path="store" element={<Store s={s} />} />
          <Route path="archive" element={<Navigate to="/character?tab=archive" replace />} />
          <Route path="character" element={<Character s={s} />} />
          <Route path="settings" element={<Settings s={s} />} />
          <Route path="settings/rules" element={<Rules s={s} />} />
          <Route path="*" element={<Today s={s} />} />
        </Route>
      </Routes>
    </>
  );
}

type AuthStatus = { configured: boolean; authed: boolean; locked: boolean; passkeys: number };

function App() {
  const qc = useQueryClient();
  // Re-checked whenever the app comes back to the foreground (react-query refetches on focus).
  const auth = useQuery({ queryKey: ['auth'], queryFn: () => api<AuthStatus>('GET', '/auth/status') });
  const locked = !!auth.data?.locked;

  // Any request answered "locked" (423) means this device just locked: re-check, and show the lock screen.
  useEffect(() => {
    const onLocked = () => void qc.invalidateQueries({ queryKey: ['auth'] });
    window.addEventListener(LOCKED_EVENT, onLocked);
    return () => window.removeEventListener(LOCKED_EVENT, onLocked);
  }, [qc]);
  // Back after LOCK_AFTER_MINUTES away (another app, screen off): lock on the spot, from the device's own clock,
  // instead of waiting for a request to come back "locked". The server is told too, so both agree.
  useEffect(() => {
    // Last moment the app was on screen. A heartbeat keeps it fresh; it stops while the page is hidden, frozen
    // or the phone sleeps, so the gap shows even when the browser never sent a "hidden" event.
    let seen = Date.now();
    const check = () => {
      if (document.visibilityState === 'hidden') { seen = Date.now(); return; }
      const away = Date.now() - seen;
      seen = Date.now();
      const s = qc.getQueryData<AppState>(['state']);
      const a = qc.getQueryData<AuthStatus>(['auth']);
      if (!s?.lock.enabled || !a?.authed || a.locked || away < LOCK_AFTER_MINUTES * 60_000) return;
      qc.setQueryData<AuthStatus>(['auth'], { ...a, locked: true, passkeys: s.lock.passkeys.length });
      void api('POST', '/lock/now').catch(() => {}).finally(() => qc.invalidateQueries({ queryKey: ['auth'] }));
    };
    const beat = setInterval(() => { if (document.visibilityState === 'visible') check(); }, 5_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check); // restored from the back/forward cache
    window.addEventListener('focus', check);
    return () => {
      clearInterval(beat);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('focus', check);
    };
  }, [qc]);
  // While locked, keep none of your data in memory either.
  useEffect(() => {
    if (locked) qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
  }, [locked, qc]);

  if (!auth.data) return <Splash />;
  if (!auth.data.authed) return <Auth configured={auth.data.configured} />;
  if (locked) return <LockScreen passkeys={auth.data.passkeys} />;
  return (
    <ErrorBoundary>
      <Game />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
