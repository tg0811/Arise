import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import type { DB } from './db.ts';
import { tx } from './db.ts';
import {
  COOKIE, PRIVATE_UNLOCK_MINUTES, checkPassword, createSession, deleteOtherSessions, deleteSession, isConfigured, isValidSession,
  privateUnlockedUntil, setPassword, setPrivateUnlock,
} from './auth.ts';
import {
  HttpError, completeHabit, completeQuest, createQuest, deleteQuest, failHabit, failQuest,
  getProfile, getTask, logWeight, settle, undoHabit, undoQuest, type Ctx,
} from './game.ts';
import { DIFFICULTIES, EXERCISE_KINDS, FOCUS_MAX_MIN, GOAL_TYPES, USERNAME_RE, localDate } from '../../shared/engine.ts';
import { fullState } from './state.ts';
import { completeGoal, createGoal, deleteGoal, undoGoal, updateGoal } from './goals.ts';
import { buyItem, createItem, deleteItem, openLootbox, updateItem, useItem } from './economy.ts';
import { createEntry, deleteEntry, updateEntry } from './journal.ts';
import { equipTitle } from './titles.ts';
import { archiveState } from './archive.ts';
import { abandonFocus, completeFocus, startFocus } from './focus.ts';
import { sendTest, setPrefs, subscribe, unsubscribe, vapidKeys, webPushSender, type Sender } from './reminders.ts';
import { exportData, resetData, restoreData } from './backup.ts';
import {
  addExerciseToSession, addPlanItem, addSet, archiveExercise, createExercise, discardSession, finishSession, gateState,
  removePlanItem, removeSet, reorderPlanItems, startSession as startWorkout, undoFinish, updateDay, updateExercise, updatePlanItem, updateSet,
} from './workout.ts';

const difficulty = z.enum(DIFFICULTIES as [string, ...string[]]);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Bad id');
  return n;
};

const ProfileBody = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  username: z.string().trim().regex(USERNAME_RE, 'Username: 3–20 letters, digits, _ or .').optional(),
  avatar: z.string().max(400_000).nullable().optional(),
  timezone: z.string().refine((tz) => { try { localDate(tz); return true; } catch { return false; } }, 'Unknown timezone').optional(),
  onboarded: z.boolean().optional(),
  myState: z.record(z.string(), z.string().max(4000)).optional(),
  heightCm: z.number().min(50).max(260).nullable().optional(),
  equippedTitle: z.string().max(80).nullable().optional(),
  weightKg: z.number().min(20).max(400).optional(),
});

const CategoryBody = z.object({
  name: z.string().trim().min(1).max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(40),
});

// Habits, quests and goals take several categories (`categoryIds`); a single `categoryId` is still accepted.
const categoryFields = {
  categoryId: z.number().int().nullable().optional(),
  categoryIds: z.array(z.number().int()).max(12).optional(),
};

const HabitBody = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  ...categoryFields,
  difficulty,
  days: z.string().regex(/^[0-6]{1,7}$/).default('0123456'),
  deadlineTime: hhmm.nullable().default(null),
  private: z.boolean().default(false),
});

const QuestBody = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  ...categoryFields,
  difficulty,
  deadlineAt: z.string().datetime(),
  boss: z.enum(['none', 'boss', 'weekly']).default('none'),
  private: z.boolean().default(false),
  parts: z.array(z.object({
    title: z.string().trim().min(1).max(80),
    description: z.string().max(500).default(''),
    durationHours: z.number().min(0.25).max(24 * 60),
  })).max(9).default([]),
});

const QuestEditBody = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().max(500),
  ...categoryFields,
  deadlineAt: z.string().datetime(),
  private: z.boolean().optional(),
});

const GoalBody = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(''),
  type: z.enum(GOAL_TYPES as [string, ...string[]]),
  ...categoryFields,
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

const ReminderBody = z.object({
  enabled: z.boolean(),
  intervalHours: z.number().int().min(1).max(12),
  quietStart: hhmm,
  quietEnd: hhmm,
  nudgeMinutes: z.number().int().min(0).max(180),
});

const PushSubBody = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

