import { getSetting, seedWorkoutDays, setSetting, tx, type DB } from './db.ts';
import { HttpError, addCurrency, addXp, getProfile, removeEvents, today, type Ctx } from './game.ts';
import { WORKOUT_XP, addDays, creditsFor, e1rm, weekStart, weekday, type ExerciseKind } from '../../shared/engine.ts';

// The Gate: a Mon–Sun workout plan, logged sessions (sets × reps × kg), PRs and a weekly streak.
// Scheduled workout days move Body XP like a Hard habit (gain = loss); extra sessions are log-only.

const SINCE_KEY = 'workout_schedule_since';

interface DayRow { weekday: number; name: string; is_rest: number }
interface ItemRow { id: number; weekday: number; exercise_id: number; sort: number; target_sets: number; target_reps: number | null; target_kg: number | null; target_min: number | null }
interface SessionRow { id: number; date: string; title: string; scheduled: number; started_at: string | null; finished_at: string | null; status: 'active' | 'done' | 'missed'; note: string }
interface SetRow { id: number; session_id: number; exercise_id: number; sort: number; set_no: number; reps: number | null; kg: number | null; seconds: number | null; km: number | null; done: number }
interface ExerciseRow { id: number; name: string; kind: ExerciseKind; muscle: string; archived: number }

// ---------------------------------------------------------------- plan

function days(db: DB): DayRow[] {
  seedWorkoutDays(db); // older backups may predate the weekday rows
  return db.prepare('SELECT * FROM workout_days ORDER BY weekday').all() as unknown as DayRow[];
}

const items = (db: DB, wd?: number) =>
  (wd === undefined
    ? db.prepare('SELECT * FROM workout_plan_items ORDER BY weekday, sort, id').all()
    : db.prepare('SELECT * FROM workout_plan_items WHERE weekday = ? ORDER BY sort, id').all(wd)) as unknown as ItemRow[];

/** A weekday is a workout day when it's not marked rest and has at least one exercise planned. */
export function plannedDay(db: DB, date: string): { name: string; items: ItemRow[] } | null {
  const wd = weekday(date);
  const day = days(db).find((d) => d.weekday === wd)!;
  if (day.is_rest) return null;
  const its = items(db, wd);
  return its.length ? { name: day.name, items: its } : null;
}

/** Days before the plan was first saved are never penalised. */
const scheduleSince = (db: DB) => getSetting(db, SINCE_KEY);

function touchPlan(ctx: Ctx) {
  if (!scheduleSince(ctx.db)) setSetting(ctx.db, SINCE_KEY, today(ctx));
}

export function updateDay(ctx: Ctx, wd: number, d: { name: string; isRest: boolean }) {
  days(ctx.db);
  ctx.db.prepare('UPDATE workout_days SET name = ?, is_rest = ? WHERE weekday = ?').run(d.name, d.isRest ? 1 : 0, wd);
  touchPlan(ctx);
}

export interface PlanItemInput { exerciseId: number; targetSets: number; targetReps: number | null; targetKg: number | null; targetMin: number | null }

export function addPlanItem(ctx: Ctx, wd: number, i: PlanItemInput) {
  getExercise(ctx.db, i.exerciseId);
  const { m } = ctx.db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM workout_plan_items WHERE weekday = ?').get(wd) as { m: number };
  ctx.db.prepare('INSERT INTO workout_plan_items (weekday, exercise_id, sort, target_sets, target_reps, target_kg, target_min) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(wd, i.exerciseId, m + 1, i.targetSets, i.targetReps, i.targetKg, i.targetMin);
  // Adding an exercise to a day makes it a workout day.
  ctx.db.prepare('UPDATE workout_days SET is_rest = 0 WHERE weekday = ?').run(wd);
  touchPlan(ctx);
}

export function updatePlanItem(ctx: Ctx, id: number, i: Omit<PlanItemInput, 'exerciseId'>) {
  const res = ctx.db.prepare('UPDATE workout_plan_items SET target_sets = ?, target_reps = ?, target_kg = ?, target_min = ? WHERE id = ?')
    .run(i.targetSets, i.targetReps, i.targetKg, i.targetMin, id);
  if (!res.changes) throw new HttpError(404, 'Plan item not found');
}

export function removePlanItem(ctx: Ctx, id: number) {
  ctx.db.prepare('DELETE FROM workout_plan_items WHERE id = ?').run(id);
}

export function reorderPlanItems(ctx: Ctx, wd: number, ids: number[]) {
  tx(ctx.db, () => ids.forEach((id, i) => ctx.db.prepare('UPDATE workout_plan_items SET sort = ? WHERE id = ? AND weekday = ?').run(i, id, wd)));
}

// ---------------------------------------------------------------- exercise library

function getExercise(db: DB, id: number): ExerciseRow {
  const e = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id) as unknown as ExerciseRow | undefined;
  if (!e) throw new HttpError(404, 'Exercise not found');
  return e;
}

