import { useSyncExternalStore } from 'react';

// Full-screen moments must not pile up. A reveal with its own animation (the Random Box) holds celebrations
// (level up, rank change, the S-rank cutscene) and releases them when it closes, so they play last.

let holds = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

/** Hold celebrations until the returned release() is called (safe to call twice). */
export function holdCelebrations(): () => void {
  holds++;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    notify();
  };
}

export const useCelebrationsHeld = () =>
  useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => holds > 0);
