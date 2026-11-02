import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Difficulty, GoalType, LootType, Mood, Rank, ReminderPrefs } from '@shared';

// Mirrors backend buildState(). Every mutation returns the full fresh state.
export interface Category { id: number; name: string; color: string; icon: string; sort: number; xp: number; level: number; into: number; need: number; pct: number }
export interface Habit {
  id: number; title: string; description: string; /** Every category it trains (full XP to each). */ categoryIds: number[]; difficulty: Difficulty;
  days: string; deadlineTime: string | null; /** Push reminder time on its days (HH:MM). */ reminderTime: string | null; scheduledToday: boolean;
  /** First day it counts (YYYY-MM-DD; tomorrow if created with "starts tomorrow"). Until `freeEditUntil` it can be fixed freely. */
  startsOn: string; freeEditUntil: string;
  /** A raise waiting to start (raises apply from the next day; difficulty never goes down). */
  nextDifficulty: { difficulty: Difficulty; from: string } | null;
  /** Private habit; `masked` while this device hasn't unlocked (title/description/category hidden). */
  private: boolean; masked: boolean;
  log: { status: 'done' | 'failed'; xp: number } | null;
  streak: number; multiplier: number; xpGain: number; xpLoss: number;
}
export interface Quest {
  id: number; title: string; description: string; /** Every category it trains (full XP to each). */ categoryIds: number[]; difficulty: Difficulty;
  status: 'pending' | 'done' | 'failed'; deadlineAt: string; completedAt: string | null;
  boss: 'none' | 'boss' | 'weekly'; chain: { index: number; total: number } | null;
  xp: number; credits: number; canUndo: boolean;
  /** Removing it is free until this moment (its first hour); after that it can only be abandoned. */
  freeRemoveUntil: string;
  /** Private quest; `masked` while this device hasn't unlocked. A chain shares one setting. */
  private: boolean; masked: boolean;
}
export interface AppState {
  now: string;
  today: string;
  profile: {
    name: string; /** Shown in the header; falls back to the name. */ username: string; avatar: string | null; timezone: string; onboarded: boolean; myState: Record<string, string>;
    heightCm: number | null; weightKg: number | null;
  };
  progress: { totalXp: number; level: number; into: number; need: number; pct: number; maxLevel: number; rank: Rank; title: string; nextRank: { rank: Rank; title: string; minLevel: number } | null };
  wallet: { credits: number; gems: number };
  streak: { current: number; best: number; today: { total: number; done: number; ratio: number; cleared: boolean } };
  mood: Mood;
  categories: Category[];
  habits: Habit[];
  quests: Quest[];
  weeklyBossAvailable: boolean;
  /** When this device's private-habit unlock expires (null = locked). */
  privateUntil: string | null;
  goals: Goal[];
  storeItems: StoreItem[];
  inventory: {
    owned: { itemId: number; name: string; description: string; icon: string; count: number }[];
    used: { id: number; name: string; icon: string; source: 'store' | 'lootbox'; usedAt: string }[];
  };
  lootbox: { available: boolean; claimed: Loot | null };
  journal: JournalEntry[];
  /** Only present on the response to opening the lootbox. */
  loot?: Loot;
  titles: Title[];
  equippedTitle: { key: string; name: string } | null;
  focus: { id: number; title: string; categoryId: number | null; plannedMin: number; startedAt: string } | null;
  /** Today's scheduled workout (null on rest days / no plan). */
  workoutToday: { name: string; done: boolean; total: number; completed: number } | null;
  reminders: ReminderPrefs & { devices: number };
  /** App lock: on/off, and the passkeys (fingerprint/face) set up on your devices. */
  lock: { enabled: boolean; passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[] };
}

export interface Title { key: string; name: string; hint: string; cur: number; target: number; unlocked: boolean; unlockedAt: string | null }

// ---------------------------------------------------------------- archive (fetched on demand)

export interface DayStat { date: string; total: number; done: number; gained: number; lost: number }
export interface HistoryEvent { at: string; kind: 'xp' | 'purchase'; amount: number; currency?: 'credits' | 'gems'; categoryIds: number[]; source: string; note: string }
export interface HabitStreak {
  id: number; title: string; categoryIds: number[]; difficulty: Difficulty; days: string;
  current: number; best: number; done: number; failed: number; rate: number | null; private: boolean; masked: boolean;
  strip: ('done' | 'failed' | 'rest' | 'pending' | 'none')[];
}
export interface Archive {
  today: string;
  overview: {
    tasksDone: number; tasksFailed: number; completionRate: number | null; questsCleared: number; bossesSlain: number;
    goalsConquered: number; payloadsOpened: number; reviews: number; itemsRedeemed: number; creditsEarned: number;
    firstDay: string | null; daysActive: number; currentStreak: number; bestStreak: number;
  };
  heatmap: DayStat[];
  week: DayStat[];
  history: (DayStat & { events: HistoryEvent[] })[];
  historyNext: string | null;
  habitStreaks: HabitStreak[];
}

