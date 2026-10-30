import { randomBytes } from 'node:crypto';
import type { DB } from './db.ts';
import { getSetting, setSetting, tx } from './db.ts';
import {
  BOSS_MULTIPLIER, DAY_CLEAR_RATIO, DIFFICULTY_XP, MAX_LEVEL, WEEKLY_BOSS_SHARE,
  addDays, attributeLevel, creditsFor, isScheduled, levelFromXp, localDate, moodFor,
  nextRank, rankForLevel, streakMultiplier, weekStart,
  type Difficulty,
} from '../../shared/engine.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Everything that mutates game state gets the db and "now" (injectable for tests). */
export interface Ctx {
  db: DB;
  at: Date;
}

export interface Profile {
  name: string;
  avatar: string | null;
  timezone: string;
  onboarded: number;
  my_state: string;
  height_cm: number | null;
}

export function currentWeight(db: DB): number | null {
  const row = db.prepare('SELECT kg FROM weight_logs ORDER BY date DESC LIMIT 1').get() as { kg: number } | undefined;
  return row?.kg ?? null;
}

/** Record today's weigh-in (re-weighing the same day overwrites it). */
export function logWeight(ctx: Ctx, kg: number) {
  ctx.db.prepare('INSERT INTO weight_logs (date, kg, at) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET kg = excluded.kg, at = excluded.at')
    .run(today(ctx), kg, ctx.at.toISOString());
}

export interface Task {
  id: number;
  kind: 'habit' | 'quest';
  title: string;
  description: string;
  category_id: number | null;
  difficulty: Difficulty;
  days: string;
  deadline_time: string | null;
  status: 'pending' | 'locked' | 'done' | 'failed' | 'cancelled';
  deadline_at: string | null;
  completed_at: string | null;
  chain_id: string | null;
  chain_index: number | null;
  chain_total: number | null;
  duration_hours: number | null;
  boss: 'none' | 'boss' | 'weekly';
  xp_value: number | null;
  archived: number;
  sort: number;
  created_at: string;
  created_date: string;
}

interface HabitLog {
  id: number;
  task_id: number;
  date: string;
  status: 'done' | 'failed';
  xp: number;
}

// ---------------------------------------------------------------- helpers

export const getProfile = (db: DB) => db.prepare('SELECT * FROM profile WHERE id = 1').get() as unknown as Profile;

const today = (ctx: Ctx) => localDate(getProfile(ctx.db).timezone, ctx.at);

export function getTask(db: DB, id: number): Task {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as unknown as Task | undefined;
  if (!t) throw new HttpError(404, 'Task not found');
  return t;
}

