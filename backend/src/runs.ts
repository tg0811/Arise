import { tx, type DB } from './db.ts';
import { HttpError, addCurrency, addXp, removeEvents, today, type Ctx } from './game.ts';
import { bodyCategory } from './workout.ts';
import { RUN_FASTEST_SEC_PER_KM, RUN_MIN_KM, RUN_XP, creditsFor, paceSeconds, toKm, type RunUnit } from '../../shared/engine.ts';

// Runs: recorded in the Instant Dungeon, separate from workout sessions. A run is logged for today (no back-dating).
// The first run of the day of at least RUN_MIN_KM pays RUN_XP Body XP (+ credits); more runs that day are history only,
// so the XP can't be farmed by splitting one run into many. A run can be removed the same day (typo fix).

interface RunRow { id: number; date: string; at: string; distance: number; unit: RunUnit; seconds: number; note: string }

export interface RunInput { distance: number; unit: RunUnit; seconds: number; note: string }

const paid = (db: DB, id: number) =>
  !!db.prepare("SELECT 1 FROM xp_events WHERE source = 'run' AND source_id = ?").get(id);

const fmtDistance = (r: { distance: number; unit: RunUnit }) => `${Math.round(r.distance * 100) / 100} ${r.unit}`;

/** Give the day's XP to its first qualifying run, if no run that day has it yet. */
function award(ctx: Ctx, date: string) {
  const runs = ctx.db.prepare('SELECT * FROM runs WHERE date = ? ORDER BY at, id').all(date) as unknown as RunRow[];
  if (runs.some((r) => paid(ctx.db, r.id))) return;
  const r = runs.find((x) => toKm(x.distance, x.unit) >= RUN_MIN_KM);
  if (!r) return;
  const label = `Run: ${fmtDistance(r)}`;
  addXp(ctx, date, RUN_XP, bodyCategory(ctx.db), 'run', r.id, label);
  addCurrency(ctx, date, 'credits', creditsFor(RUN_XP), 'run', r.id, label);
}

export function logRun(ctx: Ctx, r: RunInput): number {
  const km = toKm(r.distance, r.unit);
  if (r.seconds / km < RUN_FASTEST_SEC_PER_KM) throw new HttpError(400, 'That pace is faster than the world record: check the distance and time');
  const date = today(ctx);
  let id = 0;
  tx(ctx.db, () => {
    id = Number(ctx.db.prepare('INSERT INTO runs (date, at, distance, unit, seconds, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(date, ctx.at.toISOString(), r.distance, r.unit, r.seconds, r.note).lastInsertRowid);
    award(ctx, date);
  });
  return id;
}

export function removeRun(ctx: Ctx, id: number) {
  const r = ctx.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as unknown as RunRow | undefined;
  if (!r) throw new HttpError(404, 'Run not found');
  if (r.date !== today(ctx)) throw new HttpError(409, 'Only today\'s runs can be removed');
  tx(ctx.db, () => {
    removeEvents(ctx.db, 'run', id);
    ctx.db.prepare('DELETE FROM runs WHERE id = ?').run(id);
    award(ctx, r.date); // the XP moves to another qualifying run today, if there is one
  });
}

export function runsState(ctx: Ctx) {
  const rows = ctx.db.prepare('SELECT * FROM runs ORDER BY date DESC, at DESC, id DESC').all() as unknown as RunRow[];
  const list = rows.map((r) => ({
    id: r.id, date: r.date, at: r.at, distance: r.distance, unit: r.unit, seconds: r.seconds, note: r.note,
    km: toKm(r.distance, r.unit),
    pace: paceSeconds(r.distance, r.seconds), // per km or per mile, in the run's own unit
    xp: paid(ctx.db, r.id) ? RUN_XP : 0,
  }));
  const totalKm = list.reduce((t, r) => t + r.km, 0);
  const counted = list.filter((r) => r.km >= RUN_MIN_KM);
  return {
    unit: (rows[0]?.unit ?? 'km') as RunUnit, // the last unit used, as the default for the next one
    list,
    totalKm,
    longestKm: Math.max(0, ...list.map((r) => r.km)),
    // Best pace only from runs long enough to count, in seconds per km
    bestPaceKm: counted.length ? Math.min(...counted.map((r) => r.seconds / r.km)) : null,
  };
}