const ExerciseBody = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(EXERCISE_KINDS as [string, ...string[]]).default('strength'),
  muscle: z.string().trim().max(40).default(''),
});
const num = (max: number) => z.number().min(0).max(max).nullable().default(null);
const PlanItemBody = z.object({
  exerciseId: z.number().int(),
  targetSets: z.number().int().min(1).max(20).default(3),
  targetReps: z.number().int().min(1).max(500).nullable().default(null),
  targetKg: num(1000),
  targetMin: num(600),
});
const SetBody = z.object({
  reps: z.number().int().min(0).max(1000).nullable().default(null),
  kg: num(1000),
  seconds: z.number().int().min(0).max(86_400).nullable().default(null),
  km: num(1000),
  // Omitted = leave as is (editing a number must never untick a set).
  done: z.boolean().optional(),
});
const weekdayParam = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 6) throw new HttpError(400, 'Bad weekday');
  return n;
};

export function createApp(db: DB, clock: () => Date = () => new Date(), rng?: () => number, sender?: Sender) {
  const send = () => sender ?? webPushSender(db);
  const app = new Hono();
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production';
  // Each request's context knows whether its session has unlocked private habits.
  const ctx = (c?: any): Ctx => {
    const at = clock();
    const privateUntil = c ? privateUnlockedUntil(db, getCookie(c, COOKIE), at) : null;
    return { db, at, rng, reveal: !!privateUntil, privateUntil };
  };
  const state = (req?: any) => {
    const c = ctx(req);
    settle(c);
    return fullState(c);
  };

  /** The request's categories: deduped, and each must be an existing, active category. */
  const categoriesOf = (b: { categoryId?: number | null; categoryIds?: number[] }): number[] => {
    const ids = [...new Set(b.categoryIds ?? (b.categoryId != null ? [b.categoryId] : []))];
    const active = new Set((db.prepare('SELECT id FROM categories WHERE archived = 0').all() as { id: number }[]).map((r) => r.id));
    for (const i of ids) if (!active.has(i)) throw new HttpError(400, 'Unknown category');
    return ids;
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

  app.post('/api/password', async (c) => {
    const b = z.object({ current: z.string().max(200), next: z.string().min(6).max(200) }).parse(await c.req.json());
    if (!checkPassword(db, b.current)) {
      await new Promise((r) => setTimeout(r, 600));
      throw new HttpError(400, 'Current password is wrong'); // not 401: that would read as "logged out"
    }
    setPassword(db, b.next);
    deleteOtherSessions(db, getCookie(c, COOKIE)!);
    return c.json({ ok: true });
  });

  // ------------------------------------------------------------ state & profile
  app.get('/api/state', (c) => c.json(state(c)));

  app.put('/api/profile', async (c) => {
    const b = ProfileBody.parse(await c.req.json());
    const cur = getProfile(db);
    tx(db, () => {
      db.prepare('UPDATE profile SET name = ?, username = ?, avatar = ?, timezone = ?, onboarded = ?, my_state = ?, height_cm = ? WHERE id = 1').run(
        b.name ?? cur.name,
        b.username ?? cur.username,
        b.avatar !== undefined ? b.avatar : cur.avatar,
        b.timezone ?? cur.timezone,
        b.onboarded !== undefined ? (b.onboarded ? 1 : 0) : cur.onboarded,
        b.myState ? JSON.stringify(b.myState) : cur.my_state,
        b.heightCm !== undefined ? b.heightCm : cur.height_cm,
      );
      // Logged after the timezone update so the weigh-in lands on the right local day.
      if (b.weightKg !== undefined) logWeight(ctx(c), Math.round(b.weightKg * 10) / 10);
      if (b.equippedTitle !== undefined) equipTitle(ctx(c), b.equippedTitle);
    });
    return c.json(state(c));
  });

  // ------------------------------------------------------------ categories
  app.post('/api/categories', async (c) => {
    const b = CategoryBody.parse(await c.req.json());
    const { m } = db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM categories').get() as { m: number };
    db.prepare('INSERT INTO categories (name, color, icon, sort) VALUES (?, ?, ?, ?)').run(b.name, b.color, b.icon, m + 1);
    return c.json(state(c));
  });

  app.put('/api/categories/:id', async (c) => {
    const b = CategoryBody.parse(await c.req.json());
    db.prepare('UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?').run(b.name, b.color, b.icon, id(c.req.param('id')));
    return c.json(state(c));
  });

  app.delete('/api/categories/:id', (c) => {
    const cid = id(c.req.param('id'));
    // Keep history intact: a category that was ever used is archived, not deleted.
    const used = db.prepare(`SELECT 1 FROM tasks, json_each(tasks.category_ids) j WHERE j.value = ?1
      UNION SELECT 1 FROM goals, json_each(goals.category_ids) j WHERE j.value = ?1
      UNION SELECT 1 FROM xp_events, json_each(xp_events.category_ids) j WHERE j.value = ?1 LIMIT 1`).get(cid);
    if (used) db.prepare('UPDATE categories SET archived = 1 WHERE id = ?').run(cid);
    else db.prepare('DELETE FROM categories WHERE id = ?').run(cid);
    return c.json(state(c));
  });

  // ------------------------------------------------------------ habits
  app.post('/api/habits', async (c) => {
    const b = HabitBody.parse(await c.req.json());
    const at = clock();
    const cats = categoriesOf(b);
    db.prepare(`INSERT INTO tasks (kind, title, description, category_id, category_ids, difficulty, days, deadline_time, private, created_at, created_date)
      VALUES ('habit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(b.title, b.description, cats[0] ?? null, JSON.stringify(cats), b.difficulty, b.days, b.deadlineTime, b.private ? 1 : 0, at.toISOString(), localDate(getProfile(db).timezone, at));
    return c.json(state(c));
  });

  app.put('/api/habits/:id', async (c) => {
    const b = HabitBody.parse(await c.req.json());
    const h = getTask(db, id(c.req.param('id')));
    if (h.kind !== 'habit') throw new HttpError(404, 'Habit not found');
    // A locked private habit can't be edited: the form would only have the mask to save back.
    if (h.private && !ctx(c).reveal) throw new HttpError(403, 'Unlock private items first');
    // Stakes are fixed at creation (like a quest's): no dropping to Easy right before a fail.
    if (b.difficulty !== h.difficulty) throw new HttpError(409, 'Difficulty is locked once a habit is created');
    const cats = categoriesOf(b);
    db.prepare('UPDATE tasks SET title = ?, description = ?, category_id = ?, category_ids = ?, difficulty = ?, days = ?, deadline_time = ?, private = ? WHERE id = ?')
      .run(b.title, b.description, cats[0] ?? null, JSON.stringify(cats), b.difficulty, b.days, b.deadlineTime, b.private ? 1 : 0, h.id);
    return c.json(state(c));
  });

  app.delete('/api/habits/:id', (c) => {
    const h = getTask(db, id(c.req.param('id')));
    if (h.kind !== 'habit') throw new HttpError(404, 'Habit not found');
    if (h.private && !ctx(c).reveal) throw new HttpError(403, 'Unlock private items first');
    // Archive so past logs (and the XP they moved) stay in history.
    db.prepare('UPDATE tasks SET archived = 1 WHERE id = ?').run(h.id);
    return c.json(state(c));
  });

  app.post('/api/habits/reorder', async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(await c.req.json());
    tx(db, () => ids.forEach((tid, i) => db.prepare("UPDATE tasks SET sort = ? WHERE id = ? AND kind = 'habit'").run(i, tid)));
    return c.json(state(c));
  });

  for (const [action, fn] of [['complete', completeHabit], ['fail', failHabit], ['undo', undoHabit]] as const) {
    app.post(`/api/habits/:id/${action}`, (c) => {
      const cx = ctx(c);
      settle(cx);
      fn(cx, id(c.req.param('id')));
      return c.json(fullState(cx));
    });
  }

  // ------------------------------------------------------------ quests
  app.post('/api/quests', async (c) => {
    const b = QuestBody.parse(await c.req.json());
    const cx = ctx(c);
    settle(cx);
    createQuest(cx, { ...b, categoryIds: categoriesOf(b) } as Parameters<typeof createQuest>[1]);
    return c.json(fullState(cx));
  });

  app.put('/api/quests/:id', async (c) => {
    const b = QuestEditBody.parse(await c.req.json());
    const q = getTask(db, id(c.req.param('id')));
    if (q.kind !== 'quest' || q.status !== 'pending') throw new HttpError(409, 'Only active quests can be edited');
    if (q.private && !ctx(c).reveal) throw new HttpError(403, 'Unlock private items first');
    if (new Date(b.deadlineAt) <= clock()) throw new HttpError(400, 'Deadline must be in the future');
    const cats = categoriesOf(b);
    tx(db, () => {
      db.prepare('UPDATE tasks SET title = ?, description = ?, deadline_at = ? WHERE id = ?').run(b.title, b.description, b.deadlineAt, q.id);
      // Categories apply to this quest and the chain parts still to come.
      db.prepare("UPDATE tasks SET category_id = ?, category_ids = ? WHERE id = ? OR (chain_id = ? AND chain_index > ? AND status = 'locked')")
        .run(cats[0] ?? null, JSON.stringify(cats), q.id, q.chain_id, q.chain_index);
      // Privacy covers the whole chain, so later parts don't appear in the clear when they unlock.
      if (b.private !== undefined) {
        if (q.chain_id) db.prepare('UPDATE tasks SET private = ? WHERE chain_id = ?').run(b.private ? 1 : 0, q.chain_id);
        else db.prepare('UPDATE tasks SET private = ? WHERE id = ?').run(b.private ? 1 : 0, q.id);
      }
    });
    return c.json(state(c));
  });

  app.delete('/api/quests/:id', (c) => {
    const cx = ctx(c);
    if (getTask(db, id(c.req.param('id'))).private && !cx.reveal) throw new HttpError(403, 'Unlock private items first');
    deleteQuest(cx, id(c.req.param('id')));
    settle(cx);
    return c.json(fullState(cx));
  });

  for (const [action, fn] of [['complete', completeQuest], ['fail', failQuest], ['undo', undoQuest]] as const) {
    app.post(`/api/quests/:id/${action}`, (c) => {
      const cx = ctx(c);
      settle(cx);
      fn(cx, id(c.req.param('id')));
      return c.json(fullState(cx));
    });
  }

  // ------------------------------------------------------------ phase 2
  // Every mutation settles first (deadlines may have passed) and returns the fresh state.
  const mutate = (req: any, fn: (cx: Ctx) => unknown) => {
    const cx = ctx(req);
    settle(cx);
    fn(cx);
    return fullState(cx);
  };

  app.post('/api/goals', async (c) => {
    const b = GoalBody.parse(await c.req.json());
    return c.json(mutate(c, (cx) => createGoal(cx, { ...b, categoryIds: categoriesOf(b) } as Parameters<typeof createGoal>[1])));
  });
  app.put('/api/goals/:id', async (c) => {
    const b = GoalBody.parse(await c.req.json());
    return c.json(mutate(c, (cx) => updateGoal(cx, id(c.req.param('id')), { ...b, categoryIds: categoriesOf(b) } as Parameters<typeof updateGoal>[2])));
  });
  app.delete('/api/goals/:id', (c) => c.json(mutate(c, (cx) => deleteGoal(cx, id(c.req.param('id'))))));
  app.post('/api/goals/:id/complete', (c) => c.json(mutate(c, (cx) => completeGoal(cx, id(c.req.param('id'))))));
  app.post('/api/goals/:id/undo', (c) => c.json(mutate(c, (cx) => undoGoal(cx, id(c.req.param('id'))))));

  app.post('/api/store', async (c) => {
    const b = StoreItemBody.parse(await c.req.json());
    return c.json(mutate(c, (cx) => createItem(cx, b)));
  });
  app.put('/api/store/:id', async (c) => {
    const b = StoreItemBody.parse(await c.req.json());
    return c.json(mutate(c, (cx) => updateItem(cx, id(c.req.param('id')), b)));
  });
  app.delete('/api/store/:id', (c) => c.json(mutate(c, (cx) => deleteItem(cx, id(c.req.param('id'))))));
  app.post('/api/store/:id/buy', (c) => c.json(mutate(c, (cx) => buyItem(cx, id(c.req.param('id'))))));
  app.post('/api/inventory/:itemId/use', (c) => c.json(mutate(c, (cx) => useItem(cx, id(c.req.param('itemId'))))));

  app.post('/api/lootbox/open', (c) => {
    let loot: ReturnType<typeof openLootbox> | undefined;
    const state = mutate(c, (cx) => { loot = openLootbox(cx); });
    return c.json({ ...state, loot });
  });

  app.post('/api/journal', async (c) => {
    const b = JournalBody.parse(await c.req.json());
    return c.json(mutate(c, (cx) => createEntry(cx, b)));
  });
  app.put('/api/journal/:id', async (c) => {
    const b = JournalEditBody.parse(await c.req.json());
    return c.json(mutate(c, (cx) => updateEntry(cx, id(c.req.param('id')), b)));
  });
  app.delete('/api/journal/:id', (c) => c.json(mutate(c, (cx) => deleteEntry(cx, id(c.req.param('id'))))));

  // ------------------------------------------------------------ private habits
  // Unlock is per login session (this device) and expires on its own.
  app.post('/api/private/unlock', async (c) => {
    const { password } = z.object({ password: z.string().max(200) }).parse(await c.req.json());
    if (!checkPassword(db, password)) {
      await new Promise((r) => setTimeout(r, 600));
      throw new HttpError(401, 'Wrong password');
    }
    setPrivateUnlock(db, getCookie(c, COOKIE)!, new Date(clock().getTime() + PRIVATE_UNLOCK_MINUTES * 60_000));
    return c.json(state(c));
  });
  app.post('/api/private/lock', (c) => {
    setPrivateUnlock(db, getCookie(c, COOKIE)!, null);
    return c.json(state(c));
  });

  // ------------------------------------------------------------ phase 4: focus
  app.post('/api/focus/start', async (c) => {
    const b = z.object({ title: z.string().trim().min(1).max(80), categoryId: z.number().int().nullable(), minutes: z.number().int().min(5).max(FOCUS_MAX_MIN) })
      .parse(await c.req.json());
    return c.json(mutate(c, (cx) => startFocus(cx, b)));
  });
  app.post('/api/focus/complete', (c) => c.json(mutate(c, (cx) => completeFocus(cx))));
  app.post('/api/focus/abandon', (c) => c.json(mutate(c, (cx) => abandonFocus(cx))));

  // ------------------------------------------------------------ phase 4: push reminders
  app.get('/api/push/key', (c) => c.json({ publicKey: vapidKeys(db).publicKey }));
  app.post('/api/push/subscribe', async (c) => {
    const sub = PushSubBody.parse(await c.req.json());
    return c.json(mutate(c, (cx) => subscribe(cx, sub as any)));
  });
  app.post('/api/push/unsubscribe', async (c) => {
    const { endpoint } = z.object({ endpoint: z.string() }).parse(await c.req.json());
    return c.json(mutate(c, (cx) => unsubscribe(cx, endpoint)));
  });
  app.post('/api/push/test', async (c) => {
    await sendTest(ctx(c), send());
    return c.json({ ok: true });
  });
  app.put('/api/reminders', async (c) => {
    const b = ReminderBody.parse(await c.req.json());
    return c.json(mutate(c, () => setPrefs(db, b)));
  });

  // ------------------------------------------------------------ phase 4: data
  app.get('/api/backup', (c) => {
    const date = localDate(getProfile(db).timezone, clock());
    c.header('Content-Disposition', `attachment; filename="arise-backup-${date}.json"`);
    return c.json(exportData(db));
  });
  app.post('/api/restore', async (c) => {
    restoreData(db, await c.req.json());
    return c.json(state(c));
  });
  app.post('/api/reset', async (c) => {
    const { phrase } = z.object({ phrase: z.string() }).parse(await c.req.json());
    resetData(db, phrase);
    return c.json(state(c));
  });

  // ------------------------------------------------------------ phase 3
  app.get('/api/archive', (c) => {
    const before = c.req.query('before');
    if (before !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(before)) throw new HttpError(400, 'before must be YYYY-MM-DD');
    const cx = ctx(c);
    settle(cx);
    return c.json(archiveState(cx, before));
  });

  // ------------------------------------------------------------ phase 5: the gate
  // Every Gate mutation returns both states: the Gate's and the main app's (XP, header, Today).
  const gate = (req: any, fn?: (cx: Ctx) => unknown) => {
    const cx = ctx(req);
    settle(cx);
    fn?.(cx);
    return { gate: gateState(cx), state: fullState(cx) };
  };
  app.get('/api/gate', (c) => c.json(gate(c)));

  app.post('/api/gate/exercises', async (c) => {
    const b = ExerciseBody.parse(await c.req.json());
    let id = 0;
    const out = gate(c, (cx) => { id = createExercise(cx, b as any); });
    return c.json({ ...out, id });
  });
  app.put('/api/gate/exercises/:id', async (c) => {
    const b = ExerciseBody.parse(await c.req.json());
    return c.json(gate(c, (cx) => updateExercise(cx, id(c.req.param('id')), b as any)));
  });
  app.delete('/api/gate/exercises/:id', (c) => c.json(gate(c, (cx) => archiveExercise(cx, id(c.req.param('id'))))));

  app.put('/api/gate/days/:wd', async (c) => {
    const b = z.object({ name: z.string().trim().max(40), isRest: z.boolean() }).parse(await c.req.json());
    return c.json(gate(c, (cx) => updateDay(cx, weekdayParam(c.req.param('wd')), b)));
  });
  app.post('/api/gate/days/:wd/items', async (c) => {
    const b = PlanItemBody.parse(await c.req.json());
    return c.json(gate(c, (cx) => addPlanItem(cx, weekdayParam(c.req.param('wd')), b)));
  });
  app.post('/api/gate/days/:wd/reorder', async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(await c.req.json());
    return c.json(gate(c, (cx) => reorderPlanItems(cx, weekdayParam(c.req.param('wd')), ids)));
  });
  app.put('/api/gate/items/:id', async (c) => {
    const b = PlanItemBody.omit({ exerciseId: true }).parse(await c.req.json());
    return c.json(gate(c, (cx) => updatePlanItem(cx, id(c.req.param('id')), b)));
  });
  app.delete('/api/gate/items/:id', (c) => c.json(gate(c, (cx) => removePlanItem(cx, id(c.req.param('id'))))));

  app.post('/api/gate/session/start', (c) => c.json(gate(c, (cx) => startWorkout(cx))));
  app.post('/api/gate/session/exercise', async (c) => {
    const { exerciseId } = z.object({ exerciseId: z.number().int() }).parse(await c.req.json());
    return c.json(gate(c, (cx) => addExerciseToSession(cx, exerciseId)));
  });
  app.post('/api/gate/session/sets', async (c) => {
    const { exerciseId } = z.object({ exerciseId: z.number().int() }).parse(await c.req.json());
    return c.json(gate(c, (cx) => addSet(cx, exerciseId)));
  });
  app.put('/api/gate/sets/:id', async (c) => {
    const b = SetBody.parse(await c.req.json());
    return c.json(gate(c, (cx) => updateSet(cx, id(c.req.param('id')), b)));
  });
  app.delete('/api/gate/sets/:id', (c) => c.json(gate(c, (cx) => removeSet(cx, id(c.req.param('id'))))));
  app.post('/api/gate/session/finish', async (c) => {
    const { note } = z.object({ note: z.string().max(1000).default('') }).parse(await c.req.json().catch(() => ({})));
    return c.json(gate(c, (cx) => finishSession(cx, note)));
  });
  app.post('/api/gate/session/undo', (c) => c.json(gate(c, (cx) => undoFinish(cx))));
  app.delete('/api/gate/session', (c) => c.json(gate(c, (cx) => discardSession(cx))));

  return app;
}
