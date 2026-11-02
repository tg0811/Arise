import { HttpError, attributeXp, dayProgress, habitDue, totalXp, type Ctx, type Task } from './game.ts';
import { GATE_TITLE_WEEKS, attributeLevel, levelFromXp, MAX_LEVEL } from '../../shared/engine.ts';
import { weekStreak } from './workout.ts';

// Titles (M7): earned by deterministic milestones, never by luck. Each is checked against
// live stats on every state build; once met it is recorded in title_unlocks and kept.

export interface Milestones {
  tasksDone: number;
  bestStreak: number;
  bestHabitStreak: number;
  bossesSlain: number;
  megaBossesSlain: number;
  chainsCompleted: number;
  goalsConquered: number;
  reviews: number;
  payloadsOpened: number;
  level: number;
  attributes: { id: number; name: string; level: number }[];
  workoutsDone: number;
  bestWeekStreak: number;
}

interface TitleDef {
  key: string;
  name: string;
  hint: string;
  progress: (m: Milestones) => { cur: number; target: number };
}

const at = (cur: number, target: number) => ({ cur: Math.min(cur, target), target });

const FIXED_TITLES: TitleDef[] = [
  { key: 'first_blood', name: 'First Blood', hint: 'Complete your first task', progress: (m) => at(m.tasksDone, 1) },
  { key: 'centurion', name: 'Centurion', hint: 'Complete 100 tasks', progress: (m) => at(m.tasksDone, 100) },
  { key: 'thousand_trials', name: 'Thousand Trials', hint: 'Complete 1,000 tasks', progress: (m) => at(m.tasksDone, 1000) },
  { key: 'iron_will', name: 'Iron Will', hint: 'Reach a 7-day daily streak', progress: (m) => at(m.bestStreak, 7) },
  { key: 'unbroken', name: 'The Unbroken', hint: 'Reach a 30-day daily streak', progress: (m) => at(m.bestStreak, 30) },
  { key: 'relentless', name: 'The Relentless', hint: 'Reach a 100-day daily streak', progress: (m) => at(m.bestStreak, 100) },
  { key: 'oath_keeper', name: 'Oath Keeper', hint: 'Hold one habit for 30 scheduled days in a row', progress: (m) => at(m.bestHabitStreak, 30) },
  { key: 'boss_slayer', name: 'Boss Slayer', hint: 'Clear a boss quest', progress: (m) => at(m.bossesSlain, 1) },
  { key: 'monarch_hunter', name: 'Monarch Hunter', hint: 'Clear 5 Weekly Mega Bosses', progress: (m) => at(m.megaBossesSlain, 5) },
  { key: 'chain_breaker', name: 'Chain Breaker', hint: 'Clear every part of a quest chain', progress: (m) => at(m.chainsCompleted, 1) },
  { key: 'conqueror', name: 'Conqueror', hint: 'Conquer a Major Goal', progress: (m) => at(m.goalsConquered, 1) },
  { key: 'warlord', name: 'Warlord', hint: 'Conquer 10 Major Goals', progress: (m) => at(m.goalsConquered, 10) },
  { key: 'reflective', name: 'The Reflective', hint: 'Write 5 after-action reviews', progress: (m) => at(m.reviews, 5) },
  { key: 'treasure_hunter', name: 'Treasure Hunter', hint: 'Open 30 Random Boxes', progress: (m) => at(m.payloadsOpened, 30) },
  { key: 'shadow_monarch', name: 'Shadow Monarch', hint: `Reach level ${MAX_LEVEL}`, progress: (m) => at(m.level, MAX_LEVEL) },
  { key: 'gatekeeper', name: 'Dungeon Initiate', hint: 'Finish your first workout in the Instant Dungeon', progress: (m) => at(m.workoutsDone, 1) },
  { key: 'iron_disciple', name: 'Iron Disciple', hint: `Hold a ${GATE_TITLE_WEEKS.iron}-week workout streak`, progress: (m) => at(m.bestWeekStreak, GATE_TITLE_WEEKS.iron) },
  { key: 'dungeon_breaker', name: 'Dungeon Breaker', hint: `Hold a ${GATE_TITLE_WEEKS.breaker}-week workout streak`, progress: (m) => at(m.bestWeekStreak, GATE_TITLE_WEEKS.breaker) },
  { key: 'centurion_of_iron', name: 'Centurion of Iron', hint: 'Finish 100 workouts', progress: (m) => at(m.workoutsDone, 100) },
];

/** Per-category titles, so new categories get their own milestones automatically. */
const ATTRIBUTE_TIERS = [
  { suffix: 'adept', label: 'Adept', level: 10 },
  { suffix: 'master', label: 'Master', level: 25 },
];

