import { tx } from './db.ts';
import { HttpError, addCurrency, addXp, catIds, freeRemoveUntil, getProfile, removeEvents, today, type Ctx } from './game.ts';
import { creditsFor, goalReward, localDate, type GoalType } from '../../shared/engine.ts';

// Major Goals: long-horizon "bosses" (exams, projects, events).
// Reward XP on time; the same XP is lost once if the deadline passes (settle() in game.ts),
// and the goal stays on the board — finishing late still earns GOAL_LATE_SHARE of the reward.

export interface Goal {
  id: number;
  title: string;
  description: string;
  type: GoalType;
  category_id: number | null;
  category_ids: string;
  deadline_at: string;
  xp: number;
  status: 'active' | 'done';
  past_due: number;
  completed_at: string | null;
  created_at: string;
}

export interface GoalInput {
  title: string;
  description: string;
  type: GoalType;
  categoryIds: number[];
  deadlineAt: string;
  xp: number;
}

function getGoal(ctx: Ctx, id: number): Goal {
  const g = ctx.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as unknown as Goal | undefined;
  if (!g) throw new HttpError(404, 'Goal not found');
  return g;
}

export function createGoal(ctx: Ctx, g: GoalInput) {
  if (new Date(g.deadlineAt) <= ctx.at) throw new HttpError(400, 'Deadline must be in the future');
  ctx.db.prepare('INSERT INTO goals (title, description, type, category_id, category_ids, deadline_at, xp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(g.title, g.description, g.type, g.categoryIds[0] ?? null, JSON.stringify(g.categoryIds), g.deadlineAt, g.xp, ctx.at.toISOString());
}

export function updateGoal(ctx: Ctx, id: number, g: GoalInput) {
  const cur = getGoal(ctx, id);
  if (cur.status !== 'active') throw new HttpError(409, 'Completed goals are final');
  // Stakes are set once, and a deadline can only move earlier (never pushed back to dodge the penalty).
  if (g.xp !== cur.xp) throw new HttpError(409, "A goal's stakes are locked once set");
  const moved = Date.parse(g.deadlineAt) !== Date.parse(cur.deadline_at);
  if (moved && cur.past_due) throw new HttpError(409, 'Deadline passed: it is locked');
  if (moved && Date.parse(g.deadlineAt) > Date.parse(cur.deadline_at)) throw new HttpError(409, "A goal's deadline can only move earlier");
  if (moved && new Date(g.deadlineAt) <= ctx.at) throw new HttpError(400, 'Deadline must be in the future');
  ctx.db.prepare('UPDATE goals SET title = ?, description = ?, type = ?, category_id = ?, category_ids = ?, deadline_at = ?, xp = ? WHERE id = ?')
    .run(g.title, g.description, g.type, g.categoryIds[0] ?? null, JSON.stringify(g.categoryIds), g.deadlineAt, g.xp, id);
}

/**
 * Remove an active goal. Free within FREE_REMOVE_MINUTES of setting it, or once its penalty is already paid;
 * otherwise removing it costs the stake, like abandoning a quest.
 */
export function deleteGoal(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const g = getGoal(ctx, id);
    if (g.status !== 'active') throw new HttpError(409, 'Conquered goals stay in history');
    if (!g.past_due && ctx.at.toISOString() > freeRemoveUntil(g.created_at)) {
      addXp(ctx, today(ctx), -g.xp, catIds(g), 'goal_penalty', g.id, `Goal abandoned: ${g.title}`);
    }
    ctx.db.prepare('UPDATE journal SET goal_id = NULL WHERE goal_id = ?').run(id);
    ctx.db.prepare('DELETE FROM goals WHERE id = ?').run(id);
  });
}

export function completeGoal(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const g = getGoal(ctx, id);
    if (g.status !== 'active') throw new HttpError(409, 'Already conquered');
    const xp = goalReward(g.xp, !!g.past_due);
    const date = today(ctx);
    const note = `Goal conquered${g.past_due ? ' (late)' : ''}: ${g.title}`;
    ctx.db.prepare("UPDATE goals SET status = 'done', completed_at = ? WHERE id = ?").run(ctx.at.toISOString(), id);
    addXp(ctx, date, xp, catIds(g), 'goal', id, note);
    addCurrency(ctx, date, 'credits', creditsFor(xp), 'goal', id, note);
  });
}

/** Undo a conquest made today (mis-tap). */
export function undoGoal(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const g = getGoal(ctx, id);
    const tz = getProfile(ctx.db).timezone;
    if (g.status !== 'done' || !g.completed_at || localDate(tz, new Date(g.completed_at)) !== today(ctx)) {
      throw new HttpError(409, 'Only today\'s conquest can be undone');
    }
    removeEvents(ctx.db, 'goal', id);
    ctx.db.prepare("UPDATE goals SET status = 'active', completed_at = NULL WHERE id = ?").run(id);
  });
}

export function goalsState(ctx: Ctx) {
  const tz = getProfile(ctx.db).timezone;
  const t = today(ctx);
  const rows = ctx.db.prepare("SELECT * FROM goals ORDER BY status = 'done', CASE WHEN status = 'done' THEN completed_at END DESC, deadline_at").all() as unknown as Goal[];
  const aarGoals = new Set((ctx.db.prepare("SELECT goal_id FROM journal WHERE kind = 'aar' AND goal_id IS NOT NULL").all() as { goal_id: number }[]).map((r) => r.goal_id));
  return rows.map((g) => ({
    id: g.id, title: g.title, description: g.description, type: g.type, categoryId: g.category_id, categoryIds: catIds(g),
    deadlineAt: g.deadline_at, xp: g.xp, status: g.status, pastDue: !!g.past_due, completedAt: g.completed_at,
    reward: goalReward(g.xp, !!g.past_due),
    hasAar: aarGoals.has(g.id),
    canUndo: g.status === 'done' && !!g.completed_at && localDate(tz, new Date(g.completed_at)) === t,
    freeRemoveUntil: freeRemoveUntil(g.created_at),
  }));
}
