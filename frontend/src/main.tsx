import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/900.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import './index.css';
import { api, useAppState } from './lib/api';
import { applyTheme } from './lib/theme';
import { ToastProvider } from './components/ui';
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
  if (!s.profile.onboarded) return <Awakening />;
  return (
    <>
      <LevelChange s={s} />
      <Routes>
        <Route element={<Layout s={s} />}>
          <Route index element={<Today s={s} />} />
          <Route path="goals" element={<Goals s={s} />} />
          <Route path="store" element={<Store s={s} />} />
          <Route path="character" element={<Character s={s} />} />
          <Route path="settings" element={<Settings s={s} />} />
          <Route path="settings/rules" element={<Rules s={s} />} />
          <Route path="*" element={<Today s={s} />} />
        </Route>
      </Routes>
    </>
  );
}

function App() {
  const auth = useQuery({ queryKey: ['auth'], queryFn: () => api<{ configured: boolean; authed: boolean }>('GET', '/auth/status') });
  if (!auth.data) return <Splash />;
  if (!auth.data.authed) return <Auth configured={auth.data.configured} />;
  return <Game />;
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
