import { randomBytes } from 'node:crypto';
import type { DB } from './db.ts';
import { getSetting, setSetting, tx } from './db.ts';
import { settleWorkoutDay, todayWorkout, workoutDayStats } from './workout.ts';
import {
  BOSS_MULTIPLIER, DAY_CLEAR_RATIO, DIFFICULTY_XP, MAX_LEVEL,
  addDays, attributeLevel, creditsFor, currentPause, isScheduled, parsePauses, pausedOn, levelFromXp, localDate, moodFor,
  FREE_REMOVE_MINUTES, nextRank, rankForLevel, streakMultiplier, weekStart, weeklyBossXp,
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
  /** Randomness source in [0, 1); injectable so tests can pin lootbox rolls. */
  rng?: () => number;
  /** Private habits are shown in full only when this is set (session unlocked with the password). */
  reveal?: boolean;
  /** When this session's private unlock expires (ISO), if unlocked. */
  privateUntil?: string | null;
}

/** What a locked private habit shows instead of its name (fixed length: no hint of the real one). */
export const PRIVATE_MASK = '• • • • • • • •';

/** Name, description and category of a habit or quest, hidden while it's private and this session is locked. */
export function maskTask(ctx: Ctx, t: Task) {
  const masked = !!t.private && !ctx.reveal;
  return {
    id: t.id, title: masked ? PRIVATE_MASK : t.title, description: masked ? '' : t.description,
    categoryId: masked ? null : t.category_id, categoryIds: masked ? [] : catIds(t),
    difficulty: t.difficulty, private: !!t.private, masked,
  };
}

