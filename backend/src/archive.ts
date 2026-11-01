import { PRIVATE_MASK, buildState, catIds, dayProgress, habitDue, getProfile, habitStreakBefore, type Ctx, type Task } from './game.ts';
import { habitBestStreak, milestones } from './titles.ts';
import { addDays, localDate } from '../../shared/engine.ts';

// The Archive: a read-only record of everything that happened.
// Heavier than the live state, so it's fetched on demand (GET /api/archive), not on every mutation.

const HEAT_DAYS = 28;
const HISTORY_DAYS = 14;

export interface HistoryEvent {
  at: string;
  kind: 'xp' | 'purchase';
  amount: number;
  currency?: 'credits' | 'gems';
  categoryIds: number[];
  source: string;
  note: string;
}

export function archiveState(ctx: Ctx, historyBefore?: string) {
  const { db } = ctx;
  const tz = getProfile(db).timezone;
  const today = localDate(tz, ctx.at);
  const core = buildState(ctx);
  const m = milestones(ctx);
  const { stats } = dayProgress(ctx);

  // ---- per-day numbers (completion from dayProgress, XP split from the ledger)
  const xpByDay = new Map((db.prepare(`SELECT date, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS gained,
    SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS lost FROM xp_events GROUP BY date`).all() as { date: string; gained: number; lost: number }[])
    .map((r) => [r.date, r]));
  const day = (date: string) => {
    const s = stats.get(date) ?? { total: 0, done: 0 };
    const x = xpByDay.get(date);
    return { date, total: s.total, done: s.done, gained: x?.gained ?? 0, lost: x?.lost ?? 0 };
  };
  const lastDays = (n: number) => Array.from({ length: n }, (_, i) => day(addDays(today, i - n + 1)));

  // ---- overview
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const failed = n("SELECT COUNT(*) AS n FROM habit_logs WHERE status = 'failed'") + n("SELECT COUNT(*) AS n FROM tasks WHERE kind = 'quest' AND status = 'failed'");
  const activeDates = [...stats.entries()].filter(([, s]) => s.total > 0).map(([d]) => d).sort();
  const overview = {
    tasksDone: m.tasksDone,
    tasksFailed: failed,
    completionRate: m.tasksDone + failed ? m.tasksDone / (m.tasksDone + failed) : null,
    questsCleared: n("SELECT COUNT(*) AS n FROM tasks WHERE kind = 'quest' AND status = 'done'"),
    bossesSlain: m.bossesSlain,
    goalsConquered: m.goalsConquered,
    payloadsOpened: m.payloadsOpened,
    reviews: m.reviews,
    itemsRedeemed: n('SELECT COUNT(*) AS n FROM inventory WHERE used_at IS NOT NULL'),
    creditsEarned: n("SELECT COALESCE(SUM(amount), 0) AS n FROM currency_events WHERE currency = 'credits' AND amount > 0"),
    firstDay: activeDates[0] ?? null,
    daysActive: activeDates.length,
    currentStreak: core.streak.current,
    bestStreak: core.streak.best,
  };

  // ---- history: ledger events grouped by day, newest first, paged by HISTORY_DAYS
  const end = historyBefore ?? addDays(today, 1);
  const start = addDays(end, -HISTORY_DAYS);
  const xpEvents = db.prepare('SELECT at, date, amount, category_ids, source, source_id, note FROM xp_events WHERE date >= ? AND date < ? ORDER BY id DESC')
    .all(start, end) as { at: string; date: string; amount: number; category_ids: string; source: string; source_id: number | null; note: string }[];
  const purchases = db.prepare("SELECT at, date, amount, currency, note FROM currency_events WHERE source = 'store' AND date >= ? AND date < ? ORDER BY id DESC")
    .all(start, end) as { at: string; date: string; amount: number; currency: 'credits' | 'gems'; note: string }[];
  // Ledger notes name the habit or quest ("Completed: X"); mask the ones that belong to locked private ones.
  // Habit events point at a habit_logs row, quest events at the quest itself.
  const ids = (sql: string) => (ctx.reveal ? new Set<number>() : new Set((db.prepare(sql).all() as { id: number }[]).map((r) => r.id)));
  const privateLogIds = ids('SELECT l.id FROM habit_logs l JOIN tasks t ON t.id = l.task_id WHERE t.private = 1');
  const privateQuestIds = ids("SELECT id FROM tasks WHERE kind = 'quest' AND private = 1");
  const maskNote = (e: { source: string; source_id: number | null; note: string }) =>
    e.source_id !== null && ((e.source === 'habit' && privateLogIds.has(e.source_id)) || (e.source === 'quest' && privateQuestIds.has(e.source_id)))
      ? `${e.note.split(':')[0]}: ${PRIVATE_MASK}` : e.note;
  const byDate = new Map<string, HistoryEvent[]>();
  const push = (date: string, e: HistoryEvent) => byDate.set(date, [...(byDate.get(date) ?? []), e]);
  for (const e of xpEvents) {
    const hidden = maskNote(e) !== e.note;
    push(e.date, { at: e.at, kind: 'xp', amount: e.amount, categoryIds: hidden ? [] : catIds(e), source: e.source, note: maskNote(e) });
  }
  for (const p of purchases) push(p.date, { at: p.at, kind: 'purchase', amount: p.amount, currency: p.currency, categoryIds: [], source: 'store', note: p.note });
  const history = [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, events]) => ({ ...day(date), events: events.sort((a, b) => b.at.localeCompare(a.at)) }));
  const older = db.prepare('SELECT 1 FROM xp_events WHERE date < ? UNION SELECT 1 FROM currency_events WHERE date < ? LIMIT 1').get(start, start);

  // ---- per-habit streaks and a 28-day strip
  const habits = db.prepare("SELECT * FROM tasks WHERE kind = 'habit' AND archived = 0 ORDER BY sort, id").all() as unknown as Task[];
  const logs = db.prepare('SELECT task_id, date, status FROM habit_logs').all() as { task_id: number; date: string; status: string }[];
  const habitStreaks = habits.map((h) => {
    const mine = logs.filter((l) => l.task_id === h.id);
    const status = new Map(mine.map((l) => [l.date, l.status]));
    const done = mine.filter((l) => l.status === 'done').length;
    const todayDone = status.get(today) === 'done';
    const masked = !!h.private && !ctx.reveal;
    return {
      id: h.id, title: masked ? PRIVATE_MASK : h.title, categoryIds: masked ? [] : catIds(h), difficulty: h.difficulty, days: h.days,
      private: !!h.private, masked,
      current: habitStreakBefore(db, h, today) + (todayDone ? 1 : 0),
      best: habitBestStreak(h, mine),
      done, failed: mine.length - done,
      rate: mine.length ? done / mine.length : null,
      strip: Array.from({ length: HEAT_DAYS }, (_, i) => {
        const d = addDays(today, i - HEAT_DAYS + 1);
        if (d < h.created_date) return 'none';
        if (!habitDue(h, d)) return 'rest';
        return (status.get(d) as 'done' | 'failed' | undefined) ?? (d === today ? 'pending' : 'none');
      }),
    };
  });

  return {
    today,
    overview,
    heatmap: lastDays(HEAT_DAYS),
    week: lastDays(7),
    history,
    historyNext: older ? start : null,
    habitStreaks,
  };
}

export type ArchiveState = ReturnType<typeof archiveState>;