/** Archive pages: the first carries everything; later pages only add older history. */
export const useArchive = () =>
  useInfiniteQuery({
    queryKey: ['archive'],
    queryFn: ({ pageParam }) => api<Archive>('GET', `/archive${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.historyNext,
    staleTime: 0,
  });

export interface Goal {
  id: number; title: string; description: string; type: GoalType; categoryIds: number[];
  deadlineAt: string; xp: number; status: 'active' | 'done'; pastDue: boolean; completedAt: string | null;
  reward: number; hasAar: boolean; canUndo: boolean;
  /** Removing it is free until this moment; later it costs the stake (unless the penalty was already paid). */
  freeRemoveUntil: string;
}
export interface StoreItem { id: number; name: string; description: string; icon: string; cost: number; currency: 'credits' | 'gems'; lootable: boolean }
export interface Loot { type: LootType; amount: number; itemName?: string }
export interface JournalEntry {
  id: number; date: string; kind: 'note' | 'aar'; goalId: number | null; goalTitle: string | null;
  title: string; body: string; planned: string; happened: string; why: string; next: string; createdAt: string;
}

export const LOCKED_EVENT = 'arise:locked';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = AppState>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  // 423 = this device is locked (app lock): the app swaps to the lock screen.
  if (res.status === 423) window.dispatchEvent(new Event(LOCKED_EVENT));
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export const useAppState = () =>
  useQuery({ queryKey: ['state'], queryFn: () => api('GET', '/state'), refetchInterval: 60_000, refetchOnWindowFocus: true });

/** Mutation that replaces the cached state with the server's response. */
export function useAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ method = 'POST', path, body }: { method?: string; path: string; body?: unknown }) => api(method, path, body),
    onSuccess: (state) => {
      qc.setQueryData(['state'], state);
      qc.invalidateQueries({ queryKey: ['archive'] });
    },
  });
}

// ---------------------------------------------------------------- the gate (workouts)

export type ExerciseKind = 'strength' | 'bodyweight' | 'cardio';
export interface GateSet { id: number; setNo: number; reps: number | null; kg: number | null; seconds: number | null; km: number | null; done: boolean }
export interface Prs { kg: number; e1rm: number; reps: number; seconds: number; km: number }
export interface PlanItem { id: number; exerciseId: number; name: string; kind: ExerciseKind; targetSets: number; targetReps: number | null; targetKg: number | null; targetMin: number | null }
export interface PlanDay { weekday: number; name: string; isRest: boolean; scheduled: boolean; items: PlanItem[] }
export interface GateExercise { id: number; name: string; kind: ExerciseKind; muscle: string; archived: boolean; prs: Prs; sessions: number; series: ({ date: string } & Prs)[] }
export interface GateSession {
  id: number; title: string; scheduled: boolean; status: 'active' | 'done'; startedAt: string | null; finishedAt: string | null; note: string;
  exercises: { exerciseId: number; name: string; kind: ExerciseKind; sets: GateSet[]; previous: GateSet[] }[];
}
export interface GateHistory {
  id: number; date: string; title: string; status: 'active' | 'done' | 'missed'; scheduled: boolean; minutes: number | null; note: string;
  sets: number; volume: number; prs: number; exercises: { name: string; sets: GateSet[] }[];
}
export interface Gate {
  today: string;
  scheduleSince: string | null;
  plan: PlanDay[];
  week: { date: string; name: string; status: 'done' | 'missed' | 'planned' | 'rest' | 'active' | 'extra'; isToday: boolean }[];
  todayPlan: PlanDay;
  session: GateSession | null;
  history: GateHistory[];
  exercises: GateExercise[];
  streak: { current: number; best: number; weeks: { start: string; status: 'complete' | 'broken' | 'none' | 'open' }[] };
  workoutsDone: number;
}

export const useGate = () => useQuery({ queryKey: ['gate'], queryFn: async () => (await api<{ gate: Gate; state: AppState }>('GET', '/gate')).gate });

/** Gate mutations return both the Gate's state and the main app's (XP, header, Today). */
export function useGateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ method = 'POST', path, body }: { method?: string; path: string; body?: unknown }) =>
      api<{ gate: Gate; state: AppState; id?: number }>(method, `/gate${path}`, body),
    onSuccess: (r) => {
      qc.setQueryData(['gate'], r.gate);
      qc.setQueryData(['state'], r.state);
      qc.invalidateQueries({ queryKey: ['archive'] });
    },
  });
}
