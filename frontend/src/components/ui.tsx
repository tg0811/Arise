import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  Brain, Dumbbell, Sparkles, BookOpen, Smartphone, Wallet, Heart, Flame, Music, Code, Palette, Users,
  Moon, Sun, Coffee, Leaf, Target, Trophy, PenTool, Briefcase, Bed, Droplet, Footprints, Swords,
  Gift, Tv, Gamepad2, Film, Pizza, IceCream, Plane, Headphones, Shirt, ShoppingBag, type LucideIcon,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  brain: Brain, dumbbell: Dumbbell, sparkles: Sparkles, 'book-open': BookOpen, smartphone: Smartphone, wallet: Wallet,
  heart: Heart, flame: Flame, music: Music, code: Code, palette: Palette, users: Users, moon: Moon, sun: Sun,
  coffee: Coffee, leaf: Leaf, target: Target, trophy: Trophy, 'pen-tool': PenTool, briefcase: Briefcase,
  bed: Bed, droplet: Droplet, footprints: Footprints, swords: Swords,
};

/** Icons for store rewards (a superset: rewards can also use category icons). */
export const REWARD_ICONS: Record<string, LucideIcon> = {
  gift: Gift, coffee: Coffee, tv: Tv, gamepad: Gamepad2, film: Film, pizza: Pizza, 'ice-cream': IceCream,
  plane: Plane, headphones: Headphones, shirt: Shirt, bag: ShoppingBag, music: Music, 'book-open': BookOpen, moon: Moon,
};

export const RewardIcon = ({ name, size = 18, className }: { name: string; size?: number; className?: string }) => {
  const Icon = REWARD_ICONS[name] ?? CATEGORY_ICONS[name] ?? Gift;
  return <Icon size={size} className={className} />;
};

/** Segmented tab switcher used by multi-section pages. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mt-3 flex gap-1 rounded-xl border border-line p-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-black uppercase tracking-[0.12em] transition ${value === t.id ? 'bg-accent/20 text-ink' : 'text-muted hover:text-ink2'}`}>
          {t.label}
          {!!t.badge && <span className="rounded-full bg-accent px-1.5 text-[10px] text-white">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export const CategoryIcon = ({ name, size = 14, className }: { name: string; size?: number; className?: string }) => {
  const Icon = CATEGORY_ICONS[name] ?? Target;
  return <Icon size={size} className={className} />;
};

/** Glass panel (LevelUp) with corner brackets (THE-SYSTEM). */
export function Panel({ children, className = '', brackets = true }: { children: ReactNode; className?: string; brackets?: boolean }) {
  return (
    <div className={`glass relative rounded-2xl ${className}`}>
      {/* One wrapper with m-0: a panel's space-y-* margins must not shift the corners off the border. */}
      {brackets && (
        <span aria-hidden className="pointer-events-none absolute inset-0 m-0">
          <span className="absolute left-1.5 top-1.5 h-3 w-3 rounded-tl-md border-l-2 border-t-2 border-accent/60" />
          <span className="absolute right-1.5 top-1.5 h-3 w-3 rounded-tr-md border-r-2 border-t-2 border-accent/60" />
          <span className="absolute bottom-1.5 left-1.5 h-3 w-3 rounded-bl-md border-b-2 border-l-2 border-accent/60" />
          <span className="absolute bottom-1.5 right-1.5 h-3 w-3 rounded-br-md border-b-2 border-r-2 border-accent/60" />
        </span>
      )}
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center gap-3">
      <h2 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-ink2">{children}</h2>
      <div className="h-px flex-1 bg-gradient-to-r from-accent/40 to-transparent" />
      {right}
    </div>
  );
}

export function ProgressBar({ pct, color, className = 'h-2' }: { pct: number; color?: string; className?: string }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-black/30 ${className}`}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color ?? 'linear-gradient(90deg, var(--sl-accent), var(--sl-accent2))', boxShadow: '0 0 12px color-mix(in srgb, var(--sl-accent) 60%, transparent)' }}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }}
        transition={{ type: 'spring', stiffness: 80, damping: 18 }}
      />
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', disabled, className = '', type = 'button' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'good' | 'bad'; disabled?: boolean; className?: string; type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'text-white bg-[linear-gradient(90deg,var(--sl-accent),var(--sl-accent2))] shadow-[0_0_18px_color-mix(in_srgb,var(--sl-accent)_45%,transparent)]',
    ghost: 'border border-line text-ink2 hover:bg-white/5 hover:text-ink',
    good: 'border border-good/40 bg-good/10 text-good hover:bg-good/20',
    bad: 'border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold tracking-wide transition active:scale-95 disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}>
      {children}
    </button>
  );
}

/** Bottom sheet on mobile, centered dialog on desktop. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="glass safe-bottom max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-panel p-5 sm:max-w-lg sm:rounded-3xl"
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold tracking-wider">{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1.5 text-ink2 hover:bg-white/5" aria-label="Close"><X size={20} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- toasts

type Toast = { id: number; text: string; tone: 'info' | 'good' | 'bad' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col-reverse items-center gap-2 px-4 md:bottom-8">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className={`glass rounded-xl px-4 py-2.5 text-sm font-semibold ${t.tone === 'good' ? 'text-good' : t.tone === 'bad' ? 'text-bad' : 'text-ink'}`}>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
