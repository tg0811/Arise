import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RANKS, type Rank } from '@shared';
import type { AppState } from '../lib/api';

type Change = { kind: 'up' | 'down'; level: number; rank: Rank; title: string; rankChanged: boolean };

/**
 * Watches level/rank between state updates and plays a full-screen splash.
 * Phase 4 will swap the backdrop for LevelUp's generative art + sound.
 */
export function LevelChange({ s }: { s: AppState | undefined }) {
  const prev = useRef<{ level: number; rank: Rank } | null>(null);
  const [change, setChange] = useState<Change | null>(null);

  useEffect(() => {
    if (!s) return;
    const cur = { level: s.progress.level, rank: s.progress.rank };
    const p = prev.current;
    prev.current = cur;
    if (!p || p.level === cur.level) return;
    setChange({ kind: cur.level > p.level ? 'up' : 'down', level: cur.level, rank: cur.rank, title: s.progress.title, rankChanged: p.rank !== cur.rank });
  }, [s]);

  useEffect(() => {
    if (!change) return;
    const t = setTimeout(() => setChange(null), change.rankChanged ? 5500 : 3500);
    return () => clearTimeout(t);
  }, [change]);

  const up = change?.kind === 'up';
  return (
    <AnimatePresence>
      {change && (
        <motion.div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/85 px-6 text-center backdrop-blur-md"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setChange(null)}>
          <motion.div className="absolute h-72 w-72 rounded-full"
            style={{ background: `radial-gradient(circle, ${up ? 'color-mix(in srgb, var(--sl-accent) 55%, transparent)' : 'rgba(248,113,113,.35)'}, transparent 70%)` }}
            initial={{ scale: 0.2 }} animate={{ scale: [0.2, 1.4, 1.1] }} transition={{ duration: 1.4 }} />
          <motion.p className="label relative mb-3 !text-ink2" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
            {up ? (change.rankChanged ? 'Rank ascension' : 'Level achieved') : change.rankChanged ? 'Rank lost' : 'Level lost'}
          </motion.p>
          <motion.h2 className={`relative font-display text-6xl font-black tracking-wider text-glow ${up ? 'text-accent' : 'text-bad'}`}
            initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, delay: 0.3 }}>
            {up ? 'LEVEL UP' : 'FALLEN'}
          </motion.h2>
          <motion.p className="relative mt-4 font-display text-3xl font-bold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            Level {change.level}
          </motion.p>
          {change.rankChanged && (
            <motion.div className="relative mt-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}>
              <div className="font-display text-7xl font-black text-accent2 text-glow">{change.rank}</div>
              <div className="mt-1 font-display text-lg tracking-[0.25em] text-ink">{change.title.toUpperCase()}</div>
              {!up && <div className="mt-2 text-sm text-ink2">Reclaim it. {RANKS.find((r) => r.rank === change.rank)?.title} is not your ceiling.</div>}
            </motion.div>
          )}
          <p className="absolute bottom-10 text-xs text-muted">Tap to continue</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
