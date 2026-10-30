import { useEffect, useRef } from 'react';
import type { AppState } from '../lib/api';
import { useToast } from './ui';

/** Toasts when a title is newly earned (compares unlocked titles between state updates). */
export function TitleWatcher({ s }: { s: AppState }) {
  const toast = useToast();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const unlocked = s.titles.filter((t) => t.unlocked);
    if (seen.current) {
      for (const t of unlocked) if (!seen.current.has(t.key)) toast(`Title unlocked: ${t.name}`, 'good');
    }
    seen.current = new Set(unlocked.map((t) => t.key));
  }, [s.titles, toast]);
  return null;
}
