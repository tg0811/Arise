import { useEffect, useState } from 'react';

export function formatLeft(ms: number): string {
  if (ms <= 0) return 'Expired';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms / 3_600_000) % 24);
  const m = Math.floor((ms / 60_000) % 60);
  const s = Math.floor((ms / 1000) % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

/** Live ticking countdown; turns urgent under an hour. */
export function Countdown({ to, onExpire }: { to: string; onExpire?: () => void }) {
  const [left, setLeft] = useState(() => Date.parse(to) - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const l = Date.parse(to) - Date.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [to, onExpire]);
  const urgent = left < 3_600_000;
  return <span className={`font-mono text-xs font-bold tabular-nums ${urgent ? 'text-bad' : 'text-ink2'}`}>{formatLeft(left)}</span>;
}