export function createExercise(ctx: Ctx, e: { name: string; kind: ExerciseKind; muscle: string }): number {
  const res = ctx.db.prepare('INSERT INTO exercises (name, kind, muscle, created_at) VALUES (?, ?, ?, ?)').run(e.name, e.kind, e.muscle, ctx.at.toISOString());
  return Number(res.lastInsertRowid);
}

export function updateExercise(ctx: Ctx, id: number, e: { name: string; kind: ExerciseKind; muscle: string }) {
  getExercise(ctx.db, id);
  ctx.db.prepare('UPDATE exercises SET name = ?, kind = ?, muscle = ? WHERE id = ?').run(e.name, e.kind, e.muscle, id);
}

/** Archived, never deleted: logged sets keep pointing at it. Also leaves the plan. */
export function archiveExercise(ctx: Ctx, id: number) {
  getExercise(ctx.db, id);
  tx(ctx.db, () => {
    ctx.db.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(id);
    ctx.db.prepare('DELETE FROM workout_plan_items WHERE exercise_id = ?').run(id);
  });
}

// ---------------------------------------------------------------- sessions

const sessionFor = (db: DB, date: string) =>
  db.prepare('SELECT * FROM workout_sessions WHERE date = ?').get(date) as unknown as SessionRow | undefined;

const sessionSets = (db: DB, sessionId: number) =>
  db.prepare('SELECT * FROM workout_sets WHERE session_id = ? ORDER BY sort, exercise_id, set_no').all(sessionId) as unknown as SetRow[];

/** The last finished values for an exercise (to pre-fill), else null. */
function lastSets(db: DB, exerciseId: number, beforeDate: string): SetRow[] {
  const s = db.prepare(`SELECT ws.session_id FROM workout_sets ws JOIN workout_sessions s ON s.id = ws.session_id
    WHERE ws.exercise_id = ? AND ws.done = 1 AND s.date < ? ORDER BY s.date DESC LIMIT 1`).get(exerciseId, beforeDate) as { session_id: number } | undefined;
  if (!s) return [];
  return db.prepare('SELECT * FROM workout_sets WHERE session_id = ? AND exercise_id = ? AND done = 1 ORDER BY set_no').all(s.session_id, exerciseId) as unknown as SetRow[];
}

function insertSets(ctx: Ctx, sessionId: number, exerciseId: number, sort: number, count: number, target: Partial<ItemRow> | null, date: string) {
  const prev = lastSets(ctx.db, exerciseId, date);
  const ins = ctx.db.prepare('INSERT INTO workout_sets (session_id, exercise_id, sort, set_no, reps, kg, seconds, km) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (let n = 1; n <= count; n++) {
    // Pre-fill: same set from last time, else the last set from last time, else the plan's target.
    const p = prev[n - 1] ?? prev[prev.length - 1];
    ins.run(sessionId, exerciseId, sort, n,
      p?.reps ?? target?.target_reps ?? null,
      p?.kg ?? target?.target_kg ?? null,
      p?.seconds ?? (target?.target_min ? Math.round(target.target_min * 60) : null),
      p?.km ?? null);
  }
}

