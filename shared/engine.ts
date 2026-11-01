// Game rules shared by backend and frontend. Pure functions only — no I/O.
// Every number the player can feel lives here so it can be tuned in one place
// (and shown verbatim on the System Mechanics page).

export type Difficulty = 'easy' | 'normal' | 'hard' | 'legendary';
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type Mood = 'radiant' | 'steady' | 'worn' | 'broken';

export const MAX_LEVEL = 100;

/** XP gained on completion and lost on failure (gain === loss by design). */
export const DIFFICULTY_XP: Record<Difficulty, number> = {
  easy: 10,
  normal: 25,
  hard: 50,
  legendary: 100,
};

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'legendary'];

/** Credits granted on completion, derived from the tier's XP. */
export const creditsFor = (xp: number) => Math.max(1, Math.round(xp / 5));

/** Boss quests multiply both reward and penalty. */
export const BOSS_MULTIPLIER = 3;

/** Weekly mega boss is worth this share of the XP needed for the next level. */
export const WEEKLY_BOSS_SHARE = 0.25;

/** Weekly mega boss value given the XP still needed for the next level (min 50, rounded to 10). */
export const weeklyBossXp = (levelNeed: number) => Math.max(50, Math.round((levelNeed * WEEKLY_BOSS_SHARE) / 10) * 10);

/** A day counts toward the global streak when this share of its tasks is done. */
export const DAY_CLEAR_RATIO = 0.8;

// ---------------------------------------------------------------- levels

const round10 = (n: number) => Math.round(n / 10) * 10;

/** XP to next level = round10(CURVE_BASE + CURVE_FACTOR · level^CURVE_POWER). */
export const CURVE_BASE = 100;
export const CURVE_FACTOR = 8;
export const CURVE_POWER = 1.5;

/** XP required to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return round10(CURVE_BASE + CURVE_FACTOR * Math.pow(level, CURVE_POWER));
}

const CUMULATIVE: number[] = (() => {
  // CUMULATIVE[L] = total XP needed to reach level L (CUMULATIVE[1] = 0)
  const arr = [0, 0];
  for (let l = 1; l < MAX_LEVEL; l++) arr.push(arr[l] + xpToNext(l));
  return arr;
})();

export const totalXpForLevel = (level: number) => CUMULATIVE[Math.min(Math.max(level, 1), MAX_LEVEL)];

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP needed to clear the current level (0 at max). */
  need: number;
  pct: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, totalXp);
  let level = 1;
  while (level < MAX_LEVEL && xp >= CUMULATIVE[level + 1]) level++;
  const need = xpToNext(level);
  const into = level >= MAX_LEVEL ? 0 : xp - CUMULATIVE[level];
  return { level, into, need, pct: need ? into / need : 1 };
}

// ---------------------------------------------------------------- ranks

export interface RankDef {
  rank: Rank;
  title: string;
  minLevel: number;
}

export const RANKS: RankDef[] = [
  { rank: 'E', title: 'The Awakened', minLevel: 1 },
  { rank: 'D', title: 'The Tested', minLevel: 17 },
  { rank: 'C', title: 'The Disciplined', minLevel: 34 },
  { rank: 'B', title: 'The Forged', minLevel: 51 },
  { rank: 'A', title: 'The Sovereign', minLevel: 68 },
  { rank: 'S', title: 'The Transcendent', minLevel: 85 },
];

export function rankForLevel(level: number): RankDef {
  let current = RANKS[0];
  for (const r of RANKS) if (level >= r.minLevel) current = r;
  return current;
}

export function nextRank(rank: Rank): RankDef | null {
  const i = RANKS.findIndex((r) => r.rank === rank);
  return RANKS[i + 1] ?? null;
}

// ---------------------------------------------------------------- streaks

export const STREAK_TIERS: { days: number; multiplier: number }[] = [
  { days: 90, multiplier: 3 },
  { days: 30, multiplier: 2 },
  { days: 14, multiplier: 1.5 },
  { days: 7, multiplier: 1.25 },
];

