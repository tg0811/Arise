import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Difficulty, GoalType, LootType, Mood, Rank, ReminderPrefs } from '@shared';

// Mirrors backend buildState(). Every mutation returns the full fresh state.
export interface Category { id: number; name: string; color: string; icon: string; sort: number; xp: number; level: number; into: number; need: number; pct: number }
export interface Habit {
  id: number; title: string; description: string; categoryId: number | null; difficulty: Difficulty;
  days: string; deadlineTime: string | null; scheduledToday: boolean;
  log: { status: 'done' | 'failed'; xp: number } | null;
  streak: number; multiplier: number; xpGain: number; xpLoss: number;
}
export interface Quest {
  id: number; title: string; description: string; categoryId: number | null; difficulty: Difficulty;
  status: 'pending' | 'done' | 'failed'; deadlineAt: string; completedAt: string | null;
  boss: 'none' | 'boss' | 'weekly'; chain: { index: number; total: number } | null;
  xp: number; credits: number; canUndo: boolean;
}
export interface AppState {
  now: string;
  today: string;
  profile: {
    name: string; avatar: string | null; timezone: string; onboarded: boolean; myState: Record<string, string>;
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
  reminders: ReminderPrefs & { devices: number };
}

export interface Title { key: string; name: string; hint: string; cur: number; target: number; unlocked: boolean; unlockedAt: string | null }

// ---------------------------------------------------------------- archive (fetched on demand)

export interface DayStat { date: string; total: number; done: number; gained: number; lost: number }
export interface HistoryEvent { at: string; kind: 'xp' | 'purchase'; amount: number; currency?: 'credits' | 'gems'; categoryId: number | null; source: string; note: string }
export interface HabitStreak {
  id: number; title: string; categoryId: number | null; difficulty: Difficulty; days: string;
  current: number; best: number; done: number; failed: number; rate: number | null;
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
  id: number; title: string; description: string; type: GoalType; categoryId: number | null;
  deadlineAt: string; xp: number; status: 'active' | 'done'; pastDue: boolean; completedAt: string | null;
  reward: number; hasAar: boolean; canUndo: boolean;
}
export interface StoreItem { id: number; name: string; description: string; icon: string; cost: number; currency: 'credits' | 'gems'; lootable: boolean }
export interface Loot { type: LootType; amount: number; itemName?: string }
export interface JournalEntry {
  id: number; date: string; kind: 'note' | 'aar'; goalId: number | null; goalTitle: string | null;
  title: string; body: string; planned: string; happened: string; why: string; next: string; createdAt: string;
}

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