/** Start today's session from the plan (or an empty extra session on a rest day). */
export function startSession(ctx: Ctx) {
  tx(ctx.db, () => {
    const date = today(ctx);
    const existing = sessionFor(ctx.db, date);
    if (existing) throw new HttpError(409, existing.status === 'done' ? 'Today\'s workout is already done' : 'A session is already running');
    const plan = plannedDay(ctx.db, date);
    const res = ctx.db.prepare("INSERT INTO workout_sessions (date, title, scheduled, started_at, status) VALUES (?, ?, ?, ?, 'active')")
      .run(date, plan ? plan.name || 'Workout' : 'Extra session', plan ? 1 : 0, ctx.at.toISOString());
    const sid = Number(res.lastInsertRowid);
    plan?.items.forEach((it, i) => insertSets(ctx, sid, it.exercise_id, i, Math.max(1, it.target_sets), it, date));
  });
}

const activeSession = (ctx: Ctx) => {
  const s = sessionFor(ctx.db, today(ctx));
  if (!s || s.status !== 'active') throw new HttpError(404, 'No workout running');
  return s;
};

export function addExerciseToSession(ctx: Ctx, exerciseId: number) {
  const s = activeSession(ctx);
  getExercise(ctx.db, exerciseId);
  const { m } = ctx.db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM workout_sets WHERE session_id = ?').get(s.id) as { m: number };
  insertSets(ctx, s.id, exerciseId, m + 1, 1, null, s.date);
}

