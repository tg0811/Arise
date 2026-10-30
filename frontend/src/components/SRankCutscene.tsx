import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RANK_COLORS } from '../lib/theme';
import { GenerativeArt } from './fx';

// THE-SYSTEM's S-rank cinematic: six frames, tap to advance. Plays the first time you reach S.

export function SRankCutscene({ name, level, onDone }: { name: string; level: number; onDone: () => void }) {
  const [i, setI] = useState(0);
  const { main, glow } = RANK_COLORS.S;
  const frames = [
    'THE SYSTEM HAS RENDERED\nITS VERDICT.',
    `${level} LEVELS.\nEVERY ONE OF THEM EARNED.`,
    'THE BODY WAS FORGED.\nTHE MIND WAS TEMPERED.',
    'YOU KEPT THE PROMISES\nNO ONE ELSE COULD SEE.',
    'YOU ARE NO LONGER\nWHO YOU WERE.',
    `${name.toUpperCase()}.\nYOU ARE TRANSCENDENT.`,
  ];
  const last = i === frames.length - 1;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-[#020617] px-8 text-center" onClick={() => (last ? undefined : setI(i + 1))}>
      <GenerativeArt color={main} color2={glow} />
      <p className="label relative mb-8 !text-muted">Frame {['I', 'II', 'III', 'IV', 'V', 'VI'][i]}</p>
      <AnimatePresence mode="wait">
        <motion.p key={i} className="relative whitespace-pre-line font-display text-3xl font-bold leading-snug tracking-[0.12em] text-glow"
          style={{ color: last ? main : '#f8fafc' }}
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.9 }}>
          {frames[i]}
        </motion.p>
      </AnimatePresence>
      {last && (
        <motion.div className="relative mt-10" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1 }}>
          <div className="font-display text-8xl font-bold text-glow" style={{ color: main }}>S</div>
          <div className="mt-1 font-display text-xl font-bold tracking-[0.3em]" style={{ color: glow }}>THE TRANSCENDENT</div>
          <button onClick={onDone} className="mt-8 rounded-xl border px-6 py-3 font-display text-sm font-bold tracking-[0.2em]"
            style={{ borderColor: main, color: glow, background: `${main}22` }}>
            ACCEPT YOUR DESTINY
          </button>
        </motion.div>
      )}
      {!last && <p className="absolute bottom-10 text-xs text-muted">Tap to continue</p>}
    </div>
  );
}