/** Multiplier for a habit whose streak (including today's completion) is `days`. */
export function streakMultiplier(days: number): number {
  for (const t of STREAK_TIERS) if (days >= t.days) return t.multiplier;
  return 1;
}

// ---------------------------------------------------------------- attributes

/** Attribute level L starts at ATTR_SCALE·(L−1)² XP. */
export const ATTR_SCALE = 25;

/** Attribute (per-category) level from that category's net XP. */
export function attributeLevel(xp: number): LevelInfo {
  const safe = Math.max(0, xp);
  const level = Math.floor(Math.sqrt(safe / ATTR_SCALE)) + 1;
  const floor = ATTR_SCALE * (level - 1) ** 2;
  const ceil = ATTR_SCALE * level ** 2;
  return { level, into: safe - floor, need: ceil - floor, pct: (safe - floor) / (ceil - floor) };
}

// ---------------------------------------------------------------- mood

/** Mood from the last 7 days' completion rate; first tier whose `min` is met wins. */
export const MOOD_TIERS: { mood: Mood; min: number }[] = [
  { mood: 'radiant', min: 0.9 },
  { mood: 'steady', min: 0.6 },
  { mood: 'worn', min: 0.3 },
  { mood: 'broken', min: 0 },
];

export function moodFor(rate: number | null): Mood {
  if (rate === null) return 'steady';
  return MOOD_TIERS.find((t) => rate >= t.min)!.mood;
}

// ---------------------------------------------------------------- major goals

export type GoalType = 'siege' | 'forge' | 'gauntlet';
export const GOAL_TYPES: GoalType[] = ['siege', 'forge', 'gauntlet'];

/** Size presets: the reward on time, and the penalty when the deadline passes (gain = loss). */
export const GOAL_SIZES: { id: string; label: string; xp: number }[] = [
  { id: 'small', label: 'Small', xp: 250 },
  { id: 'medium', label: 'Medium', xp: 500 },
  { id: 'large', label: 'Large', xp: 1000 },
  { id: 'epic', label: 'Epic', xp: 2000 },
];

/** A goal finished after its deadline (penalty already paid) still earns this share. */
export const GOAL_LATE_SHARE = 0.5;

export const goalReward = (xp: number, pastDue: boolean) => (pastDue ? Math.round(xp * GOAL_LATE_SHARE) : xp);

/** XP for the first after-action review written about a goal. */
export const JOURNAL_AAR_XP = 25;

// ---------------------------------------------------------------- daily lootbox

export type LootType = 'credits' | 'xp' | 'gems' | 'item';

export const LOOT_ODDS: { type: LootType; chance: number; min: number; max: number }[] = [
  { type: 'credits', chance: 0.5, min: 25, max: 75 },
  { type: 'xp', chance: 0.25, min: 25, max: 75 },
  { type: 'gems', chance: 0.1, min: 1, max: 2 },
  { type: 'item', chance: 0.15, min: 1, max: 1 },
];

/** Streak bonus on credit/XP drops: +2% per streak day, up to +100%. */
export const LOOT_STREAK_BONUS_PER_DAY = 0.02;
export const LOOT_STREAK_BONUS_CAP = 1;
/** One extra gem on gem drops per this many streak days. */
export const LOOT_GEM_STREAK_STEP = 10;

export const lootStreakBonus = (streak: number) => Math.min(streak * LOOT_STREAK_BONUS_PER_DAY, LOOT_STREAK_BONUS_CAP);

/** Roll the daily lootbox. `rng` returns [0, 1). Item drops are resolved by the caller. */
export function rollLoot(rng: () => number, streak: number): { type: LootType; amount: number } {
  const roll = rng();
  let acc = 0;
  const entry = LOOT_ODDS.find((o) => (acc += o.chance) > roll) ?? LOOT_ODDS[0];
  const base = entry.min + Math.floor(rng() * (entry.max - entry.min + 1));
  if (entry.type === 'credits' || entry.type === 'xp') return { type: entry.type, amount: Math.floor(base * (1 + lootStreakBonus(streak))) };
  if (entry.type === 'gems') return { type: 'gems', amount: base + Math.floor(streak / LOOT_GEM_STREAK_STEP) };
  return { type: 'item', amount: 1 };
}

