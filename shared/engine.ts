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

/** A day counts toward the global streak when this share of its tasks is done. */
export const DAY_CLEAR_RATIO = 0.8;

// ---------------------------------------------------------------- levels

const round10 = (n: number) => Math.round(n / 10) * 10;

/** XP required to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return round10(100 + 8 * Math.pow(level, 1.5));
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

/** Attribute (per-category) level from that category's net XP. */
export function attributeLevel(xp: number): LevelInfo {
  const safe = Math.max(0, xp);
  const level = Math.floor(Math.sqrt(safe / 25)) + 1;
  const floor = 25 * (level - 1) ** 2;
  const ceil = 25 * level ** 2;
  return { level, into: safe - floor, need: ceil - floor, pct: (safe - floor) / (ceil - floor) };
}

// ---------------------------------------------------------------- mood

export function moodFor(rate: number | null): Mood {
  if (rate === null) return 'steady';
  if (rate >= 0.9) return 'radiant';
  if (rate >= 0.6) return 'steady';
  if (rate >= 0.3) return 'worn';
  return 'broken';
}

// ---------------------------------------------------------------- dates
// Calendar dates are plain 'YYYY-MM-DD' strings in the player's timezone.

export function localDate(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
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
