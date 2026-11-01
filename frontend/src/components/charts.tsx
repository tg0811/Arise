import { useState } from 'react';
import { DAY_CLEAR_RATIO } from '@shared';
import type { DayStat } from '../lib/api';
import { formatDay, weekdayName } from '../lib/time';

// Charts for the Archive. Built from plain HTML so they inherit the app's fonts and themes.
// Colour jobs: heatmap = sequential (one blue hue, brighter = more done);
// weekly XP = diverging polarity (gained ↑ blue, lost ↓ red; direction also encodes it).

const GAIN = '#3b82f6';
const LOSS = '#ef4444';

const dayLabel = (date: string) => formatDay(date);

const Swatch = ({ color }: { color: string }) => <span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: color }} />;

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// ---------------------------------------------------------------- heatmap

/** Sequential blue ramp on the dark surface: dim → bright as completion rises. */
const HEAT_STEPS = [
  { min: 1, color: '#bfdbfe', label: 'All done' },
  { min: DAY_CLEAR_RATIO, color: '#60a5fa', label: `≥${Math.round(DAY_CLEAR_RATIO * 100)}% (cleared)` },
  { min: 0.4, color: '#2563eb', label: '40–79%' },
  { min: 0.0001, color: '#1e40af', label: '1–39%' },
  { min: 0, color: '#172554', label: 'Nothing done' },
];

function heatColor(d: DayStat): string | null {
  if (d.total === 0) return null;
  const r = d.done / d.total;
  return HEAT_STEPS.find((s) => r >= s.min)!.color;
}

export function Heatmap({ days }: { days: DayStat[] }) {
  const [sel, setSel] = useState<DayStat>(days[days.length - 1]);
  // Monday-first calendar grid; pad so the first day lands on its weekday column.
  const lead = (new Date(days[0].date + 'T12:00:00').getDay() + 6) % 7;
  const cells: (DayStat | null)[] = [...Array(lead).fill(null), ...days];

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-muted">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="img" aria-label="Task completion for the last 28 days">
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const color = heatColor(d);
          const active = sel?.date === d.date;
          return (
            <button key={d.date} onMouseEnter={() => setSel(d)} onFocus={() => setSel(d)} onClick={() => setSel(d)}
              aria-label={`${dayLabel(d.date)}: ${d.done} of ${d.total} tasks`}
              className={`aspect-square rounded-md transition ${active ? 'ring-2 ring-ink/80 ring-offset-2 ring-offset-panel' : ''}`}
              style={color ? { background: color } : { border: '1px solid var(--sl-line)' }} />
          );
        })}
      </div>
      {sel && (
        <p className="mt-3 text-sm text-ink2">
          <span className="font-semibold text-ink">{dayLabel(sel.date)}</span>
          {' · '}{sel.total ? `${sel.done} of ${sel.total} tasks` : 'no tasks'}
          {(sel.gained > 0 || sel.lost > 0) && <> · <Swatch color={GAIN} /> +{sel.gained}{sel.lost > 0 && <> <Swatch color={LOSS} /> −{sel.lost}</>} XP</>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink2">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-line" /> No tasks</span>
        {[...HEAT_STEPS].reverse().map((s) => (
          <span key={s.label} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Last 28 days</caption>
        <thead><tr><th>Date</th><th>Done</th><th>Total</th><th>XP gained</th><th>XP lost</th></tr></thead>
        <tbody>{days.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.done}</td><td>{d.total}</td><td>{d.gained}</td><td>{d.lost}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- weekly XP

const PLOT_H = 150;

export function WeekXpChart({ days }: { days: DayStat[] }) {
  const [sel, setSel] = useState<DayStat>(days[days.length - 1]);
  const maxGain = Math.max(0, ...days.map((d) => d.gained));
  const maxLoss = Math.max(0, ...days.map((d) => d.lost));
  if (maxGain === 0 && maxLoss === 0) {
    return <p className="py-8 text-center text-sm text-muted">No XP moved this week yet.</p>;
  }
  // One shared scale for both directions, so a 50 gained and a 50 lost are the same length.
  const unit = PLOT_H / (maxGain + maxLoss);
  const net = sel.gained - sel.lost;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm text-ink2"><span className="font-semibold text-ink">{dayLabel(sel.date)}</span></span>
        <span className="text-sm text-ink2">
          <Swatch color={GAIN} /> +{sel.gained} <Swatch color={LOSS} /> {sel.lost ? `−${sel.lost}` : '0'} · net <span className="font-bold text-ink">{signed(net)}</span>
        </span>
      </div>
      <div className="relative" style={{ height: PLOT_H }} role="img" aria-label="XP gained and lost per day this week">
        {/* zero baseline, with the scale's extremes as the only ticks */}
        <div className="absolute inset-x-0 border-t border-line" style={{ top: maxGain * unit }} />
        {maxGain > 0 && <span className="absolute left-0 top-0 text-[10px] tabular-nums text-muted">+{maxGain}</span>}
        {maxLoss > 0 && <span className="absolute bottom-0 left-0 text-[10px] tabular-nums text-muted">−{maxLoss}</span>}
        <div className="absolute inset-0 flex pl-8">
          {days.map((d) => {
            const active = sel.date === d.date;
            return (
              <button key={d.date} onMouseEnter={() => setSel(d)} onFocus={() => setSel(d)} onClick={() => setSel(d)}
                aria-label={`${dayLabel(d.date)}: gained ${d.gained}, lost ${d.lost}`}
                className={`relative flex-1 rounded-lg transition ${active ? 'bg-white/[0.04]' : ''}`}>
                {d.gained > 0 && (
                  <span className="absolute left-1/2 w-[min(24px,60%)] -translate-x-1/2 rounded-t-[4px]"
                    style={{ bottom: PLOT_H - maxGain * unit + 1, height: d.gained * unit - 1, background: GAIN, opacity: active ? 1 : 0.8 }} />
                )}
                {d.lost > 0 && (
                  <span className="absolute left-1/2 w-[min(24px,60%)] -translate-x-1/2 rounded-b-[4px]"
                    style={{ top: maxGain * unit + 1, height: d.lost * unit - 1, background: LOSS, opacity: active ? 1 : 0.8 }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex pl-8">
        {days.map((d) => (
          <span key={d.date} className={`flex-1 text-center text-[11px] font-bold ${sel.date === d.date ? 'text-ink' : 'text-muted'}`}>
            {weekdayName(d.date, 'narrow')}
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-ink2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GAIN }} /> XP gained</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: LOSS }} /> XP lost</span>
      </div>
      <table className="sr-only">
        <caption>XP this week</caption>
        <thead><tr><th>Date</th><th>Gained</th><th>Lost</th><th>Net</th></tr></thead>
        <tbody>{days.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.gained}</td><td>{d.lost}</td><td>{d.gained - d.lost}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
