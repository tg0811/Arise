import { useState } from 'react';
import { CalendarDays, Pause as PauseIcon, Play } from 'lucide-react';
import { PAUSE_MAX_DAYS, addDays, type Pause } from '@shared';
import { formatDate, formatDay } from '../lib/time';
import { Button } from './ui';

// Pause something for a date range (travel, illness): nothing is due, no XP moves, streaks skip it.
// Used by a habit's details and by the Instant Dungeon's plan. The rules live in the engine (planPause).

/** Days from `a` to `b`, both included. */
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

/** Desktop browsers only focus a date input on click (the picker opens from its hidden icon): open it explicitly. */
export const openPicker = (e: React.MouseEvent<HTMLInputElement>) => {
  try { e.currentTarget.showPicker?.(); } catch { /* not allowed here: the native behaviour still applies */ }
};

/** A dd-mm-yyyy label with the phone's native date picker invisibly on top of it. */
function DateField({ label, value, min, max, onChange, placeholder }: { label: string; value: string; min: string; max: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className={`relative flex flex-1 flex-col rounded-xl border px-3 py-2 ${value ? 'border-accent/60' : 'border-line'}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className={`flex items-center gap-1.5 text-sm font-bold ${value ? 'text-ink' : 'text-muted'}`}>
        <CalendarDays size={13} /> {value ? formatDate(value) : placeholder}
      </span>
      <input type="date" aria-label={label} value={value} min={min} max={max}
        onChange={(e) => onChange(e.target.value)} onClick={openPicker} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </label>
  );
}

export function PauseControl({ what, pause, pausedToday, today, busy, onSave, onEnd }: {
  /** "this habit" / "the dungeon", for the copy */
  what: string; pause: Pause | null; pausedToday: boolean; today: string; busy?: boolean;
  onSave: (from: string, to: string) => void; onEnd: () => void;
}) {
  const tomorrow = addDays(today, 1);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(pause && !pausedToday ? pause.from : tomorrow);
  const [to, setTo] = useState(pause && !pausedToday ? pause.to ?? '' : '');
  const [missing, setMissing] = useState(false);
  const [clamped, setClamped] = useState(false);

  // Phones ignore the picker's min/max, so dates are corrected here: never before tomorrow, never longer than the cap.
  const lastDay = (f: string) => addDays(f, PAUSE_MAX_DAYS - 1);
  const pickFrom = (raw: string) => {
    if (!raw) return;
    const f = raw < tomorrow ? tomorrow : raw;
    setFrom(f);
    setMissing(false);
    if (to && to < f) { setTo(''); setClamped(false); }
    else if (to && to > lastDay(f)) { setTo(lastDay(f)); setClamped(true); }
  };
  const pickTo = (raw: string) => {
    if (!raw) return;
    const f = from || tomorrow;
    let t = raw < f ? f : raw;
    const over = t > lastDay(f);
    if (over) t = lastDay(f);
    setTo(t);
    setClamped(over);
    setMissing(false);
  };

  if (pause && pausedToday) {
    return (
      <div className="rounded-xl border border-accent/40 bg-accent/10 p-3">
        <p className="flex items-center gap-1.5 text-sm font-bold"><PauseIcon size={14} className="text-accent" /> Paused until {formatDay(pause.to!)}</p>
        <p className="mt-0.5 text-xs text-ink2">Nothing is due and no XP moves. The streak waits for you.</p>
        <Button variant="ghost" className="mt-2 w-full" disabled={busy}
          onClick={() => confirm(`Resume ${what} now? It counts again from today.`) && onEnd()}>
          <Play size={14} /> Resume from today
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <div>
        {pause ? (
          <div className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm">
            <PauseIcon size={14} className="text-accent" />
            <span className="flex-1">Pauses {formatDay(pause.from)} → {formatDay(pause.to!)}</span>
            <button className="text-xs font-bold text-accent" onClick={() => setOpen(true)}>Change</button>
            <button className="text-xs font-bold text-muted hover:text-bad" disabled={busy} onClick={onEnd}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm font-bold text-ink2 hover:border-accent hover:text-ink">
            <PauseIcon size={14} /> Pause for a while
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-2 text-sm font-bold">Pause {what}</p>
      <div className="flex gap-2">
        <DateField label="From" value={from} min={tomorrow} max={addDays(today, 366)} placeholder="Pick" onChange={pickFrom} />
        <DateField label="Until (incl.)" value={to} min={from || tomorrow} max={addDays(from || tomorrow, PAUSE_MAX_DAYS - 1)} onChange={pickTo} placeholder="Pick" />
      </div>
      {from && to && <p className="mt-2 text-sm font-semibold">{days(from, to)} day{days(from, to) === 1 ? '' : 's'} paused</p>}
      {clamped && <p className="mt-1 text-xs font-semibold text-gold">Maximum {PAUSE_MAX_DAYS}-day pause allowed</p>}
      {missing && <p className="mt-1 text-xs font-semibold text-bad">Pick {!from ? 'the first' : 'the last'} day of the pause</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>Back</Button>
        <Button className="flex-[2]" disabled={busy} onClick={() => {
          if (!from || !to) return setMissing(true); // say what's missing rather than a dead, greyed-out button
          onSave(from, to); setOpen(false);
        }}>
          <PauseIcon size={14} /> Pause
        </Button>
      </div>
    </div>
  );
}
