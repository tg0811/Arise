import { tx } from './db.ts';
import { HttpError, addCurrency, addXp, today, type Ctx } from './game.ts';
import { FOCUS_MAX_MIN, focusReward } from '../../shared/engine.ts';

// Focus timer (LevelUp's timed quest): one session at a time, timed by the server so it
// survives closing the app. Abandoning costs nothing and earns nothing.

interface Session {
  id: number;
  title: string;
  category_id: number | null;
  planned_min: number;
  started_at: string;
  status: string;
}

const active = (ctx: Ctx) =>
  ctx.db.prepare("SELECT * FROM focus_sessions WHERE status = 'active'").get() as unknown as Session | undefined;

const elapsedMin = (ctx: Ctx, s: Session) => (ctx.at.getTime() - Date.parse(s.started_at)) / 60_000;

export function startFocus(ctx: Ctx, f: { title: string; categoryId: number | null; minutes: number }) {
  if (active(ctx)) throw new HttpError(409, 'A focus session is already running');
  if (f.minutes < 5 || f.minutes > FOCUS_MAX_MIN) throw new HttpError(400, `Pick 5–${FOCUS_MAX_MIN} minutes`);
  ctx.db.prepare('INSERT INTO focus_sessions (title, category_id, planned_min, started_at) VALUES (?, ?, ?, ?)')
    .run(f.title, f.categoryId, f.minutes, ctx.at.toISOString());
}

export function completeFocus(ctx: Ctx) {
  tx(ctx.db, () => {
    const s = active(ctx);
    if (!s) throw new HttpError(404, 'No focus session running');
    const reward = focusReward(s.planned_min, elapsedMin(ctx, s));
    if (!reward) throw new HttpError(400, 'Too early: keep going until at least half the time has passed');
    const date = today(ctx);
    const note = `Focus: ${s.title} (${s.planned_min} min${reward.bonus > 0 ? `, +${Math.round(reward.bonus * 100)}% early` : ''})`;
    ctx.db.prepare("UPDATE focus_sessions SET status = 'done', ended_at = ?, xp = ? WHERE id = ?").run(ctx.at.toISOString(), reward.xp, s.id);
    addXp(ctx, date, reward.xp, s.category_id, 'focus', s.id, note);
    addCurrency(ctx, date, 'credits', reward.credits, 'focus', s.id, note);
  });
}

export function abandonFocus(ctx: Ctx) {
  const s = active(ctx);
  if (!s) throw new HttpError(404, 'No focus session running');
  ctx.db.prepare("UPDATE focus_sessions SET status = 'abandoned', ended_at = ? WHERE id = ?").run(ctx.at.toISOString(), s.id);
}

export function focusState(ctx: Ctx) {
  const s = active(ctx);
  return s ? { id: s.id, title: s.title, categoryId: s.category_id, plannedMin: s.planned_min, startedAt: s.started_at } : null;
}