// ---------------------------------------------------------------- focus timer

export const FOCUS_XP_PER_MIN = 1.5;
export const FOCUS_CREDITS_PER_MIN = 0.5;
/** You can only claim a session after this share of the planned time… */
export const FOCUS_MIN_SHARE = 0.5;
/** …which also caps the early-finish bonus (finishing at exactly half time = +50%). */
export const FOCUS_EARLY_BONUS_CAP = 0.5;
export const FOCUS_MAX_MIN = 240;
export const FOCUS_PRESETS = [15, 25, 45, 60, 90];

/** Reward for a focus session, or null if it's too early to claim. Overtime earns the base. */
export function focusReward(plannedMin: number, elapsedMin: number): { xp: number; credits: number; bonus: number } | null {
  if (elapsedMin < plannedMin * FOCUS_MIN_SHARE) return null;
  const bonus = elapsedMin < plannedMin ? Math.min((plannedMin - elapsedMin) / plannedMin, FOCUS_EARLY_BONUS_CAP) : 0;
  return {
    xp: Math.round(plannedMin * FOCUS_XP_PER_MIN * (1 + bonus)),
    credits: Math.round(plannedMin * FOCUS_CREDITS_PER_MIN * (1 + bonus)),
    bonus,
  };
}

// ---------------------------------------------------------------- the gate (workouts)

/** A completed scheduled workout day gives this much Body XP; a missed one costs the same. */
export const WORKOUT_XP = 50;

export type ExerciseKind = 'strength' | 'bodyweight' | 'cardio';
export const EXERCISE_KINDS: ExerciseKind[] = ['strength', 'bodyweight', 'cardio'];

/** Estimated one-rep max (Epley). */
export const e1rm = (kg: number, reps: number) => (kg > 0 && reps > 0 ? Math.round(kg * (1 + reps / 30) * 10) / 10 : 0);

/** Weekly streak milestones that unlock titles. */
export const GATE_TITLE_WEEKS = { iron: 4, breaker: 12 };

// ---------------------------------------------------------------- reminders

export interface ReminderPrefs {
  enabled: boolean;
  /** Hours between "N tasks still undone" reminders. */
  intervalHours: number;
  /** No interval reminders between these local times (HH:MM). Deadline nudges still fire. */
  quietStart: string;
  quietEnd: string;
  /** Nudge this many minutes before a habit/quest deadline (0 = off). */
  nudgeMinutes: number;
}

export const DEFAULT_REMINDERS: ReminderPrefs = { enabled: true, intervalHours: 3, quietStart: '23:00', quietEnd: '07:00', nudgeMinutes: 30 };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Is local minute-of-day `min` inside the quiet window (which may wrap past midnight)? */
export function inQuietHours(min: number, quietStart: string, quietEnd: string): boolean {
  const qs = toMin(quietStart);
  const qe = toMin(quietEnd);
  if (qs === qe) return false;
  return qs < qe ? min >= qs && min < qe : min >= qs || min < qe;
}

export const minuteOfDay = toMin;

// ---------------------------------------------------------------- dates
// Calendar dates are plain 'YYYY-MM-DD' strings in the player's timezone.

export function localDate(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Minutes since local midnight in `tz`. */
export function localMinute(tz: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return get('hour') * 60 + get('minute');
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export const weekday = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();

/** Monday of the week containing `date`, used to cap weekly bosses. */
export function weekStart(date: string): string {
  const wd = weekday(date);
  return addDays(date, -((wd + 6) % 7));
}

/** Habit `days` is a string of weekday digits, e.g. '0123456' (all) or '135' (Mon/Wed/Fri). */
export const isScheduled = (days: string, date: string) => days.includes(String(weekday(date)));

export const ALL_DAYS = '0123456';

/** Username shown in the header: 3–20 letters, digits, `_` or `.`. The full name stays free text. */
export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
