import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Difficulty, GoalType, LootType, Mood, Rank } from '@shared';

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
}

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
    onSuccess: (state) => qc.setQueryData(['state'], state),
  });
}
