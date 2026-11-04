import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { GenerativeArt } from '../../components/fx';

// The Instant Dungeon's own effects (used only inside the dungeon): extra violet embers, and the full-screen
// "cleared" splash for a finished workout or a recorded run.

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const EMBER_COUNT = 24; // on top of the rank embers, so the dungeon has a few more
const EMBER_COLORS = ['#8b5cf6', '#a78bfa', '#818cf8'];

/** Violet embers drifting up, a little brighter and slower than the rank ones. */
export function DungeonEmbers() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reducedMotion()) return;
    const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0, raf = 0, t = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const ps = Array.from({ length: EMBER_COUNT }, () => ({
      x: rand(0, w), y: rand(0, h), r: rand(0.8, 2), v: rand(0.12, 0.35), ph: rand(0, 6.3), c: EMBER_COLORS[Math.floor(rand(0, EMBER_COLORS.length))],
    }));
    const loop = () => {
      if (!document.hidden) {
        ctx.clearRect(0, 0, w, h);
        for (const p of ps) {
          p.y -= p.v; p.x += Math.sin(t * 0.01 + p.ph) * 0.2;
          if (p.y < -5) { p.y = h + 5; p.x = rand(0, w); }
          ctx.globalAlpha = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.02 + p.ph));
          ctx.shadowBlur = 6; ctx.shadowColor = p.c;
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        t++;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" style={{ zIndex: -1 }} />;
}

/** Full-screen "cleared" moment. Tap (or wait) to close. Render inside <AnimatePresence>. */
export function ClearSplash({ kicker, title, detail, rewards, onClose }: {
  kicker: string; title: string; detail?: ReactNode; rewards?: string[]; onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4200);
    return () => clearTimeout(t);
  }, [onClose]);
  const still = reducedMotion();

  // Portalled to <body>, so no animated parent can trap the fixed overlay.
  return createPortal(
    <motion.div role="dialog" aria-label={title} onClick={onClose}
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden bg-[#05030b]/95 px-6 text-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      {!still && <GenerativeArt color="#8b5cf6" color2="#818cf8" sim={0} />}

      {/* A System sigil: two squares turning against each other, with a flash as it lands */}
      <div className="relative mb-8 h-28 w-28">
        {!still && (
          <motion.span className="absolute inset-0 rounded-full bg-[#8b5cf6]/40 blur-2xl"
            initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: [0.2, 1.6, 1], opacity: [0, 1, 0.5] }} transition={{ duration: 0.9 }} />
        )}
        <motion.span className="absolute inset-2 border-2 border-[#a78bfa] shadow-[0_0_24px_rgba(139,92,246,.7)]"
          initial={{ rotate: -90, scale: 0.3, opacity: 0 }} animate={{ rotate: 45, scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: 'easeOut' }} />
        <motion.span className="absolute inset-5 border border-[#818cf8]/80"
          initial={{ rotate: 90, scale: 0.3, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }} />
        <motion.span className="absolute inset-[42%] bg-[#f4f2ff] shadow-[0_0_18px_#a78bfa]"
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6, type: 'spring', stiffness: 300 }} />
      </div>

      <motion.p className="relative font-display text-xs font-bold uppercase tracking-[0.4em] text-[#a78bfa]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
        [ {kicker} ]
      </motion.p>
      <motion.h2 className="relative mt-3 font-display text-4xl font-bold text-[#f4f2ff] [text-shadow:0_0_22px_rgba(139,92,246,.8)]"
        initial={{ opacity: 0, letterSpacing: '0.05em' }} animate={{ opacity: 1, letterSpacing: '0.25em' }} transition={{ delay: 0.45, duration: 0.7 }}>
        {title}
      </motion.h2>
      {detail && (
        <motion.p className="relative mt-3 text-sm text-[#b6aed6]" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          {detail}
        </motion.p>
      )}
      {rewards && rewards.length > 0 && (
        <div className="relative mt-6 flex gap-3">
          {rewards.map((r, i) => (
            <motion.span key={r} className="border border-[#8b5cf6]/60 bg-[#8b5cf6]/15 px-3 py-1.5 font-display text-lg font-bold text-[#f4f2ff] shadow-[0_0_14px_rgba(139,92,246,.4)]"
              initial={{ opacity: 0, y: 14, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 1.05 + i * 0.15, type: 'spring', stiffness: 260 }}>
              {r}
            </motion.span>
          ))}
        </div>
      )}
      <p className="absolute bottom-10 text-xs text-[#7a719c]">Tap to continue</p>
    </motion.div>,
    document.body,
  );
}
