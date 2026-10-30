import { Link } from 'react-router-dom';
import { Flame, Coins, Gem, Settings } from 'lucide-react';
import type { AppState } from '../lib/api';
import { Avatar } from './Avatar';
import { BodyStats } from './BodyStats';
import { CategoryIcon, ProgressBar } from './ui';

export function Header({ s }: { s: AppState }) {
  const p = s.progress;
  return (
    <header className="glass-solid sticky top-0 z-40 -mx-4 mb-2 rounded-b-3xl border-t-0 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:mx-0 sm:mt-3 sm:rounded-3xl sm:border-t">
      <div className="flex items-center gap-3">
        <Avatar src={s.profile.avatar} name={s.profile.name} rank={p.rank} size={44} level={p.level} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-black tracking-tight">{s.profile.name}</h1>
            {s.equippedTitle && <span className="hidden truncate text-xs italic text-ink2 min-[400px]:inline">« {s.equippedTitle.name} »</span>}
            {s.streak.current > 0 && (
              <span className="pulse-glow flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-bold text-gold" title="Daily streak">
                <Flame size={12} /> {s.streak.current}
              </span>
            )}
          </div>
          <p className="truncate font-display text-sm font-bold tracking-[0.15em] text-rank">
            {p.rank}-RANK · {p.title.toUpperCase()}
          </p>
          <BodyStats s={s} size="sm" />
        </div>
        <div className="flex flex-col items-end gap-1 text-xs font-bold">
          <span className="flex items-center gap-1 text-gold"><Coins size={13} /> {s.wallet.credits}</span>
          <span className="flex items-center gap-1 text-accent2"><Gem size={13} /> {s.wallet.gems}</span>
        </div>
        <Link to="/settings" aria-label="Settings" className="-mr-1 self-start rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-ink md:hidden">
          <Settings size={18} />
        </Link>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted">
          <span>Level {p.level}</span>
          <span>{p.level >= p.maxLevel ? 'MAX' : `${p.into.toLocaleString()} / ${p.need.toLocaleString()} XP`}</span>
        </div>
        <ProgressBar pct={p.pct} />
      </div>

      <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1">
        {s.categories.map((c) => (
          <div key={c.id} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/5 bg-black/20 px-2 py-1" title={`${c.name}: ${c.xp} XP`}>
            <span style={{ color: c.color }}><CategoryIcon name={c.icon} size={13} /></span>
            <span className="text-[9px] font-black uppercase tracking-wider text-muted">{c.name}</span>
            <span className="text-xs font-black" style={{ color: c.color }}>{c.level}</span>
          </div>
        ))}
      </div>
    </header>
  );
}
