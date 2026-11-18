import { useQueryClient } from '@tanstack/react-query';
import { api, type AppState, type Habit, type Quest } from './api';

// Instant results for complete / fail / undo. The tap writes its result straight into the shared state cache,
// so everything that reads it (the card, its place in the list, the day's count, the XP bar) moves on the same
// frame. The server's reply then replaces the guess with the real numbers (level-ups, streaks, bonuses).
//
// Patches still waiting for their reply are re-applied on top of any state that arrives in the meantime
// (another tap's reply, the 30 s refresh), so nothing flickers back. Each patch skips itself once the server
// state already shows the change, so it never counts twice.

export type Patch = (s: AppState) => AppState;
const pending = new Map<number, Patch>();
let seq = 0;

/** Put the not-yet-confirmed taps on top of a state from the server. */
export const withPending = (s: AppState): AppState => [...pending.values()].reduce((acc, p) => p(acc), s);

export function useOptimisticAction() {
  const qc = useQueryClient();
  return (method: string, path: string, patch: Patch | null, opts: { onSuccess?: () => void; onError?: (e: Error) => void } = {}) => {
    const id = ++seq;
    if (patch) {
      void qc.cancelQueries({ queryKey: ['state'] }); // an older refresh must not land on top
      pending.set(id, patch);
      qc.setQueryData<AppState>(['state'], (s) => s && patch(s));
    }
    api(method, path).then(
      (state) => {
        pending.delete(id);
        qc.setQueryData(['state'], withPending(state));
        void qc.invalidateQueries({ queryKey: ['archive'] });
        opts.onSuccess?.();
      },
      (e: Error) => {
        pending.delete(id);
        void qc.invalidateQueries({ queryKey: ['state'] }); // back to the truth (keeps other pending taps)
        opts.onError?.(e);
      },
    );
  };
}

// ---------------------------------------------------------------- the guesses

/** Move a level bar by `xp`, unless that crosses a level boundary (the server works those out). */
function bar<T extends { into: number; need: number; pct: number }>(b: T, xp: number): T {
  const into = b.into + xp;
  return into >= 0 && into < b.need ? { ...b, into, pct: into / b.need } : b;
}

function gainXp(s: AppState, xp: number, categoryIds: number[]): AppState {
  return {
    ...s,
    progress: { ...bar(s.progress, xp), totalXp: s.progress.totalXp + xp },
    categories: s.categories.map((c) => (categoryIds.includes(c.id) ? { ...bar(c, xp), xp: c.xp + xp } : c)),
  };
}

function dayDone(s: AppState, delta: number): AppState {
  const t = s.streak.today;
  const done = Math.max(0, t.done + delta);
  const total = Math.max(t.total, done);
  return { ...s, streak: { ...s.streak, today: { ...t, done, total, ratio: total ? done / total : 0 } } };
}

const setHabit = (s: AppState, id: number, f: (h: Habit) => Habit): AppState => ({ ...s, habits: s.habits.map((h) => (h.id === id ? f(h) : h)) });
const setQuest = (s: AppState, id: number, f: (q: Quest) => Quest): AppState => ({ ...s, quests: s.quests.map((q) => (q.id === id ? f(q) : q)) });

export const habitPatch = (id: number, outcome: 'done' | 'failed'): Patch => (s) => {
  const h = s.habits.find((x) => x.id === id);
  if (!h || h.log) return s;
  const xp = outcome === 'done' ? h.xpGain : -h.xpLoss;
  const next = setHabit(gainXp(s, xp, h.categoryIds), id, (x) => ({ ...x, log: { status: outcome, xp, pending: true } }));
  return outcome === 'done' ? dayDone(next, 1) : next;
};

export const habitUndoPatch = (id: number): Patch => (s) => {
  const h = s.habits.find((x) => x.id === id);
  if (!h?.log) return s;
  const next = setHabit(gainXp(s, -h.log.xp, h.categoryIds), id, (x) => ({ ...x, log: null }));
  return h.log.status === 'done' ? dayDone(next, -1) : next;
};

export const questPatch = (id: number, outcome: 'done' | 'failed'): Patch => (s) => {
  const q = s.quests.find((x) => x.id === id);
  if (!q || q.status !== 'pending') return s;
  const xp = outcome === 'done' ? q.xp : -q.xp;
  let next = setQuest(gainXp(s, xp, q.categoryIds), id, (x) => ({ ...x, status: outcome, canUndo: false }));
  if (outcome === 'done') next = dayDone({ ...next, wallet: { ...next.wallet, credits: next.wallet.credits + q.credits } }, 1);
  return next;
};

export const questRemovePatch = (id: number): Patch => (s) => ({ ...s, quests: s.quests.filter((q) => q.id !== id) });