export function addSet(ctx: Ctx, exerciseId: number) {
  const s = activeSession(ctx);
  const last = ctx.db.prepare('SELECT * FROM workout_sets WHERE session_id = ? AND exercise_id = ? ORDER BY set_no DESC LIMIT 1').get(s.id, exerciseId) as unknown as SetRow | undefined;
  if (!last) throw new HttpError(404, 'Exercise is not in this session');
  ctx.db.prepare('INSERT INTO workout_sets (session_id, exercise_id, sort, set_no, reps, kg, seconds, km) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(s.id, exerciseId, last.sort, last.set_no + 1, last.reps, last.kg, last.seconds, last.km);
}

export function updateSet(ctx: Ctx, id: number, v: { reps: number | null; kg: number | null; seconds: number | null; km: number | null; done?: boolean }) {
  const s = activeSession(ctx);
  const res = v.done === undefined
    ? ctx.db.prepare('UPDATE workout_sets SET reps = ?, kg = ?, seconds = ?, km = ? WHERE id = ? AND session_id = ?')
      .run(v.reps, v.kg, v.seconds, v.km, id, s.id)
    : ctx.db.prepare('UPDATE workout_sets SET reps = ?, kg = ?, seconds = ?, km = ?, done = ? WHERE id = ? AND session_id = ?')
      .run(v.reps, v.kg, v.seconds, v.km, v.done ? 1 : 0, id, s.id);
  if (!res.changes) throw new HttpError(404, 'Set not found');
}

export function removeSet(ctx: Ctx, id: number) {
  const s = activeSession(ctx);
  ctx.db.prepare('DELETE FROM workout_sets WHERE id = ? AND session_id = ?').run(id, s.id);
}

/** Throw away today's unfinished session (no XP either way). */
export function discardSession(ctx: Ctx) {
  const s = activeSession(ctx);
  tx(ctx.db, () => {
    ctx.db.prepare('DELETE FROM workout_sets WHERE session_id = ?').run(s.id);
    ctx.db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(s.id);
  });
}

const bodyCategory = (db: DB) =>
  (db.prepare("SELECT id FROM categories WHERE archived = 0 AND lower(name) = 'body'").get() as { id: number } | undefined)?.id ?? null;

export function finishSession(ctx: Ctx, note = '') {
  tx(ctx.db, () => {
    const s = activeSession(ctx);
    const doneSets = (ctx.db.prepare('SELECT COUNT(*) AS n FROM workout_sets WHERE session_id = ? AND done = 1').get(s.id) as { n: number }).n;
    if (!doneSets) throw new HttpError(400, 'Tick at least one set before finishing');
    ctx.db.prepare("UPDATE workout_sessions SET status = 'done', finished_at = ?, note = ? WHERE id = ?").run(ctx.at.toISOString(), note, s.id);
    if (s.scheduled) {
      const label = `Workout: ${s.title}`;
      addXp(ctx, s.date, WORKOUT_XP, bodyCategory(ctx.db), 'workout', s.id, label);
      addCurrency(ctx, s.date, 'credits', creditsFor(WORKOUT_XP), 'workout', s.id, label);
    }
  });
}

/** Re-open today's finished workout (mis-tap); its XP is removed until finished again. */
export function undoFinish(ctx: Ctx) {
  const s = sessionFor(ctx.db, today(ctx));
  if (!s || s.status !== 'done') throw new HttpError(409, 'Nothing to undo today');
  tx(ctx.db, () => {
    removeEvents(ctx.db, 'workout', s.id);
    ctx.db.prepare("UPDATE workout_sessions SET status = 'active', finished_at = NULL WHERE id = ?").run(s.id);
  });
}

// ---------------------------------------------------------------- settlement (called from settle())

/** A scheduled workout day that ended without a finished session is missed: −XP, recorded. */
export function settleWorkoutDay(ctx: Ctx, date: string) {
  const since = scheduleSince(ctx.db);
  if (!since || date < since) return;
  const plan = plannedDay(ctx.db, date);
  const s = sessionFor(ctx.db, date);
  if (s?.status === 'done' || s?.status === 'missed') return;
  if (s && !s.scheduled) {
    // An unfinished extra session just lapses.
    ctx.db.prepare('DELETE FROM workout_sets WHERE session_id = ?').run(s.id);
    ctx.db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(s.id);
    return;
  }
  if (!plan && !s) return;
  let id: number;
  if (s) {
    ctx.db.prepare("UPDATE workout_sessions SET status = 'missed' WHERE id = ?").run(s.id);
    id = s.id;
  } else {
    id = Number(ctx.db.prepare("INSERT INTO workout_sessions (date, title, scheduled, status) VALUES (?, ?, 1, 'missed')").run(date, plan!.name || 'Workout').lastInsertRowid);
  }
  addXp(ctx, date, -WORKOUT_XP, bodyCategory(ctx.db), 'workout_miss', id, `Workout missed: ${plan?.name || s?.title || 'Workout'}`);
}

/** Today's workout for the daily clear and reminders: null when today isn't a workout day. */
export function todayWorkout(ctx: Ctx): { name: string; done: boolean; total: number; completed: number } | null {
  const date = today(ctx);
  const plan = plannedDay(ctx.db, date);
  const since = scheduleSince(ctx.db);
  if (!plan || !since || date < since) return null;
  const s = sessionFor(ctx.db, date);
  const sets = s ? sessionSets(ctx.db, s.id) : [];
  const exIds = [...new Set(sets.map((x) => x.exercise_id))];
  const completed = exIds.filter((e) => sets.filter((x) => x.exercise_id === e).every((x) => x.done)).length;
  return { name: plan.name || 'Workout', done: s?.status === 'done', total: s ? exIds.length : plan.items.length, completed: s ? completed : 0 };
}

/** Per-date workout results for the daily-clear stats (scheduled days only). */
export function workoutDayStats(db: DB): { date: string; done: boolean }[] {
  return (db.prepare("SELECT date, status FROM workout_sessions WHERE scheduled = 1 AND status IN ('done', 'missed')").all() as { date: string; status: string }[])
    .map((r) => ({ date: r.date, done: r.status === 'done' }));
}

// ---------------------------------------------------------------- streak & PRs

type WeekStatus = 'complete' | 'broken' | 'none' | 'open';

/** Strict weekly streak: a week counts only if every scheduled workout day in it was done. */
export function weekStreak(ctx: Ctx) {
  const date = today(ctx);
  const rows = ctx.db.prepare('SELECT date, status FROM workout_sessions WHERE scheduled = 1').all() as { date: string; status: string }[];
  const byWeek = new Map<string, string[]>();
  for (const r of rows) byWeek.set(weekStart(r.date), [...(byWeek.get(weekStart(r.date)) ?? []), r.status]);

  const thisWeek = weekStart(date);
  // Does the rest of this week still have planned workout days after today (or today, if not done)?
  const pendingThisWeek = () => {
    for (let d = date; d < addDays(thisWeek, 7); d = addDays(d, 1)) {
      if (plannedDay(ctx.db, d) && sessionFor(ctx.db, d)?.status !== 'done') return true;
    }
    return false;
  };
  const statusOf = (wk: string): WeekStatus => {
    const st = byWeek.get(wk) ?? [];
    if (st.includes('missed')) return 'broken';
    if (wk === thisWeek) return pendingThisWeek() ? 'open' : st.includes('done') ? 'complete' : 'none';
    return st.includes('done') ? 'complete' : 'none';
  };

  const firstWeek = [...byWeek.keys()].sort()[0] ?? thisWeek;
  const weeks: { start: string; status: WeekStatus }[] = [];
  for (let wk = firstWeek; wk <= thisWeek; wk = addDays(wk, 7)) weeks.push({ start: wk, status: statusOf(wk) });

  let current = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    if (w.status === 'broken') break;
    if (w.status === 'complete') current++;
  }
  let best = 0;
  let run = 0;
  for (const w of weeks) {
    if (w.status === 'broken') run = 0;
    else if (w.status === 'complete') run++;
    best = Math.max(best, run);
  }
  return { current, best, weeks: weeks.slice(-12) };
}

