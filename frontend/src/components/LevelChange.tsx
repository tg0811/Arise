import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RANKS, type Rank } from '@shared';
import type { AppState } from '../lib/api';
import { RANK_COLORS, rankColor } from '../lib/theme';
import { sfx } from '../lib/sound';
import { GenerativeArt } from './fx';
import { SRankCutscene } from './SRankCutscene';
import { useCelebrationsHeld } from '../lib/celebrate';

const SRANK_SEEN = 'sl-srank-seen';
const seenSRank = () => { try { return localStorage.getItem(SRANK_SEEN) === '1'; } catch { return false; } };

type Change = { kind: 'up' | 'down'; level: number; rank: Rank; title: string; rankChanged: boolean };
/** A detected change waiting to be shown (while e.g. the Random Box reveal is on screen). */
type Pending = { change: Change; cutscene: boolean };

/**
 * Watches level/rank between state updates and plays a full-screen splash over LevelUp-style
 * generative art, with sound. Reaching S-rank for the first time plays the cutscene instead.
 */
export function LevelChange({ s }: { s: AppState | undefined }) {
  const prev = useRef<{ level: number; rank: Rank } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [cutscene, setCutscene] = useState(false);
  const held = useCelebrationsHeld();

  useEffect(() => {
    if (!s) return;
    const cur = { level: s.progress.level, rank: s.progress.rank };
    const p = prev.current;
    prev.current = cur;
    if (!p || p.level === cur.level) return;
    const kind = cur.level > p.level ? 'up' : 'down';
    // Several changes while held merge into one: the latest level, and a rank change if any happened.
    setPending((old) => {
      const rankChanged = p.rank !== cur.rank || !!old?.change.rankChanged;
      const cutscene = (kind === 'up' && p.rank !== cur.rank && cur.rank === 'S' && !seenSRank()) || !!old?.cutscene;
      return { change: { kind, level: cur.level, rank: cur.rank, title: s.progress.title, rankChanged }, cutscene };
    });
  }, [s]);

  // Play it once nothing else is on screen.
  useEffect(() => {
    if (!pending || held) return;
    setPending(null);
    const c = pending.change;
    if (pending.cutscene) {
      sfx.rankUp();
      setCutscene(true);
      return;
    }
    if (c.kind === 'down') sfx.fall();
    else if (c.rankChanged) sfx.rankUp();
    else sfx.levelUp();
    setChange(c);
  }, [pending, held]);

  useEffect(() => {
    if (!change) return;
    const t = setTimeout(() => setChange(null), change.rankChanged ? 6500 : 4500);
    return () => clearTimeout(t);
  }, [change]);

  const up = change?.kind === 'up';
  if (cutscene && s) {
    return <SRankCutscene name={s.profile.name} level={s.progress.level} onDone={() => {
      try { localStorage.setItem(SRANK_SEEN, '1'); } catch { /* replays next time: fine */ }
      setCutscene(false);
    }} />;
  }
  return (
    <AnimatePresence>
      {change && (
        <motion.div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/85 px-6 text-center backdrop-blur-md"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setChange(null)}>
          {up && (
            <GenerativeArt
              color={change.rankChanged ? rankColor(change.rank) : '#3b82f6'}
              color2={change.rankChanged ? RANK_COLORS[change.rank].glow : '#22d3ee'} />
          )}
          <motion.div className="absolute h-72 w-72 rounded-full"
            style={{ background: `radial-gradient(circle, ${!up ? 'rgba(248,113,113,.35)' : change.rankChanged ? `color-mix(in srgb, ${rankColor(change.rank)} 55%, transparent)` : 'color-mix(in srgb, var(--sl-accent) 55%, transparent)'}, transparent 70%)` }}
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
              <div className="font-display text-8xl font-bold text-glow" style={{ color: rankColor(change.rank) }}>{change.rank}</div>
              <div className="mt-1 font-display text-xl font-bold tracking-[0.25em]" style={{ color: RANK_COLORS[change.rank].glow }}>{change.title.toUpperCase()}</div>
              {!up && <div className="mt-2 text-sm text-ink2">Reclaim it. {RANKS.find((r) => r.rank === change.rank)?.title} is not your ceiling.</div>}
            </motion.div>
          )}
          <p className="absolute bottom-10 text-xs text-muted">Tap to continue</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
