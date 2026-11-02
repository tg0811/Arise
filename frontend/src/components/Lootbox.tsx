import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Gift, Lock, Coins, Gem, Sparkles, Package } from 'lucide-react';
import { DAY_CLEAR_RATIO, lootStreakBonus } from '@shared';
import { useAction, type AppState, type Loot } from '../lib/api';
import { useToast } from './ui';
import { sfx } from '../lib/sound';
import { holdCelebrations } from '../lib/celebrate';

const LOOT_VIEW = {
  credits: { icon: Coins, color: 'text-gold', label: (l: Loot) => `${l.amount} Credits` },
  xp: { icon: Sparkles, color: 'text-accent', label: (l: Loot) => `${l.amount} XP` },
  gems: { icon: Gem, color: 'text-accent2', label: (l: Loot) => `${l.amount} Gem${l.amount > 1 ? 's' : ''}` },
  item: { icon: Package, color: 'text-good', label: (l: Loot) => l.itemName ?? 'An item' },
};

/** The Random Box (the Daily Quest reward): locked until the day is 80% cleared, then one open per day. */
export function LootboxButton({ s }: { s: AppState }) {
  const action = useAction();
  const toast = useToast();
  const [reveal, setReveal] = useState<Loot | null>(null);
  // XP from the box can level you up: hold that celebration until the reward has been seen.
  const release = useRef<(() => void) | null>(null);
  const close = () => { setReveal(null); release.current?.(); release.current = null; };
  const { available, claimed } = s.lootbox;
  const bonus = lootStreakBonus(s.streak.current);

  const open = () => {
    release.current = holdCelebrations(); // before the request: the new level arrives with the reward
    action.mutate({ path: '/lootbox/open' }, {
      onSuccess: (st) => {
        if (!st.loot) return close();
        sfx.loot();
        setReveal(st.loot);
      },
      onError: (e) => { close(); toast(e.message, 'bad'); },
    });
  };

  let content;
  if (claimed) {
    const v = LOOT_VIEW[claimed.type];
    content = (
      <span className="flex items-center gap-1.5 text-xs font-bold text-ink2">
        <v.icon size={14} className={v.color} /> Today: {v.label(claimed)}
      </span>
    );
  } else if (available) {
    content = (
      <button onClick={open} disabled={action.isPending}
        className="pulse-glow flex items-center gap-1.5 rounded-xl border border-gold/50 bg-gold/15 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-gold">
        <Gift size={15} /> Open Random Box
      </button>
    );
  } else {
    content = (
      <span className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted">
        <Lock size={13} /> {Math.round(DAY_CLEAR_RATIO * 100)}% unlocks the Random Box
      </span>
    );
  }

  return (
    <>
      {content}
      <AnimatePresence>
        {reveal && (
          <motion.div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/85 px-6 text-center backdrop-blur-md"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
            <motion.div initial={{ scale: 0.3, rotate: -12 }} animate={{ scale: [0.3, 1.15, 1], rotate: [-12, 8, 0] }} transition={{ duration: 0.9 }}
              className="relative flex h-32 w-32 items-center justify-center rounded-3xl border-2 border-gold/60 bg-gold/10 shadow-[0_0_60px_rgba(234,179,8,.45)]">
              {(() => { const V = LOOT_VIEW[reveal.type].icon; return <V size={56} className={LOOT_VIEW[reveal.type].color} />; })()}
            </motion.div>
            <motion.p className="label mt-8 !text-gold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>[ Daily Quest complete · Random Box ]</motion.p>
            <motion.h2 className={`mt-2 font-display text-4xl font-black text-glow ${LOOT_VIEW[reveal.type].color}`}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
              {LOOT_VIEW[reveal.type].label(reveal)}
            </motion.h2>
            {reveal.type === 'item' && <motion.p className="mt-2 text-sm text-ink2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>Added to your inventory.</motion.p>}
            {bonus > 0 && (reveal.type === 'credits' || reveal.type === 'xp') && (
              <motion.p className="mt-2 text-sm text-gold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
                Includes +{Math.round(bonus * 100)}% streak bonus
              </motion.p>
            )}
            <p className="absolute bottom-10 text-xs text-muted">Tap to continue</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