export interface Profile {
  name: string;
  avatar: string | null;
  timezone: string;
  onboarded: number;
  my_state: string;
  height_cm: number | null;
  username: string;
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
  /** JSON array of category ids; category_id is its first entry. */
  category_ids: string;
  /** A date this habit is due even if `days` no longer includes it (its days changed that day). */
  kept_date: string | null;
  /** JSON Pause[]: days off the schedule (see planPause in the engine). */
  pauses: string;
  /** A raised difficulty waiting to start, and the day it starts (raises apply from tomorrow). */
  next_difficulty: Difficulty | null;
  next_difficulty_from: string | null;
  /** Habit reminder (HH:MM), sent on its days while it's undone. */
  reminder_time: string | null;
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
  /** For habits: the first day it counts (today, or tomorrow when created with "starts tomorrow"). */
  created_date: string;
  private: number;
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

export const today = (ctx: Ctx) => localDate(getProfile(ctx.db).timezone, ctx.at);

export function getTask(db: DB, id: number): Task {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as unknown as Task | undefined;
  if (!t) throw new HttpError(404, 'Task not found');
  return t;
}

/** Categories of a task, goal or XP event row. */
export const catIds = (row: { category_ids: string }): number[] => JSON.parse(row.category_ids);

/** One XP event: counts once toward your level, and in full toward every category it names. */
export function addXp(ctx: Ctx, date: string, amount: number, categories: number[] | number | null, source: string, sourceId: number | null, note = '') {
  const categoryIds = Array.isArray(categories) ? categories : categories === null ? [] : [categories];
  ctx.db.prepare('INSERT INTO xp_events (at, date, amount, category_id, category_ids, source, source_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(ctx.at.toISOString(), date, amount, categoryIds[0] ?? null, JSON.stringify(categoryIds), source, sourceId, note);
}

/** Each category's XP: its own floored ledger over every event that names it. */
export function attributeXp(db: DB): Map<number, number> {
  const totals = new Map<number, number>();
  for (const e of db.prepare("SELECT amount, category_ids FROM xp_events WHERE category_ids != '[]' ORDER BY id").all() as { amount: number; category_ids: string }[]) {
    for (const c of catIds(e)) totals.set(c, Math.max(0, (totals.get(c) ?? 0) + e.amount));
  }
  return totals;
}

export function addCurrency(ctx: Ctx, date: string, currency: 'credits' | 'gems', amount: number, source: string, sourceId: number | null, note = '') {
  ctx.db.prepare('INSERT INTO currency_events (at, date, currency, amount, source, source_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ctx.at.toISOString(), date, currency, amount, source, sourceId, note);
}

export function removeEvents(db: DB, source: string, sourceId: number) {
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

/**
 * Is the habit due on `date`? Only from its start day; then its weekdays, plus the day its weekdays were
 * changed (changes apply from tomorrow).
 */
export const habitDue = (h: Pick<Task, 'days' | 'kept_date' | 'created_date' | 'pauses'>, date: string) =>
  date >= h.created_date && (isScheduled(h.days, date) || h.kept_date === date) && !pausedOn(parsePauses(h.pauses), date);

/** A habit's difficulty on `date`: a raise counts from its start day, never for a day already under way. */
export const difficultyOn = (h: Pick<Task, 'difficulty' | 'next_difficulty' | 'next_difficulty_from'>, date: string): Difficulty =>
  h.next_difficulty && h.next_difficulty_from && date >= h.next_difficulty_from ? h.next_difficulty : h.difficulty;

/** A habit, quest or goal in its first FREE_REMOVE_MINUTES: mistakes can be fixed without penalty. */
export const isFresh = (createdAt: string, now: Date) => now.toISOString() < freeRemoveUntil(createdAt);

/** Consecutive completed scheduled days strictly before `date`. */
export function habitStreakBefore(db: DB, habit: Task, date: string): number {
  const logs = db.prepare('SELECT date, status FROM habit_logs WHERE task_id = ? AND date < ?').all(habit.id, date) as { date: string; status: string }[];
  const byDate = new Map(logs.map((l) => [l.date, l.status]));
  let streak = 0;
  for (let d = addDays(date, -1); d >= habit.created_date; d = addDays(d, -1)) {
    if (!habitDue(habit, d)) continue;
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
  addXp(ctx, date, xp, catIds(habit), 'habit', logId, note);
  if (status === 'done') addCurrency(ctx, date, 'credits', creditsFor(DIFFICULTY_XP[difficultyOn(habit, date)]), 'habit', logId, note);
}

function requireActiveHabit(ctx: Ctx, id: number): { habit: Task; date: string } {
  const habit = getTask(ctx.db, id);
  if (habit.kind !== 'habit' || habit.archived) throw new HttpError(404, 'Habit not found');
  const date = today(ctx);
  if (!habitDue(habit, date)) throw new HttpError(400, 'This habit is not scheduled today');
  if (getHabitLog(ctx.db, id, date)) throw new HttpError(409, 'Already resolved today');
  return { habit, date };
}

export function completeHabit(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const { habit, date } = requireActiveHabit(ctx, id);
    const streak = habitStreakBefore(ctx.db, habit, date) + 1;
    const xp = Math.round(DIFFICULTY_XP[difficultyOn(habit, date)] * streakMultiplier(streak));
    insertHabitLog(ctx, habit, date, 'done', xp, false);
  });
}

export function failHabit(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const { habit, date } = requireActiveHabit(ctx, id);
    insertHabitLog(ctx, habit, date, 'failed', -DIFFICULTY_XP[difficultyOn(habit, date)], false);
  });
}

/**
 * Delete (archive) a habit. If it's still due today and unresolved, today counts as failed first:
 * deleting isn't a way out of today's penalty. Free in its first hour (a mistake, not a dodge).
 */
export function archiveHabit(ctx: Ctx, habit: Task) {
  tx(ctx.db, () => {
    const date = today(ctx);
    if (!isFresh(habit.created_at, ctx.at) && habitDue(habit, date) && !getHabitLog(ctx.db, habit.id, date)) {
      insertHabitLog(ctx, habit, date, 'failed', -DIFFICULTY_XP[difficultyOn(habit, date)], false);
    }
    ctx.db.prepare('UPDATE tasks SET archived = 1 WHERE id = ?').run(habit.id);
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
  categoryIds: number[];
  difficulty: Difficulty;
  deadlineAt: string;
  boss: 'none' | 'boss' | 'weekly';
  /** Hidden behind the password, like a private habit. Every part of a chain shares it. */
  private: boolean;
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
      xpValue = weeklyBossXp(levelFromXp(totalXp(ctx.db)).need);
    }
    const date = today(ctx);
    const chainId = q.parts.length ? randomBytes(6).toString('hex') : null;
    const total = q.parts.length + 1;
    const ins = ctx.db.prepare(`INSERT INTO tasks
      (kind, title, description, category_id, category_ids, difficulty, status, deadline_at, chain_id, chain_index, chain_total, duration_hours, boss, xp_value, private, created_at, created_date)
      VALUES ('quest', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const cat = q.categoryIds[0] ?? null;
    const cats = JSON.stringify(q.categoryIds);
    const priv = q.private ? 1 : 0;
    const first = ins.run(q.title, q.description, cat, cats, q.difficulty, 'pending', q.deadlineAt,
      chainId, chainId ? 1 : null, chainId ? total : null, null, q.boss, xpValue, priv, ctx.at.toISOString(), date);
    // Later parts inherit category/difficulty/boss-ness of the chain.
    q.parts.forEach((p, i) => {
      ins.run(p.title, p.description, cat, cats, q.difficulty, 'locked', null,
        chainId, i + 2, total, p.durationHours, q.boss === 'weekly' ? 'none' : q.boss, null, priv, ctx.at.toISOString(), date);
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
    addXp(ctx, date, xp, catIds(q), 'quest', id, `Quest cleared: ${q.title}`);
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
  addXp(ctx, date, -questXp(q), catIds(q), 'quest', q.id, `${auto ? 'Quest expired' : 'Quest abandoned'}: ${q.title}`);
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
/** Until when a quest or goal can be removed for free (created + FREE_REMOVE_MINUTES). */
export const freeRemoveUntil = (createdAt: string) => new Date(Date.parse(createdAt) + FREE_REMOVE_MINUTES * 60_000).toISOString();

export function deleteQuest(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const q = requireQuest(ctx.db, id);
    if (q.status !== 'pending' && q.status !== 'locked') throw new HttpError(409, 'Resolved quests stay in history');
    if (ctx.at.toISOString() > freeRemoveUntil(q.created_at)) {
      throw new HttpError(409, `Free removal is only for the first ${FREE_REMOVE_MINUTES} minutes. Abandon it instead (−${questXp(q)} XP).`);
    }
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

    // Major goals past their deadline pay the penalty once and stay on the board.
    const lateGoals = ctx.db.prepare("SELECT id, title, xp, category_ids, deadline_at FROM goals WHERE status = 'active' AND past_due = 0 AND deadline_at <= ?")
      .all(ctx.at.toISOString()) as { id: number; title: string; xp: number; category_ids: string; deadline_at: string }[];
    for (const g of lateGoals) {
      addXp(ctx, localDate(profile.timezone, new Date(g.deadline_at)), -g.xp, catIds(g), 'goal_penalty', g.id, `Goal deadline missed: ${g.title}`);
      ctx.db.prepare('UPDATE goals SET past_due = 1 WHERE id = ?').run(g.id);
    }

    const todayStr = localDate(profile.timezone, ctx.at);
    const yesterday = addDays(todayStr, -1);
    const last = getSetting(ctx.db, 'last_settled_date');
    // Raises that have started become the habit's difficulty, once every day before them is settled.
    const promoteRaises = () => ctx.db.prepare(`UPDATE tasks SET difficulty = next_difficulty, next_difficulty = NULL, next_difficulty_from = NULL
      WHERE next_difficulty IS NOT NULL AND next_difficulty_from <= ?`).run(todayStr);
    if (!last) {
      // First run: nothing before today was ever tracked.
      setSetting(ctx.db, 'last_settled_date', yesterday);
      promoteRaises();
      return;
    }
    if (last >= yesterday) { promoteRaises(); return; }
    const habits = ctx.db.prepare("SELECT * FROM tasks WHERE kind = 'habit' AND archived = 0").all() as unknown as Task[];
    for (let d = addDays(last, 1); d <= yesterday; d = addDays(d, 1)) {
      settleWorkoutDay(ctx, d);
      for (const h of habits) {
        if (h.created_date > d || !habitDue(h, d)) continue;
        if (getHabitLog(ctx.db, h.id, d)) continue;
        insertHabitLog(ctx, h, d, 'failed', -DIFFICULTY_XP[difficultyOn(h, d)], true);
      }
    }
    setSetting(ctx.db, 'last_settled_date', yesterday);
    promoteRaises();
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
    if (!h.archived && habitDue(h, todayStr) && h.created_date <= todayStr && !loggedToday.has(h.id)) bump(todayStr, false);
  }
  // Scheduled workout days count like a task: done or missed, and today's if still open.
  for (const w of workoutDayStats(ctx.db)) bump(w.date, w.done);
  const tw = todayWorkout(ctx);
  if (tw && !tw.done) bump(todayStr, false);
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

/** Per-day completion stats, the global streak and today's numbers. */
export function dayProgress(ctx: Ctx, habits?: Task[]) {
  const tz = getProfile(ctx.db).timezone;
  const todayStr = localDate(tz, ctx.at);
  const allHabits = habits ?? (ctx.db.prepare("SELECT * FROM tasks WHERE kind = 'habit' AND archived = 0").all() as unknown as Task[]);
  const stats = dayStats(ctx, tz, todayStr, allHabits);
  const streak = globalStreak(stats, todayStr);
  const todayStat = stats.get(todayStr) ?? { total: 0, done: 0 };
  return { stats, streak, todayStat, cleared: cleared(todayStat) };
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
  const catTotals = attributeXp(db);
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
      ...maskTask(ctx, h),
      days: h.days, deadlineTime: h.deadline_time, reminderTime: h.reminder_time, scheduledToday: habitDue(h, todayStr),
      startsOn: h.created_date, freeEditUntil: freeRemoveUntil(h.created_at),
      pause: currentPause(parsePauses(h.pauses), todayStr), pausedToday: pausedOn(parsePauses(h.pauses), todayStr),
      log: log ? { status: log.status, xp: log.xp } : null,
      streak, multiplier: nextMultiplier,
      xpGain: Math.round(DIFFICULTY_XP[difficultyOn(h, todayStr)] * nextMultiplier), xpLoss: DIFFICULTY_XP[difficultyOn(h, todayStr)],
      nextDifficulty: h.next_difficulty && h.next_difficulty_from! > todayStr ? { difficulty: h.next_difficulty, from: h.next_difficulty_from! } : null,
    };
  });

  const questRows = db.prepare(`SELECT * FROM tasks WHERE kind = 'quest' AND (status = 'pending' OR (status IN ('done', 'failed') AND completed_at >= ?))
    ORDER BY deadline_at`).all(new Date(ctx.at.getTime() - 36 * 3600_000).toISOString()) as unknown as Task[];
  const quests = questRows
    .filter((q) => q.status === 'pending' || (q.completed_at && localDate(tz, new Date(q.completed_at)) === todayStr))
    .map((q) => ({
      ...maskTask(ctx, q),
      status: q.status, deadlineAt: q.deadline_at, completedAt: q.completed_at, boss: q.boss,
      chain: q.chain_id ? { index: q.chain_index!, total: q.chain_total! } : null,
      xp: questXp(q), credits: creditsFor(questXp(q)),
      canUndo: q.status !== 'pending' && !!q.deadline_at && new Date(q.deadline_at) > ctx.at,
      freeRemoveUntil: freeRemoveUntil(q.created_at),
    }));

  const { stats, streak, todayStat } = dayProgress(ctx, allHabits);
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
      name: profile.name, username: profile.username || profile.name, avatar: profile.avatar, timezone: tz, onboarded: !!profile.onboarded, myState: JSON.parse(profile.my_state),
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
    privateUntil: ctx.privateUntil ?? null,
  };
}

export type AppState = ReturnType<typeof buildState>;
