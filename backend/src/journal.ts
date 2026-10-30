import { tx } from './db.ts';
import { HttpError, addXp, removeEvents, today, type Ctx } from './game.ts';
import { JOURNAL_AAR_XP } from '../../shared/engine.ts';

// Journal: free notes, plus After-Action Reviews (planned / happened / why / next)
// for finished or failed Major Goals. No AI — the reflection is the point.

export interface JournalInput {
  kind: 'note' | 'aar';
  goalId: number | null;
  title: string;
  body: string;
  planned: string;
  happened: string;
  why: string;
  next: string;
}

/** Reflection trains the Mind (if that category still exists). */
function mindCategoryId(ctx: Ctx): number | null {
  const row = ctx.db.prepare("SELECT id FROM categories WHERE archived = 0 AND lower(name) = 'mind'").get() as { id: number } | undefined;
  return row?.id ?? null;
}

export function createEntry(ctx: Ctx, e: JournalInput) {
  tx(ctx.db, () => {
    let firstAar = false;
    if (e.kind === 'aar') {
      if (!e.goalId) throw new HttpError(400, 'An after-action review needs a goal');
      const goal = ctx.db.prepare('SELECT title, status, past_due FROM goals WHERE id = ?').get(e.goalId) as { title: string; status: string; past_due: number } | undefined;
      if (!goal) throw new HttpError(404, 'Goal not found');
      if (goal.status !== 'done' && !goal.past_due) throw new HttpError(400, 'Review a goal once it is conquered or past due');
      firstAar = !ctx.db.prepare("SELECT 1 FROM journal WHERE kind = 'aar' AND goal_id = ?").get(e.goalId);
    }
    const now = ctx.at.toISOString();
    const res = ctx.db.prepare(`INSERT INTO journal (date, kind, goal_id, title, body, planned, happened, why, next, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(today(ctx), e.kind, e.kind === 'aar' ? e.goalId : null, e.title, e.body, e.planned, e.happened, e.why, e.next, now, now);
    if (firstAar) addXp(ctx, today(ctx), JOURNAL_AAR_XP, mindCategoryId(ctx), 'journal', Number(res.lastInsertRowid), 'After-action review');
  });
}

export function updateEntry(ctx: Ctx, id: number, e: Omit<JournalInput, 'kind' | 'goalId'>) {
  const res = ctx.db.prepare('UPDATE journal SET title = ?, body = ?, planned = ?, happened = ?, why = ?, next = ?, updated_at = ? WHERE id = ?')
    .run(e.title, e.body, e.planned, e.happened, e.why, e.next, ctx.at.toISOString(), id);
  if (!res.changes) throw new HttpError(404, 'Entry not found');
}

export function deleteEntry(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    removeEvents(ctx.db, 'journal', id);
    ctx.db.prepare('DELETE FROM journal WHERE id = ?').run(id);
  });
}

export function journalState(ctx: Ctx) {
  return (ctx.db.prepare(`SELECT j.*, g.title AS goal_title FROM journal j LEFT JOIN goals g ON g.id = j.goal_id
    ORDER BY j.created_at DESC LIMIT 200`).all() as any[]).map((j) => ({
    id: j.id as number, date: j.date as string, kind: j.kind as 'note' | 'aar', goalId: j.goal_id as number | null, goalTitle: j.goal_title as string | null,
    title: j.title as string, body: j.body as string, planned: j.planned as string, happened: j.happened as string, why: j.why as string, next: j.next as string,
    createdAt: j.created_at as string,
  }));
}
