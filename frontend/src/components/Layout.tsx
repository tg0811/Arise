import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Swords, Target, ShoppingBag, ScrollText, User, Settings, type LucideIcon } from 'lucide-react';
import type { AppState } from '../lib/api';
import { Header } from './Header';

export const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Today', icon: Swords },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/store', label: 'Store', icon: ShoppingBag },
  { to: '/archive', label: 'Archive', icon: ScrollText },
  { to: '/character', label: 'Character', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];
// Phones get five tabs; Settings lives behind the gear in the header instead.
const MOBILE_NAV = NAV.filter((n) => n.to !== '/settings');

export function Layout({ s }: { s: AppState }) {
  // A new page starts at the top, not at the previous page's scroll position.
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl">
      {/* Desktop sidebar */}
      <nav className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 px-3 py-6 md:flex">
        <div className="mb-6 px-3 font-display text-xl font-black tracking-[0.3em] text-accent">ARISE</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => `relative flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-black uppercase tracking-[0.12em] transition ${isActive ? 'glass text-ink' : 'text-muted hover:text-ink'}`}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_10px_var(--sl-accent)]" />}
                <Icon size={18} className={isActive ? 'text-accent' : ''} /> {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <main className="min-w-0 flex-1 px-4 pb-28 md:pb-10">
        <Header s={s} />
        <Outlet />
      </main>

      {/* Mobile bottom bar */}
      <nav className="glass-solid safe-bottom fixed inset-x-0 bottom-0 z-40 flex rounded-t-2xl border-b-0 md:hidden">
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2.5 transition ${isActive ? 'text-accent' : 'text-muted'}`}>
            {({ isActive }) => (
              <>
                <span className={`rounded-xl p-1.5 transition ${isActive ? 'bg-accent/15' : ''}`}><Icon size={21} /></span>
                <span className="text-[9px] font-black uppercase tracking-[0.12em]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
