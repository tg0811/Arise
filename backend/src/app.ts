import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import type { DB } from './db.ts';
import { tx } from './db.ts';
import { COOKIE, checkPassword, createSession, deleteSession, isConfigured, isValidSession, setPassword } from './auth.ts';
import {
  HttpError, completeHabit, completeQuest, createQuest, deleteQuest, failHabit, failQuest,
  getProfile, getTask, logWeight, settle, undoHabit, undoQuest, type Ctx,
} from './game.ts';
import { DIFFICULTIES, GOAL_TYPES, localDate } from '../../shared/engine.ts';
import { fullState } from './state.ts';
import { completeGoal, createGoal, deleteGoal, undoGoal, updateGoal } from './goals.ts';
import { buyItem, createItem, deleteItem, openLootbox, updateItem, useItem } from './economy.ts';
import { createEntry, deleteEntry, updateEntry } from './journal.ts';

const difficulty = z.enum(DIFFICULTIES as [string, ...string[]]);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Bad id');
  return n;
};

const ProfileBody = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  avatar: z.string().max(400_000).nullable().optional(),
  timezone: z.string().refine((tz) => { try { localDate(tz); return true; } catch { return false; } }, 'Unknown timezone').optional(),
  onboarded: z.boolean().optional(),
  myState: z.record(z.string(), z.string().max(4000)).optional(),
  heightCm: z.number().min(50).max(260).nullable().optional(),
  weightKg: z.number().min(20).max(400).optional(),
});

const CategoryBody = z.object({
  name: z.string().trim().min(1).max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(40),
});

const HabitBody = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  categoryId: z.number().int().nullable(),
  difficulty,
  days: z.string().regex(/^[0-6]{1,7}$/).default('0123456'),
  deadlineTime: hhmm.nullable().default(null),
});

const QuestBody = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  categoryId: z.number().int().nullable(),
  difficulty,
  deadlineAt: z.string().datetime(),
  boss: z.enum(['none', 'boss', 'weekly']).default('none'),
  parts: z.array(z.object({
    title: z.string().trim().min(1).max(80),
    description: z.string().max(500).default(''),
    durationHours: z.number().min(0.25).max(24 * 60),
  })).max(9).default([]),
});

const QuestEditBody = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().max(500),
  categoryId: z.number().int().nullable(),
  deadlineAt: z.string().datetime(),
});

const GoalBody = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(''),
  type: z.enum(GOAL_TYPES as [string, ...string[]]),
  categoryId: z.number().int().nullable(),
  deadlineAt: z.string().datetime(),
  xp: z.number().int().min(10).max(100_000),
});

const StoreItemBody = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(300).default(''),
  icon: z.string().max(40).default('gift'),
  cost: z.number().int().min(1).max(1_000_000),
  currency: z.enum(['credits', 'gems']),
  lootable: z.boolean().default(true),
});

const JournalText = {
  title: z.string().max(120).default(''),
  body: z.string().max(10_000).default(''),
  planned: z.string().max(4000).default(''),
  happened: z.string().max(4000).default(''),
  why: z.string().max(4000).default(''),
  next: z.string().max(4000).default(''),
};
const JournalBody = z.object({ kind: z.enum(['note', 'aar']), goalId: z.number().int().nullable().default(null), ...JournalText });
const JournalEditBody = z.object(JournalText);