function addXp(ctx: Ctx, date: string, amount: number, categoryId: number | null, source: string, sourceId: number | null, note = '') {
  ctx.db.prepare('INSERT INTO xp_events (at, date, amount, category_id, source, source_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ctx.at.toISOString(), date, amount, categoryId, source, sourceId, note);
}

function addCurrency(ctx: Ctx, date: string, currency: 'credits' | 'gems', amount: number, source: string, sourceId: number | null, note = '') {
  ctx.db.prepare('INSERT INTO currency_events (at, date, currency, amount, source, source_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ctx.at.toISOString(), date, currency, amount, source, sourceId, note);
}

function removeEvents(db: DB, source: string, sourceId: number) {
  db.prepare('DELETE FROM xp_events WHERE source = ? AND source_id = ?').run(source, sourceId);
  db.prepare('DELETE FROM currency_events WHERE source = ? AND source_id = ?').run(source, sourceId);
}

/** Sum a ledger in order, never letting the running total drop below zero. */
function flooredSum(amounts: number[]): number {
  let total = 0;
  for (const a of amounts) total = Math.max(0, total + a);
  return total;
}

export function totalXp(db: DB): number {
  const rows = db.prepare('SELECT amount FROM xp_events ORDER BY id').all() as { amount: number }[];
  return flooredSum(rows.map((r) => r.amount));
}

// ---------------------------------------------------------------- habits

/** Consecutive completed scheduled days strictly before `date`. */
export function habitStreakBefore(db: DB, habit: Task, date: string): number {
  const logs = db.prepare('SELECT date, status FROM habit_logs WHERE task_id = ? AND date < ?').all(habit.id, date) as { date: string; status: string }[];
  const byDate = new Map(logs.map((l) => [l.date, l.status]));
  let streak = 0;
  for (let d = addDays(date, -1); d >= habit.created_date; d = addDays(d, -1)) {
    if (!isScheduled(habit.days, d)) continue;
    if (byDate.get(d) !== 'done') break;
    streak++;
  }
  return streak;
}

function getHabitLog(db: DB, taskId: number, date: string): HabitLog | undefined {
  return db.prepare('SELECT * FROM habit_logs WHERE task_id = ? AND date = ?').get(taskId, date) as unknown as HabitLog | undefined;
}

function insertHabitLog(ctx: Ctx, habit: Task, date: string, status: 'done' | 'failed', xp: number, auto: boolean) {
  const res = ctx.db.prepare('INSERT INTO habit_logs (task_id, date, status, xp, auto, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(habit.id, date, status, xp, auto ? 1 : 0, ctx.at.toISOString());
  const logId = Number(res.lastInsertRowid);
  const note = `${status === 'done' ? 'Completed' : auto ? 'Missed' : 'Failed'}: ${habit.title}`;
  addXp(ctx, date, xp, habit.category_id, 'habit', logId, note);
  if (status === 'done') addCurrency(ctx, date, 'credits', creditsFor(DIFFICULTY_XP[habit.difficulty]), 'habit', logId, note);
}

function requireActiveHabit(ctx: Ctx, id: number): { habit: Task; date: string } {
  const habit = getTask(ctx.db, id);
  if (habit.kind !== 'habit' || habit.archived) throw new HttpError(404, 'Habit not found');
  const date = today(ctx);
  if (!isScheduled(habit.days, date)) throw new HttpError(400, 'This habit is not scheduled today');
  if (getHabitLog(ctx.db, id, date)) throw new HttpError(409, 'Already resolved today');
  return { habit, date };
}

export function completeHabit(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const { habit, date } = requireActiveHabit(ctx, id);
    const streak = habitStreakBefore(ctx.db, habit, date) + 1;
    const xp = Math.round(DIFFICULTY_XP[habit.difficulty] * streakMultiplier(streak));
    insertHabitLog(ctx, habit, date, 'done', xp, false);
  });
}

export function failHabit(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const { habit, date } = requireActiveHabit(ctx, id);
    insertHabitLog(ctx, habit, date, 'failed', -DIFFICULTY_XP[habit.difficulty], false);
  });
}

/** Undo today's completion/failure (mis-taps happen). Past days are final. */
export function undoHabit(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const log = getHabitLog(ctx.db, id, today(ctx));
    if (!log) throw new HttpError(404, 'Nothing to undo today');
    removeEvents(ctx.db, 'habit', log.id);
    ctx.db.prepare('DELETE FROM habit_logs WHERE id = ?').run(log.id);
  });
}

// ---------------------------------------------------------------- quests

export const questXp = (q: Pick<Task, 'xp_value' | 'difficulty' | 'boss'>) =>
  q.xp_value ?? DIFFICULTY_XP[q.difficulty] * (q.boss === 'boss' ? BOSS_MULTIPLIER : 1);

export interface NewQuest {
  title: string;
  description: string;
  categoryId: number | null;
  difficulty: Difficulty;
  deadlineAt: string;
  boss: 'none' | 'boss' | 'weekly';
  /** Follow-up chain parts, unlocked one by one; each gets `durationHours` once unlocked. */
  parts: { title: string; description: string; durationHours: number }[];
}