interface Prs { kg: number; e1rm: number; reps: number; seconds: number; km: number }

function prsFor(sets: SetRow[]): Prs {
  const p: Prs = { kg: 0, e1rm: 0, reps: 0, seconds: 0, km: 0 };
  for (const s of sets) {
    p.kg = Math.max(p.kg, s.kg ?? 0);
    p.e1rm = Math.max(p.e1rm, e1rm(s.kg ?? 0, s.reps ?? 0));
    p.reps = Math.max(p.reps, s.reps ?? 0);
    p.seconds = Math.max(p.seconds, s.seconds ?? 0);
    p.km = Math.max(p.km, s.km ?? 0);
  }
  return p;
}

// ---------------------------------------------------------------- state

const setView = (s: SetRow) => ({ id: s.id, setNo: s.set_no, reps: s.reps, kg: s.kg, seconds: s.seconds, km: s.km, done: !!s.done });

export function gateState(ctx: Ctx) {
  const { db } = ctx;
  const tz = getProfile(db).timezone;
  const date = today(ctx);
  const since = scheduleSince(db);
  const exercises = db.prepare('SELECT * FROM exercises ORDER BY archived, name').all() as unknown as ExerciseRow[];
  const exName = new Map(exercises.map((e) => [e.id, e]));

  // Plan (Mon-first for display)
  const allItems = items(db);
  const plan = [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const d = days(db).find((x) => x.weekday === wd)!;
    const its = allItems.filter((i) => i.weekday === wd).map((i) => ({
      id: i.id, exerciseId: i.exercise_id, name: exName.get(i.exercise_id)?.name ?? '?', kind: exName.get(i.exercise_id)?.kind ?? 'strength',
      targetSets: i.target_sets, targetReps: i.target_reps, targetKg: i.target_kg, targetMin: i.target_min,
    }));
    return { weekday: wd, name: d.name, isRest: !!d.is_rest, scheduled: !d.is_rest && its.length > 0, items: its };
  });

  // This week, Mon → Sun
  const wk = weekStart(date);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(wk, i);
    const s = sessionFor(db, d);
    const planned = plannedDay(db, d);
    let status: 'done' | 'missed' | 'planned' | 'rest' | 'active' | 'extra';
    if (s?.status === 'done') status = s.scheduled ? 'done' : 'extra';
    else if (s?.status === 'missed') status = 'missed';
    else if (s?.status === 'active') status = 'active';
    else status = planned ? 'planned' : 'rest';
    return { date: d, name: planned?.name ?? '', status, isToday: d === date };
  });

  // Today's session (active or done)
  const s = sessionFor(db, date);
  let session = null;
  if (s && s.status !== 'missed') {
    const sets = sessionSets(db, s.id);
    const groups: { exerciseId: number; name: string; kind: ExerciseKind; sets: ReturnType<typeof setView>[]; previous: ReturnType<typeof setView>[] }[] = [];
    for (const st of sets) {
      let g = groups.find((x) => x.exerciseId === st.exercise_id);
      if (!g) {
        const e = exName.get(st.exercise_id);
        g = { exerciseId: st.exercise_id, name: e?.name ?? '?', kind: e?.kind ?? 'strength', sets: [], previous: lastSets(db, st.exercise_id, s.date).map(setView) };
        groups.push(g);
      }
      g.sets.push(setView(st));
    }
    session = { id: s.id, title: s.title, scheduled: !!s.scheduled, status: s.status, startedAt: s.started_at, finishedAt: s.finished_at, note: s.note, exercises: groups };
  }

  // History (newest first) with volume and per-session PR count
  const sessions = db.prepare('SELECT * FROM workout_sessions ORDER BY date DESC LIMIT 120').all() as unknown as SessionRow[];
  const allDone = db.prepare(`SELECT ws.*, s.date FROM workout_sets ws JOIN workout_sessions s ON s.id = ws.session_id
    WHERE ws.done = 1 ORDER BY s.date, ws.id`).all() as unknown as (SetRow & { date: string })[];
  const history = sessions.map((x) => {
    const sets = allDone.filter((d) => d.session_id === x.id);
    let prCount = 0;
    for (const exId of new Set(sets.map((d) => d.exercise_id))) {
      const before = prsFor(allDone.filter((d) => d.exercise_id === exId && d.date < x.date));
      const now = prsFor(sets.filter((d) => d.exercise_id === exId));
      if ((before.kg || before.e1rm || before.reps || before.seconds || before.km) &&
        (now.kg > before.kg || now.e1rm > before.e1rm || now.reps > before.reps || now.seconds > before.seconds || now.km > before.km)) prCount++;
    }
    const minutes = x.started_at && x.finished_at ? Math.round((Date.parse(x.finished_at) - Date.parse(x.started_at)) / 60_000) : null;
    return {
      id: x.id, date: x.date, title: x.title, status: x.status, scheduled: !!x.scheduled, minutes, note: x.note,
      sets: sets.length, volume: Math.round(sets.reduce((v, d) => v + (d.kg ?? 0) * (d.reps ?? 0), 0)), prs: prCount,
      exercises: [...new Set(sets.map((d) => d.exercise_id))].map((exId) => ({
        name: exName.get(exId)?.name ?? '?',
        sets: sets.filter((d) => d.exercise_id === exId).map(setView),
      })),
    };
  });

  // Library with PRs and a per-session progress series
  const library = exercises.map((e) => {
    const sets = allDone.filter((d) => d.exercise_id === e.id);
    const byDate = new Map<string, typeof sets>();
    for (const d of sets) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d]);
    return {
      id: e.id, name: e.name, kind: e.kind, muscle: e.muscle, archived: !!e.archived,
      prs: prsFor(sets),
      sessions: byDate.size,
      series: [...byDate.entries()].map(([d, ss]) => ({ date: d, ...prsFor(ss) })),
    };
  });

  const streak = weekStreak(ctx);
  return {
    today: date,
    timezone: tz,
    scheduleSince: since,
    plan,
    week,
    todayPlan: plan.find((p) => p.weekday === weekday(date))!,
    session,
    history,
    exercises: library,
    streak,
    workoutsDone: (db.prepare("SELECT COUNT(*) AS n FROM workout_sessions WHERE status = 'done'").get() as { n: number }).n,
  };
}