export function createApp(db: DB, clock: () => Date = () => new Date(), rng?: () => number) {
  const app = new Hono();
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production';
  const ctx = (): Ctx => ({ db, at: clock(), rng });
  const state = () => {
    const c = ctx();
    settle(c);
    return fullState(c);
  };

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
    if (err instanceof z.ZodError) return c.json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
    console.error(err);
    return c.json({ error: 'Internal error' }, 500);
  });

  // ------------------------------------------------------------ auth
  const startSession = (c: any) => {
    const { token, maxAge } = createSession(db);
    setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure, path: '/', maxAge });
  };

  app.get('/api/auth/status', (c) =>
    c.json({ configured: isConfigured(db), authed: isValidSession(db, getCookie(c, COOKIE)) }));

  app.post('/api/auth/setup', async (c) => {
    if (isConfigured(db)) throw new HttpError(409, 'Already set up');
    const { password } = z.object({ password: z.string().min(6).max(200) }).parse(await c.req.json());
    setPassword(db, password);
    startSession(c);
    return c.json({ ok: true });
  });

  app.post('/api/auth/login', async (c) => {
    const { password } = z.object({ password: z.string().max(200) }).parse(await c.req.json());
    if (!checkPassword(db, password)) {
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      throw new HttpError(401, 'Wrong password');
    }
    startSession(c);
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, COOKIE);
    if (token) deleteSession(db, token);
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/auth/')) return next();
    if (!isValidSession(db, getCookie(c, COOKIE))) return c.json({ error: 'Unauthorized' }, 401);
    return next();
  });

  // ------------------------------------------------------------ state & profile
  app.get('/api/state', (c) => c.json(state()));

  app.put('/api/profile', async (c) => {
    const b = ProfileBody.parse(await c.req.json());
    const cur = getProfile(db);
    tx(db, () => {
      db.prepare('UPDATE profile SET name = ?, avatar = ?, timezone = ?, onboarded = ?, my_state = ?, height_cm = ? WHERE id = 1').run(
        b.name ?? cur.name,
        b.avatar !== undefined ? b.avatar : cur.avatar,
        b.timezone ?? cur.timezone,
        b.onboarded !== undefined ? (b.onboarded ? 1 : 0) : cur.onboarded,
        b.myState ? JSON.stringify(b.myState) : cur.my_state,
        b.heightCm !== undefined ? b.heightCm : cur.height_cm,
      );
      // Logged after the timezone update so the weigh-in lands on the right local day.
      if (b.weightKg !== undefined) logWeight(ctx(), Math.round(b.weightKg * 10) / 10);
    });
    return c.json(state());
  });

  // ------------------------------------------------------------ categories
  app.post('/api/categories', async (c) => {
    const b = CategoryBody.parse(await c.req.json());
    const { m } = db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM categories').get() as { m: number };
    db.prepare('INSERT INTO categories (name, color, icon, sort) VALUES (?, ?, ?, ?)').run(b.name, b.color, b.icon, m + 1);
    return c.json(state());
  });

  app.put('/api/categories/:id', async (c) => {
    const b = CategoryBody.parse(await c.req.json());
    db.prepare('UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?').run(b.name, b.color, b.icon, id(c.req.param('id')));
    return c.json(state());
  });

  app.delete('/api/categories/:id', (c) => {
    const cid = id(c.req.param('id'));
    // Keep history intact: a category that was ever used is archived, not deleted.
    const used = db.prepare('SELECT 1 FROM tasks WHERE category_id = ? UNION SELECT 1 FROM xp_events WHERE category_id = ? LIMIT 1').get(cid, cid);
    if (used) db.prepare('UPDATE categories SET archived = 1 WHERE id = ?').run(cid);
    else db.prepare('DELETE FROM categories WHERE id = ?').run(cid);
    return c.json(state());
  });

  // ------------------------------------------------------------ habits
  app.post('/api/habits', async (c) => {
    const b = HabitBody.parse(await c.req.json());
    const at = clock();
    db.prepare(`INSERT INTO tasks (kind, title, description, category_id, difficulty, days, deadline_time, created_at, created_date)
      VALUES ('habit', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(b.title, b.description, b.categoryId, b.difficulty, b.days, b.deadlineTime, at.toISOString(), localDate(getProfile(db).timezone, at));
    return c.json(state());
  });

  app.put('/api/habits/:id', async (c) => {
    const b = HabitBody.parse(await c.req.json());
    const h = getTask(db, id(c.req.param('id')));
    if (h.kind !== 'habit') throw new HttpError(404, 'Habit not found');
    db.prepare('UPDATE tasks SET title = ?, description = ?, category_id = ?, difficulty = ?, days = ?, deadline_time = ? WHERE id = ?')
      .run(b.title, b.description, b.categoryId, b.difficulty, b.days, b.deadlineTime, h.id);
    return c.json(state());
  });

  app.delete('/api/habits/:id', (c) => {
    const h = getTask(db, id(c.req.param('id')));
    if (h.kind !== 'habit') throw new HttpError(404, 'Habit not found');
    // Archive so past logs (and the XP they moved) stay in history.
    db.prepare('UPDATE tasks SET archived = 1 WHERE id = ?').run(h.id);
    return c.json(state());
  });

  app.post('/api/habits/reorder', async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(await c.req.json());
    tx(db, () => ids.forEach((tid, i) => db.prepare("UPDATE tasks SET sort = ? WHERE id = ? AND kind = 'habit'").run(i, tid)));
    return c.json(state());
  });

  for (const [action, fn] of [['complete', completeHabit], ['fail', failHabit], ['undo', undoHabit]] as const) {
    app.post(`/api/habits/:id/${action}`, (c) => {
      const cx = ctx();
      settle(cx);
      fn(cx, id(c.req.param('id')));
      return c.json(fullState(cx));
    });
  }

  // ------------------------------------------------------------ quests
  app.post('/api/quests', async (c) => {
    const b = QuestBody.parse(await c.req.json());
    const cx = ctx();
    settle(cx);
    createQuest(cx, b as Parameters<typeof createQuest>[1]);
    return c.json(fullState(cx));
  });

  app.put('/api/quests/:id', async (c) => {
    const b = QuestEditBody.parse(await c.req.json());
    const q = getTask(db, id(c.req.param('id')));
    if (q.kind !== 'quest' || q.status !== 'pending') throw new HttpError(409, 'Only active quests can be edited');
    if (new Date(b.deadlineAt) <= clock()) throw new HttpError(400, 'Deadline must be in the future');
    db.prepare('UPDATE tasks SET title = ?, description = ?, category_id = ?, deadline_at = ? WHERE id = ?')
      .run(b.title, b.description, b.categoryId, b.deadlineAt, q.id);
    return c.json(state());
  });

  app.delete('/api/quests/:id', (c) => {
    const cx = ctx();
    deleteQuest(cx, id(c.req.param('id')));
    settle(cx);
    return c.json(fullState(cx));
  });

  for (const [action, fn] of [['complete', completeQuest], ['fail', failQuest], ['undo', undoQuest]] as const) {
    app.post(`/api/quests/:id/${action}`, (c) => {
      const cx = ctx();
      settle(cx);
      fn(cx, id(c.req.param('id')));
      return c.json(fullState(cx));
    });
  }

  // ------------------------------------------------------------ phase 2
  // Every mutation settles first (deadlines may have passed) and returns the fresh state.
  const mutate = (fn: (cx: Ctx) => unknown) => {
    const cx = ctx();
    settle(cx);
    fn(cx);
    return fullState(cx);
  };

  app.post('/api/goals', async (c) => {
    const b = GoalBody.parse(await c.req.json());
    return c.json(mutate((cx) => createGoal(cx, b as Parameters<typeof createGoal>[1])));
  });
  app.put('/api/goals/:id', async (c) => {
    const b = GoalBody.parse(await c.req.json());
    return c.json(mutate((cx) => updateGoal(cx, id(c.req.param('id')), b as Parameters<typeof updateGoal>[2])));
  });
  app.delete('/api/goals/:id', (c) => c.json(mutate((cx) => deleteGoal(cx, id(c.req.param('id'))))));
  app.post('/api/goals/:id/complete', (c) => c.json(mutate((cx) => completeGoal(cx, id(c.req.param('id'))))));
  app.post('/api/goals/:id/undo', (c) => c.json(mutate((cx) => undoGoal(cx, id(c.req.param('id'))))));

  app.post('/api/store', async (c) => {
    const b = StoreItemBody.parse(await c.req.json());
    return c.json(mutate((cx) => createItem(cx, b)));
  });
  app.put('/api/store/:id', async (c) => {
    const b = StoreItemBody.parse(await c.req.json());
    return c.json(mutate((cx) => updateItem(cx, id(c.req.param('id')), b)));
  });
  app.delete('/api/store/:id', (c) => c.json(mutate((cx) => deleteItem(cx, id(c.req.param('id'))))));
  app.post('/api/store/:id/buy', (c) => c.json(mutate((cx) => buyItem(cx, id(c.req.param('id'))))));
  app.post('/api/inventory/:itemId/use', (c) => c.json(mutate((cx) => useItem(cx, id(c.req.param('itemId'))))));

  app.post('/api/lootbox/open', (c) => {
    let loot: ReturnType<typeof openLootbox> | undefined;
    const state = mutate((cx) => { loot = openLootbox(cx); });
    return c.json({ ...state, loot });
  });

  app.post('/api/journal', async (c) => {
    const b = JournalBody.parse(await c.req.json());
    return c.json(mutate((cx) => createEntry(cx, b)));
  });
  app.put('/api/journal/:id', async (c) => {
    const b = JournalEditBody.parse(await c.req.json());
    return c.json(mutate((cx) => updateEntry(cx, id(c.req.param('id')), b)));
  });
  app.delete('/api/journal/:id', (c) => c.json(mutate((cx) => deleteEntry(cx, id(c.req.param('id'))))));

  return app;
}