export function weeklyBossAvailable(ctx: Ctx): boolean {
  const row = ctx.db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE kind = 'quest' AND boss = 'weekly' AND created_date >= ?")
    .get(weekStart(today(ctx))) as { n: number };
  return row.n === 0;
}

export function createQuest(ctx: Ctx, q: NewQuest): number {
  return tx(ctx.db, () => {
    if (new Date(q.deadlineAt) <= ctx.at) throw new HttpError(400, 'Deadline must be in the future');
    let xpValue: number | null = null;
    if (q.boss === 'weekly') {
      if (!weeklyBossAvailable(ctx)) throw new HttpError(409, 'This week already has a Mega Boss');
      // Frozen at creation so later level changes don't move the goalposts.
      xpValue = Math.max(50, Math.round((levelFromXp(totalXp(ctx.db)).need * WEEKLY_BOSS_SHARE) / 10) * 10);
    }
    const date = today(ctx);
    const chainId = q.parts.length ? randomBytes(6).toString('hex') : null;
    const total = q.parts.length + 1;
    const ins = ctx.db.prepare(`INSERT INTO tasks
      (kind, title, description, category_id, difficulty, status, deadline_at, chain_id, chain_index, chain_total, duration_hours, boss, xp_value, created_at, created_date)
      VALUES ('quest', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const first = ins.run(q.title, q.description, q.categoryId, q.difficulty, 'pending', q.deadlineAt,
      chainId, chainId ? 1 : null, chainId ? total : null, null, q.boss, xpValue, ctx.at.toISOString(), date);
    // Later parts inherit category/difficulty/boss-ness of the chain.
    q.parts.forEach((p, i) => {
      ins.run(p.title, p.description, q.categoryId, q.difficulty, 'locked', null,
        chainId, i + 2, total, p.durationHours, q.boss === 'weekly' ? 'none' : q.boss, null, ctx.at.toISOString(), date);
    });
    return Number(first.lastInsertRowid);
  });
}

function requireQuest(db: DB, id: number): Task {
  const q = getTask(db, id);
  if (q.kind !== 'quest') throw new HttpError(404, 'Quest not found');
  return q;
}

function nextChainPart(db: DB, q: Task): Task | undefined {
  if (!q.chain_id) return undefined;
  return db.prepare('SELECT * FROM tasks WHERE chain_id = ? AND chain_index = ?').get(q.chain_id, (q.chain_index ?? 0) + 1) as unknown as Task | undefined;
}

export function completeQuest(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const q = requireQuest(ctx.db, id);
    if (q.status !== 'pending') throw new HttpError(409, 'Quest is not active');
    const date = today(ctx);
    const xp = questXp(q);
    ctx.db.prepare("UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?").run(ctx.at.toISOString(), id);
    addXp(ctx, date, xp, q.category_id, 'quest', id, `Quest cleared: ${q.title}`);
    addCurrency(ctx, date, 'credits', creditsFor(xp), 'quest', id, `Quest cleared: ${q.title}`);
    const next = nextChainPart(ctx.db, q);
    if (next && next.status === 'locked') {
      const deadline = new Date(ctx.at.getTime() + (next.duration_hours ?? 24) * 3600_000);
      ctx.db.prepare("UPDATE tasks SET status = 'pending', deadline_at = ? WHERE id = ?").run(deadline.toISOString(), next.id);
    }
  });
}

function failQuestInner(ctx: Ctx, q: Task, auto: boolean) {
  const tz = getProfile(ctx.db).timezone;
  // A missed deadline is charged to the day it was due; a give-up to today.
  const date = auto && q.deadline_at ? localDate(tz, new Date(q.deadline_at)) : localDate(tz, ctx.at);
  ctx.db.prepare("UPDATE tasks SET status = 'failed', completed_at = ? WHERE id = ?").run(ctx.at.toISOString(), q.id);
  addXp(ctx, date, -questXp(q), q.category_id, 'quest', q.id, `${auto ? 'Quest expired' : 'Quest abandoned'}: ${q.title}`);
  if (q.chain_id) {
    ctx.db.prepare("UPDATE tasks SET status = 'cancelled' WHERE chain_id = ? AND chain_index > ? AND status = 'locked'").run(q.chain_id, q.chain_index);
  }
}

export function failQuest(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const q = requireQuest(ctx.db, id);
    if (q.status !== 'pending') throw new HttpError(409, 'Quest is not active');
    failQuestInner(ctx, q, false);
  });
}

/** Undo a quest resolved today, as long as its deadline hasn't passed. */
export function undoQuest(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const q = requireQuest(ctx.db, id);
    const tz = getProfile(ctx.db).timezone;
    if (q.status !== 'done' && q.status !== 'failed') throw new HttpError(409, 'Nothing to undo');
    if (!q.completed_at || localDate(tz, new Date(q.completed_at)) !== localDate(tz, ctx.at)) throw new HttpError(409, 'Only today can be undone');
    if (q.deadline_at && new Date(q.deadline_at) <= ctx.at) throw new HttpError(409, 'Deadline has passed');
    removeEvents(ctx.db, 'quest', id);
    ctx.db.prepare("UPDATE tasks SET status = 'pending', completed_at = NULL WHERE id = ?").run(id);
    if (!q.chain_id) return;
    if (q.status === 'done') {
      const next = nextChainPart(ctx.db, q);
      if (next && next.status === 'pending') {
        ctx.db.prepare("UPDATE tasks SET status = 'locked', deadline_at = NULL WHERE id = ?").run(next.id);
      }
    } else {
      ctx.db.prepare("UPDATE tasks SET status = 'locked' WHERE chain_id = ? AND chain_index > ? AND status = 'cancelled'").run(q.chain_id, q.chain_index);
    }
  });
}

/** Remove an unresolved quest (and its locked follow-ups) without penalty. */
export function deleteQuest(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const q = requireQuest(ctx.db, id);
    if (q.status !== 'pending' && q.status !== 'locked') throw new HttpError(409, 'Resolved quests stay in history');
    ctx.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    if (q.chain_id) {
      ctx.db.prepare("DELETE FROM tasks WHERE chain_id = ? AND chain_index > ? AND status = 'locked'").run(q.chain_id, q.chain_index);
    }
  });
}

// ---------------------------------------------------------------- settlement

/**
 * Resolve everything whose time has run out. Idempotent — runs on every request
 * and on a timer, so the result is the same whether the app was open or not.
 *   - pending quests past their deadline → failed (penalty on the day they were due)
 *   - every unresolved scheduled habit on each fully elapsed day → failed
 */
export function settle(ctx: Ctx) {
  const profile = getProfile(ctx.db);
  if (!profile.onboarded) return;
  tx(ctx.db, () => {
    const expired = ctx.db.prepare("SELECT * FROM tasks WHERE kind = 'quest' AND status = 'pending' AND deadline_at <= ?")
      .all(ctx.at.toISOString()) as unknown as Task[];
    for (const q of expired) failQuestInner(ctx, q, true);

    const todayStr = localDate(profile.timezone, ctx.at);
    const yesterday = addDays(todayStr, -1);
    const last = getSetting(ctx.db, 'last_settled_date');
    if (!last) {
      // First run: nothing before today was ever tracked.
      setSetting(ctx.db, 'last_settled_date', yesterday);
      return;
    }
    if (last >= yesterday) return;
    const habits = ctx.db.prepare("SELECT * FROM tasks WHERE kind = 'habit' AND archived = 0").all() as unknown as Task[];
    for (let d = addDays(last, 1); d <= yesterday; d = addDays(d, 1)) {
      for (const h of habits) {
        if (h.created_date > d || !isScheduled(h.days, d)) continue;
        if (getHabitLog(ctx.db, h.id, d)) continue;
        insertHabitLog(ctx, h, d, 'failed', -DIFFICULTY_XP[h.difficulty], true);
      }
    }
    setSetting(ctx.db, 'last_settled_date', yesterday);
  });
}

// ---------------------------------------------------------------- state

interface DayStat { total: number; done: number }

/** Per-day completion counts across habits and quests, used by streak and mood. */
function dayStats(ctx: Ctx, tz: string, todayStr: string, habits: Task[]): Map<string, DayStat> {
  const stats = new Map<string, DayStat>();
  const bump = (date: string, done: boolean) => {
    const s = stats.get(date) ?? { total: 0, done: 0 };
    s.total++;
    if (done) s.done++;
    stats.set(date, s);
  };
  const logs = ctx.db.prepare('SELECT task_id, date, status FROM habit_logs').all() as { task_id: number; date: string; status: string }[];
  const loggedToday = new Set<number>();
  for (const l of logs) {
    bump(l.date, l.status === 'done');
    if (l.date === todayStr) loggedToday.add(l.task_id);
  }
  for (const h of habits) {
    if (!h.archived && isScheduled(h.days, todayStr) && h.created_date <= todayStr && !loggedToday.has(h.id)) bump(todayStr, false);
  }
  const quests = ctx.db.prepare("SELECT status, deadline_at, completed_at FROM tasks WHERE kind = 'quest' AND status IN ('pending', 'done', 'failed')")
    .all() as { status: string; deadline_at: string | null; completed_at: string | null }[];
  for (const q of quests) {
    if (q.status === 'done' && q.completed_at) bump(localDate(tz, new Date(q.completed_at)), true);
    else if (q.status === 'failed' && q.deadline_at) bump(localDate(tz, new Date(q.deadline_at)), false);
    else if (q.status === 'pending' && q.deadline_at && localDate(tz, new Date(q.deadline_at)) === todayStr) bump(todayStr, false);
  }
  return stats;
}

const cleared = (s: DayStat | undefined) => !!s && s.total > 0 && s.done / s.total >= DAY_CLEAR_RATIO;

function globalStreak(stats: Map<string, DayStat>, todayStr: string) {
  const dates = [...stats.keys()].sort();
  const first = dates[0] ?? todayStr;
  // Current: walk back from yesterday; empty days are neutral, an uncleared day ends it.
  let current = 0;
  for (let d = addDays(todayStr, -1); d >= first; d = addDays(d, -1)) {
    const s = stats.get(d);
    if (!s || s.total === 0) continue;
    if (!cleared(s)) break;
    current++;
  }
  if (cleared(stats.get(todayStr))) current++;
  let best = 0;
  let run = 0;
  for (let d = first; d <= todayStr; d = addDays(d, 1)) {
    const s = stats.get(d);
    if (!s || s.total === 0) continue;
    run = cleared(s) ? run + 1 : d === todayStr ? run : 0;
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current) };
}

export function buildState(ctx: Ctx) {
  const { db } = ctx;
  const profile = getProfile(db);
  const tz = profile.timezone;
  const todayStr = localDate(tz, ctx.at);

  const xp = totalXp(db);
  const lvl = levelFromXp(xp);
  const rank = rankForLevel(lvl.level);
  const nr = nextRank(rank.rank);

  // Attributes: each category's own floored ledger.
  const evs = db.prepare('SELECT amount, category_id FROM xp_events WHERE category_id IS NOT NULL ORDER BY id').all() as { amount: number; category_id: number }[];
  const catTotals = new Map<number, number>();
  for (const e of evs) catTotals.set(e.category_id, Math.max(0, (catTotals.get(e.category_id) ?? 0) + e.amount));
  const categories = (db.prepare('SELECT * FROM categories WHERE archived = 0 ORDER BY sort, id').all() as any[]).map((c) => {
    const cxp = catTotals.get(c.id) ?? 0;
    return { id: c.id, name: c.name, color: c.color, icon: c.icon, sort: c.sort, xp: cxp, ...attributeLevel(cxp) };
  });

  const wallet = { credits: 0, gems: 0 };
  for (const r of db.prepare('SELECT currency, SUM(amount) AS total FROM currency_events GROUP BY currency').all() as { currency: 'credits' | 'gems'; total: number }[]) {
    wallet[r.currency] = r.total;
  }

  const allHabits = db.prepare("SELECT * FROM tasks WHERE kind = 'habit' AND archived = 0 ORDER BY sort, id").all() as unknown as Task[];
  const todayLogs = new Map((db.prepare('SELECT * FROM habit_logs WHERE date = ?').all(todayStr) as unknown as HabitLog[]).map((l) => [l.task_id, l]));
  const habits = allHabits.map((h) => {
    const log = todayLogs.get(h.id) ?? null;
    const before = habitStreakBefore(db, h, todayStr);
    const streak = log?.status === 'done' ? before + 1 : before;
    const nextMultiplier = streakMultiplier(before + 1);
    return {
      id: h.id, title: h.title, description: h.description, categoryId: h.category_id, difficulty: h.difficulty,
      days: h.days, deadlineTime: h.deadline_time, scheduledToday: isScheduled(h.days, todayStr),
      log: log ? { status: log.status, xp: log.xp } : null,
      streak, multiplier: nextMultiplier,
      xpGain: Math.round(DIFFICULTY_XP[h.difficulty] * nextMultiplier), xpLoss: DIFFICULTY_XP[h.difficulty],
    };
  });

  const questRows = db.prepare(`SELECT * FROM tasks WHERE kind = 'quest' AND (status = 'pending' OR (status IN ('done', 'failed') AND completed_at >= ?))
    ORDER BY deadline_at`).all(new Date(ctx.at.getTime() - 36 * 3600_000).toISOString()) as unknown as Task[];
  const quests = questRows
    .filter((q) => q.status === 'pending' || (q.completed_at && localDate(tz, new Date(q.completed_at)) === todayStr))
    .map((q) => ({
      id: q.id, title: q.title, description: q.description, categoryId: q.category_id, difficulty: q.difficulty,
      status: q.status, deadlineAt: q.deadline_at, completedAt: q.completed_at, boss: q.boss,
      chain: q.chain_id ? { index: q.chain_index!, total: q.chain_total! } : null,
      xp: questXp(q), credits: creditsFor(questXp(q)),
      canUndo: q.status !== 'pending' && !!q.deadline_at && new Date(q.deadline_at) > ctx.at,
    }));

  const stats = dayStats(ctx, tz, todayStr, allHabits);
  const streak = globalStreak(stats, todayStr);
  const todayStat = stats.get(todayStr) ?? { total: 0, done: 0 };
  let weekTotal = 0;
  let weekDone = 0;
  for (let i = 1; i <= 7; i++) {
    const s = stats.get(addDays(todayStr, -i));
    if (s) { weekTotal += s.total; weekDone += s.done; }
  }

  return {
    now: ctx.at.toISOString(),
    today: todayStr,
    profile: {
      name: profile.name, avatar: profile.avatar, timezone: tz, onboarded: !!profile.onboarded, myState: JSON.parse(profile.my_state),
      heightCm: profile.height_cm, weightKg: currentWeight(db),
    },
    progress: {
      totalXp: xp, level: lvl.level, into: lvl.into, need: lvl.need, pct: lvl.pct, maxLevel: MAX_LEVEL,
      rank: rank.rank, title: rank.title, nextRank: nr,
    },
    wallet,
    streak: {
      current: streak.current, best: streak.best,
      today: { ...todayStat, ratio: todayStat.total ? todayStat.done / todayStat.total : 0, cleared: cleared(todayStat) },
    },
    mood: moodFor(weekTotal ? weekDone / weekTotal : null),
    categories,
    habits,
    quests,
    weeklyBossAvailable: weeklyBossAvailable(ctx),
  };
}

export type AppState = ReturnType<typeof buildState>;