function allTitles(m: Milestones): TitleDef[] {
  const perCategory = m.attributes.flatMap((a) =>
    ATTRIBUTE_TIERS.map((t) => ({
      key: `cat:${a.id}:${t.suffix}`,
      name: `${a.name} ${t.label}`,
      hint: `Raise ${a.name} to attribute level ${t.level}`,
      progress: (mm: Milestones) => at(mm.attributes.find((x) => x.id === a.id)?.level ?? 1, t.level),
    })));
  return [...FIXED_TITLES, ...perCategory];
}

// ---------------------------------------------------------------- streak walks

/** Best run of consecutive completed scheduled days for one habit (rest days skipped). */
export function habitBestStreak(habit: Pick<Task, 'days' | 'kept_date' | 'created_date'>, logs: { date: string; status: string }[]): number {
  let best = 0;
  let run = 0;
  for (const l of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!habitDue(habit, l.date)) continue;
    run = l.status === 'done' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function milestones(ctx: Ctx): Milestones {
  const { db } = ctx;
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  const habits = db.prepare("SELECT id, days, kept_date, created_date FROM tasks WHERE kind = 'habit'").all() as { id: number; days: string; kept_date: string | null; created_date: string }[];
  const logs = db.prepare('SELECT task_id, date, status FROM habit_logs').all() as { task_id: number; date: string; status: string }[];
  const byHabit = new Map<number, { date: string; status: string }[]>();
  for (const l of logs) byHabit.set(l.task_id, [...(byHabit.get(l.task_id) ?? []), l]);
  const bestHabitStreak = Math.max(0, ...habits.map((h) => habitBestStreak(h, byHabit.get(h.id) ?? [])));

  const catXp = attributeXp(db);
  const attributes = (db.prepare('SELECT id, name FROM categories WHERE archived = 0').all() as { id: number; name: string }[])
    .map((c) => ({ id: c.id, name: c.name, level: attributeLevel(catXp.get(c.id) ?? 0).level }));

  return {
    tasksDone: n("SELECT COUNT(*) AS n FROM habit_logs WHERE status = 'done'") + n("SELECT COUNT(*) AS n FROM tasks WHERE kind = 'quest' AND status = 'done'"),
    bestStreak: dayProgress(ctx).streak.best,
    bestHabitStreak,
    bossesSlain: n("SELECT COUNT(*) AS n FROM tasks WHERE kind = 'quest' AND status = 'done' AND boss != 'none'"),
    megaBossesSlain: n("SELECT COUNT(*) AS n FROM tasks WHERE kind = 'quest' AND status = 'done' AND boss = 'weekly'"),
    chainsCompleted: n(`SELECT COUNT(*) AS n FROM (SELECT chain_id FROM tasks WHERE chain_id IS NOT NULL
      GROUP BY chain_id HAVING SUM(status = 'done') = COUNT(*))`),
    goalsConquered: n("SELECT COUNT(*) AS n FROM goals WHERE status = 'done'"),
    reviews: n("SELECT COUNT(*) AS n FROM journal WHERE kind = 'aar'"),
    payloadsOpened: n('SELECT COUNT(*) AS n FROM lootbox_claims'),
    level: levelFromXp(totalXp(db)).level,
    attributes,
    workoutsDone: n("SELECT COUNT(*) AS n FROM workout_sessions WHERE status = 'done'"),
    bestWeekStreak: weekStreak(ctx).best,
  };
}

/** Record any newly met titles and return the full list with progress. */
export function evaluateTitles(ctx: Ctx) {
  const m = milestones(ctx);
  const unlocked = new Map((ctx.db.prepare('SELECT key, unlocked_at FROM title_unlocks').all() as { key: string; unlocked_at: string }[])
    .map((r) => [r.key, r.unlocked_at]));
  const ins = ctx.db.prepare('INSERT OR IGNORE INTO title_unlocks (key, unlocked_at) VALUES (?, ?)');
  return allTitles(m).map((t) => {
    const p = t.progress(m);
    if (p.cur >= p.target && !unlocked.has(t.key)) {
      ins.run(t.key, ctx.at.toISOString());
      unlocked.set(t.key, ctx.at.toISOString());
    }
    return { key: t.key, name: t.name, hint: t.hint, cur: p.cur, target: p.target, unlocked: unlocked.has(t.key), unlockedAt: unlocked.get(t.key) ?? null };
  });
}

export function equipTitle(ctx: Ctx, key: string | null) {
  if (key !== null && !ctx.db.prepare('SELECT 1 FROM title_unlocks WHERE key = ?').get(key)) throw new HttpError(400, 'That title is not unlocked yet');
  ctx.db.prepare('UPDATE profile SET equipped_title = ? WHERE id = 1').run(key);
}
