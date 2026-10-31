import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Flame, Swords, CalendarDays, History, Dumbbell, Loader2, type LucideIcon } from 'lucide-react';
import { useGate } from '../../lib/api';
import { GenerativeArt, VORTEX_SIM } from '../../components/fx';

// The Iron Temple (internally "gate"): a separate dimension. Its own crimson palette (data-dimension on <html>), its own
// top bar and tabs; the main header and navigation are gone until you go back to Arise.

const GATE_NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/gate', label: 'Today', icon: Swords },
  { to: '/gate/plan', label: 'Plan', icon: CalendarDays },
  { to: '/gate/history', label: 'History', icon: History },
  { to: '/gate/exercises', label: 'Exercises', icon: Dumbbell },
];

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Full-screen portal animation used when entering and leaving. */
function Portal({ leaving }: { leaving: boolean }) {
  return (
    <motion.div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b0506]"
      initial={{ opacity: leaving ? 0 : 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      {!reducedMotion() && <GenerativeArt color="#dc2626" color2="#f97316" sim={VORTEX_SIM} />}
      <div className="relative px-8 text-center">
        <motion.p className="font-display text-2xl font-bold tracking-[0.4em] text-[#fbf4f4]"
          initial={{ opacity: 0, letterSpacing: '0.1em' }} animate={{ opacity: 1, letterSpacing: '0.4em' }} transition={{ duration: 0.6 }}>
          {leaving ? 'ARISE' : 'IRON TEMPLE'}
        </motion.p>
        <motion.p className="mt-3 text-sm italic text-[#c9a9a9]"
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5 }}>
          {leaving ? 'You leave stronger than you entered.' : 'The Iron Temple does not close.'}
        </motion.p>
      </div>
    </motion.div>
  );
}

export function GateLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: g } = useGate();
  const [portal, setPortal] = useState<'enter' | 'leave' | null>(reducedMotion() ? null : 'enter');

  // Switch the whole app into the Gate's palette while we're inside.
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.dimension = 'gate';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0b0506');
    return () => {
      delete html.dataset.dimension;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#020617');
    };
  }, []);

  useEffect(() => {
    if (portal !== 'enter') return;
    const t = setTimeout(() => setPortal(null), 850);
    return () => clearTimeout(t);
  }, [portal]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const leave = () => {
    if (reducedMotion()) return navigate('/');
    setPortal('leave');
    setTimeout(() => navigate('/'), 650);
  };

  return (
    <div className="mx-auto min-h-dvh max-w-4xl px-4 pb-28 md:pb-10">
      <AnimatePresence>{portal && <Portal key={portal} leaving={portal === 'leave'} />}</AnimatePresence>

      <header className="glass-solid sticky top-0 z-40 -mx-4 mb-3 flex items-center gap-2 rounded-b-3xl border-t-0 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:mx-0 sm:mt-3 sm:rounded-3xl sm:border-t">
        <button onClick={leave} className="flex items-center gap-0.5 rounded-lg py-1.5 pl-1 pr-2.5 text-sm font-bold text-ink2 hover:bg-white/5 hover:text-ink">
          <ChevronLeft size={18} /> Arise
        </button>
        <h1 className="flex-1 text-center font-display text-lg font-bold tracking-[0.3em] text-accent">IRON TEMPLE</h1>
        <span className="flex min-w-[4.5rem] items-center justify-end gap-1 pr-1 text-sm font-bold text-accent2" title="Weekly workout streak">
          <Flame size={15} /> {g?.streak.current ?? 0}<span className="text-xs font-semibold text-muted">wk</span>
        </span>
      </header>

      {/* Desktop: tabs under the header */}
      <nav className="mb-4 hidden gap-1 rounded-xl border border-line p-1 md:flex">
        {GATE_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/gate'}
            className={({ isActive }) => `flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-black uppercase tracking-[0.12em] ${isActive ? 'bg-accent/20 text-ink' : 'text-muted hover:text-ink2'}`}>
            <Icon size={15} /> {label}
          </NavLink>
        ))}
      </nav>

      {g ? <Outlet /> : <div className="flex justify-center py-16 text-muted"><Loader2 className="animate-spin" /></div>}

      {/* Phone: the Gate's own bottom bar */}
      <nav className="glass-solid safe-bottom fixed inset-x-0 bottom-0 z-40 flex rounded-t-2xl border-b-0 md:hidden">
        {GATE_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/gate'}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2.5 ${isActive ? 'text-accent' : 'text-muted'}`}>
            {({ isActive }) => (
              <>
                <span className={`rounded-xl p-1.5 ${isActive ? 'bg-accent/15' : ''}`}><Icon size={21} /></span>
                <span className="text-[9px] font-black uppercase tracking-[0.12em]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
