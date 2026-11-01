import { useState, type ReactNode } from 'react';
import { CheckCircle2, Swords, Flame, Skull, Trophy, Coins, Gem, ShoppingBag, Sparkles, XCircle, ScrollText, Gift, Loader2, Lock, LockOpen } from 'lucide-react';
import { useArchive, type AppState, type Archive as ArchiveData, type DayStat, type HabitStreak, type HistoryEvent } from '../lib/api';
import { DIFFICULTY_STYLE } from '../lib/theme';
import { formatDate, formatDay } from '../lib/time';
import { Heatmap, WeekXpChart } from '../components/charts';
import { CategoryIcon, Panel, SectionTitle, Tabs } from '../components/ui';

type Tab = 'overview' | 'history' | 'streaks';

export function Archive({ s }: { s: AppState }) {
  const [tab, setTab] = useState<Tab>('overview');
  const q = useArchive();
  const first = q.data?.pages[0];

  return (
    <div className="pt-2">
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'History' }, { id: 'streaks', label: 'Streaks' }]} />
      {!first ? (
        <div className="flex justify-center py-16 text-muted">{q.error ? <span className="text-bad">{(q.error as Error).message}</span> : <Loader2 className="animate-spin" />}</div>
      ) : tab === 'overview' ? (
        <Overview s={s} a={first} />
      ) : tab === 'history' ? (
        <History s={s} days={q.data!.pages.flatMap((p) => p.history)} more={q.hasNextPage} loading={q.isFetchingNextPage} onMore={() => q.fetchNextPage()} />
      ) : (
        <Streaks s={s} habits={first.habitStreaks} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- overview

function Tile({ icon, label, value, sub }: { icon: ReactNode; label: string; value: ReactNode; sub?: string }) {
  return (
    <Panel brackets={false} className="p-3.5">
      <div className="flex items-center gap-2 text-ink2">{icon}<span className="text-xs font-semibold">{label}</span></div>
      <div className="mt-1.5 text-2xl font-bold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </Panel>
  );
}

function Overview({ s, a }: { s: AppState; a: ArchiveData }) {
  const o = a.overview;
  const rate = o.completionRate === null ? '—' : `${Math.round(o.completionRate * 100)}%`;
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<CheckCircle2 size={16} className="text-accent" />} label="Tasks completed" value={o.tasksDone.toLocaleString()} sub={`${rate} success · ${o.tasksFailed} failed`} />
        <Tile icon={<Sparkles size={16} className="text-accent" />} label="Total XP" value={s.progress.totalXp.toLocaleString()} sub={`Level ${s.progress.level} · ${s.progress.rank}-rank`} />
        <Tile icon={<Flame size={16} className="text-gold" />} label="Daily streak" value={`${o.currentStreak}d`} sub={`Best ${o.bestStreak}d`} />
        <Tile icon={<Skull size={16} className="text-accent" />} label="Bosses defeated" value={o.bossesSlain} sub={`${o.goalsConquered} goals conquered`} />
      </div>

      <SectionTitle>Last 28 days</SectionTitle>
      <Panel className="p-4"><Heatmap days={a.heatmap} /></Panel>

      <SectionTitle>XP this week</SectionTitle>
      <Panel className="p-4"><WeekXpChart days={a.week} /></Panel>

      <SectionTitle>Record</SectionTitle>
      <Panel brackets={false} className="divide-y divide-line">
        {[
          ['Days active', o.daysActive, o.firstDay ? `since ${formatDate(o.firstDay)}` : ''],
          ['Quests cleared', o.questsCleared, ''],
          ['Goals conquered', o.goalsConquered, ''],
          ['Payloads opened', o.payloadsOpened, ''],
          ['Reviews written', o.reviews, ''],
          ['Credits earned (all time)', o.creditsEarned.toLocaleString(), ''],
          ['Rewards redeemed', o.itemsRedeemed, ''],
          ['Titles unlocked', `${s.titles.filter((t) => t.unlocked).length} / ${s.titles.length}`, ''],
        ].map(([label, value, sub]) => (
          <div key={label as string} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-ink2">{label}{sub && <span className="ml-1.5 text-xs text-muted">{sub}</span>}</span>
            <span className="font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- history

function eventIcon(e: HistoryEvent) {
  if (e.kind === 'purchase') return <ShoppingBag size={14} className="text-ink2" />;
  if (e.source === 'lootbox') return <Gift size={14} className="text-gold" />;
  if (e.source === 'journal') return <ScrollText size={14} className="text-ink2" />;
  if (e.source === 'goal' || e.source === 'goal_penalty') return <Trophy size={14} className="text-ink2" />;
  if (e.source === 'quest') return <Swords size={14} className="text-ink2" />;
  return e.amount >= 0 ? <CheckCircle2 size={14} className="text-good" /> : <XCircle size={14} className="text-bad" />;
}

function History({ s, days, more, loading, onMore }: {
  s: AppState; days: (DayStat & { events: HistoryEvent[] })[]; more: boolean; loading: boolean; onMore: () => void;
}) {
  if (days.length === 0) return <p className="py-12 text-center text-sm text-muted">Nothing recorded yet. Complete a task and it lands here.</p>;
  return (
    <div className="mt-4 space-y-3">
      {days.map((d) => (
        <Panel key={d.date} brackets={false} className="p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="font-display text-base font-bold tracking-wider">
              {formatDay(d.date, 'long')}
            </span>
            <span className="shrink-0 text-xs text-ink2">
              {d.total > 0 && <>{d.done}/{d.total} · </>}
              {d.gained > 0 && <span className="text-good">+{d.gained}</span>} {d.lost > 0 && <span className="text-bad">−{d.lost}</span>}
            </span>
          </div>
          <ul className="space-y-1.5">
            {d.events.map((e, i) => {
              const cats = e.categoryIds.map((id) => s.categories.find((c) => c.id === id)).filter((c) => !!c);
              return (
                <li key={i} className="flex items-center gap-2.5 text-sm">
                  {eventIcon(e)}
                  <span className="min-w-0 flex-1 truncate text-ink2">{e.note || e.source}</span>
                  {cats.map((cat) => <span key={cat.id} style={{ color: cat.color }} title={cat.name}><CategoryIcon name={cat.icon} size={12} /></span>)}
                  <span className={`shrink-0 font-semibold tabular-nums ${e.kind === 'purchase' ? 'text-ink2' : e.amount >= 0 ? 'text-good' : 'text-bad'}`}>
                    {e.kind === 'purchase'
                      ? <span className="inline-flex items-center gap-1">{e.amount}{e.currency === 'gems' ? <Gem size={11} /> : <Coins size={11} />}</span>
                      : `${e.amount >= 0 ? '+' : ''}${e.amount} XP`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}
      {more && (
        <button onClick={onMore} disabled={loading} className="w-full rounded-xl border border-line py-2.5 text-sm font-bold text-ink2 hover:text-ink">
          {loading ? 'Loading…' : 'Load older days'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- streaks

const STRIP: Record<HabitStreak['strip'][number], { color: string; label: string }> = {
  done: { color: 'var(--color-good)', label: 'Done' },
  failed: { color: 'var(--color-bad)', label: 'Failed' },
  pending: { color: 'var(--sl-accent)', label: 'Today, open' },
  rest: { color: 'transparent', label: 'Rest day' },
  none: { color: 'transparent', label: 'Not tracked' },
};

function Streaks({ s, habits }: { s: AppState; habits: HabitStreak[] }) {
  if (habits.length === 0) return <p className="py-12 text-center text-sm text-muted">No habits yet.</p>;
  return (
    <div className="mt-4 space-y-3">
      {habits.map((h) => {
        const cats = h.categoryIds.map((id) => s.categories.find((c) => c.id === id)).filter((c) => !!c);
        return (
          <Panel key={h.id} brackets={false} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                  {cats.map((cat) => <span key={cat.id} className="inline-flex items-center gap-1" style={{ color: cat.color }}><CategoryIcon name={cat.icon} size={11} /> {cat.name}</span>)}
                  <span style={{ color: DIFFICULTY_STYLE[h.difficulty].color }}>{DIFFICULTY_STYLE[h.difficulty].label}</span>
                </div>
                <h3 className={`mt-1 flex items-center gap-1.5 truncate font-bold ${h.masked ? 'tracking-widest text-ink2' : ''}`}>
                  {h.private && (h.masked ? <Lock size={13} className="shrink-0 text-muted" /> : <LockOpen size={13} className="shrink-0 text-accent" />)}{h.title}
                </h3>
              </div>
              <div className="flex shrink-0 gap-4 text-center">
                <div><div className="flex items-center gap-1 text-lg font-bold"><Flame size={15} className="text-gold" />{h.current}</div><div className="text-[10px] text-muted">current</div></div>
                <div><div className="text-lg font-bold">{h.best}</div><div className="text-[10px] text-muted">best</div></div>
                <div><div className="text-lg font-bold">{h.rate === null ? '—' : `${Math.round(h.rate * 100)}%`}</div><div className="text-[10px] text-muted">success</div></div>
              </div>
            </div>
            <div className="mt-3 grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(28, minmax(0, 1fr))' }} role="img" aria-label={`Last 28 days of ${h.title}`}>
              {h.strip.map((st, i) => (
                <span key={i} title={STRIP[st].label} className="h-4 rounded-[3px]"
                  style={{ background: STRIP[st].color, border: st === 'rest' ? '1px dashed var(--sl-line)' : st === 'none' ? '1px solid transparent' : undefined, opacity: st === 'none' ? 0.3 : 1 }} />
              ))}
            </div>
          </Panel>
        );
      })}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[11px] text-ink2">
        {(['done', 'failed', 'pending', 'rest'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: STRIP[k].color, border: k === 'rest' ? '1px dashed var(--sl-line)' : undefined }} />
            {STRIP[k].label}
          </span>
        ))}
        <span className="text-muted">· last 28 days, oldest on the left</span>
      </div>
    </div>
  );
}
