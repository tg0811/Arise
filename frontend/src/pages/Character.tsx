import { Flame, Trophy, Coins, Gem, Sun, Cloud, CloudRain, CloudLightning, Lock, Award } from 'lucide-react';
import { RANKS, totalXpForLevel } from '@shared';
import { useAction, type AppState } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { BodyStats } from '../components/BodyStats';
import { CategoryIcon, Panel, ProgressBar, SectionTitle, useToast } from '../components/ui';
import { rankColor } from '../lib/theme';

const MOODS = {
  radiant: { icon: Sun, label: 'Radiant', hint: '≥90% cleared this week' },
  steady: { icon: Cloud, label: 'Steady', hint: '≥60% cleared this week' },
  worn: { icon: CloudRain, label: 'Worn', hint: '≥30% cleared this week' },
  broken: { icon: CloudLightning, label: 'Broken', hint: 'under 30% this week' },
};

/** The Mirror: who you are right now. */
export function Character({ s }: { s: AppState }) {
  const p = s.progress;
  const mood = MOODS[s.mood];
  const MoodIcon = mood.icon;
  const toNextRank = p.nextRank ? totalXpForLevel(p.nextRank.minLevel) - p.totalXp : 0;

  return (
    <div className="pt-2">
      <Panel className="mt-3 flex flex-col items-center p-6 text-center">
        <Avatar src={s.profile.avatar} name={s.profile.name} rank={p.rank} size={120} />
        <h2 className="mt-3 text-2xl font-black">{s.profile.name}</h2>
        <p className="font-display text-base font-bold tracking-[0.2em] text-rank">{p.title.toUpperCase()}</p>
        {s.equippedTitle && <p className="mt-1 text-sm italic text-ink2">« {s.equippedTitle.name} »</p>}
        <div className="mt-2"><BodyStats s={s} /></div>
        <div className="mt-4 flex items-center gap-6">
          <div><div className="font-display text-5xl font-bold text-rank text-glow">{p.rank}</div><div className="label">Rank</div></div>
          <div className="h-10 w-px bg-line" />
          <div><div className="font-display text-4xl font-black">{p.level}</div><div className="label">Level</div></div>
          <div className="h-10 w-px bg-line" />
          <div title={mood.hint}><MoodIcon size={30} className="mx-auto text-accent" /><div className="label mt-1">{mood.label}</div></div>
        </div>
        <div className="mt-5 w-full">
          <ProgressBar pct={p.pct} className="h-2.5" />
          <div className="mt-1.5 flex justify-between text-xs text-ink2">
            <span>{p.totalXp.toLocaleString()} XP total</span>
            <span>{p.level >= p.maxLevel ? 'Max level' : `${(p.need - p.into).toLocaleString()} XP to Lv ${p.level + 1}`}</span>
          </div>
          {p.nextRank && (
            <p className="mt-2 text-xs text-muted">
              {p.nextRank.rank}-Rank <span className="text-ink2">{p.nextRank.title}</span> at Lv {p.nextRank.minLevel} · {toNextRank.toLocaleString()} XP away
            </p>
          )}
        </div>
      </Panel>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Flame size={18} className="text-gold" />} label="Streak" value={`${s.streak.current}d`} />
        <Stat icon={<Trophy size={18} className="text-accent2" />} label="Best streak" value={`${s.streak.best}d`} />
        <Stat icon={<Coins size={18} className="text-gold" />} label="Credits" value={s.wallet.credits} />
        <Stat icon={<Gem size={18} className="text-accent2" />} label="Gems" value={s.wallet.gems} />
      </div>

      <SectionTitle>Attributes</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {s.categories.map((c) => (
          <Panel key={c.id} brackets={false} className="p-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl p-2" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}>
                <CategoryIcon name={c.icon} size={20} />
              </span>
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="font-bold">{c.name}</span>
                  <span className="text-sm font-black" style={{ color: c.color }}>Lv {c.level}</span>
                </div>
                <ProgressBar pct={c.pct} color={c.color} className="mt-1.5 h-1.5" />
                <div className="mt-1 text-[11px] text-muted">{c.xp.toLocaleString()} XP · {c.need - c.into} to next</div>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <Titles s={s} />

      <SectionTitle>Rank ladder</SectionTitle>
      <Panel brackets={false} className="divide-y divide-line">
        {RANKS.map((r) => {
          const current = r.rank === p.rank;
          const reached = p.level >= r.minLevel;
          return (
            // Each rank in its own colour, so the warm → cool climb is visible at a glance.
            <div key={r.rank} className="flex items-center gap-4 px-4 py-3"
              style={current ? { background: `color-mix(in srgb, ${rankColor(r.rank)} 14%, transparent)`, boxShadow: `inset 3px 0 0 ${rankColor(r.rank)}` } : undefined}>
              <span className={`w-8 font-display text-3xl font-bold ${reached ? 'text-glow' : 'opacity-35'}`} style={{ color: rankColor(r.rank) }}>{r.rank}</span>
              <span className={`flex-1 font-display text-sm tracking-wider ${reached ? 'text-ink' : 'text-muted'}`}>{r.title}</span>
              <span className="text-xs text-muted">Lv {r.minLevel}+</span>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Panel brackets={false} className="p-3">
      <div className="flex items-center gap-2">{icon}<span className="label">{label}</span></div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </Panel>
  );
}

/** Earned titles: unlocked ones can be equipped (shown with your name); locked ones show progress. */
function Titles({ s }: { s: AppState }) {
  const action = useAction();
  const toast = useToast();
  const equip = (key: string | null, name?: string) =>
    action.mutate({ method: 'PUT', path: '/profile', body: { equippedTitle: key } }, {
      onSuccess: () => toast(key ? `Title equipped: ${name}` : 'Title removed', 'good'),
      onError: (e) => toast(e.message, 'bad'),
    });
  const unlocked = s.titles.filter((t) => t.unlocked);
  const locked = s.titles.filter((t) => !t.unlocked).sort((a, b) => b.cur / b.target - a.cur / a.target);

  return (
    <>
      <SectionTitle right={<span className="text-xs font-bold text-muted">{unlocked.length}/{s.titles.length}</span>}>Titles</SectionTitle>
      {unlocked.length === 0 && <p className="mb-3 text-sm text-muted">No titles yet. They're earned by milestones, not luck.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {unlocked.map((t) => {
          const on = s.equippedTitle?.key === t.key;
          return (
            <Panel key={t.key} brackets={on} className={`flex items-center gap-3 p-3 ${on ? 'border-accent/60' : ''}`}>
              <Award size={18} className="shrink-0 text-gold" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display font-bold tracking-wide">{t.name}</span>
                <span className="block truncate text-xs text-muted">{t.hint}</span>
              </span>
              <button onClick={() => equip(on ? null : t.key, t.name)} disabled={action.isPending}
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${on ? 'border-accent bg-accent/20 text-ink' : 'border-line text-ink2'}`}>
                {on ? 'Equipped' : 'Equip'}
              </button>
            </Panel>
          );
        })}
        {locked.map((t) => (
          <Panel key={t.key} brackets={false} className="flex items-center gap-3 p-3 opacity-70">
            <Lock size={16} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display font-bold tracking-wide text-ink2">{t.name}</span>
              <span className="block truncate text-xs text-muted">{t.hint}</span>
              <ProgressBar pct={t.cur / t.target} className="mt-1.5 h-1" />
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted">{t.cur.toLocaleString()}/{t.target.toLocaleString()}</span>
          </Panel>
        ))}
      </div>
    </>
  );
}
