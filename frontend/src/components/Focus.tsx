import { useEffect, useState } from 'react';
import { Timer, Check, X } from 'lucide-react';
import { FOCUS_EARLY_BONUS_CAP, FOCUS_MIN_SHARE, FOCUS_PRESETS, focusReward } from '@shared';
import { useAction, type AppState } from '../lib/api';
import { sfx } from '../lib/sound';
import { CategoryPicker, Field } from './TaskForm';
import { Button, ProgressBar, useToast } from './ui';

// Focus timer: start a timed session, finish it for XP (bonus for finishing early).
// The server owns the clock, so the session survives closing the app.

const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Keep the screen on while a session is open (where the browser supports it). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    void acquire();
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); void lock?.release(); };
  }, [active]);
}

/** Live session banner, shown under the header on every page while a session runs. */
export function FocusBar({ s }: { s: AppState }) {
  const f = s.focus;
  const action = useAction();
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  const [confirmQuit, setConfirmQuit] = useState(false);
  useEffect(() => {
    if (!f) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [f]);
  useWakeLock(!!f);
  if (!f) return null;

  const elapsedSec = (now - Date.parse(f.startedAt)) / 1000;
  const plannedSec = f.plannedMin * 60;
  const reward = focusReward(f.plannedMin, elapsedSec / 60);
  const claimableIn = plannedSec * FOCUS_MIN_SHARE - elapsedSec;
  const overtime = elapsedSec > plannedSec;

  const finish = () =>
    action.mutate({ path: '/focus/complete' }, {
      onSuccess: () => { sfx.complete(); toast(`Focus complete: +${reward?.xp ?? 0} XP`, 'good'); },
      onError: (e) => toast(e.message, 'bad'),
    });

  return (
    <div className="glass mt-3 rounded-2xl border-accent/50 p-4 shadow-[0_0_24px_color-mix(in_srgb,var(--sl-accent)_25%,transparent)]">
      <div className="flex items-center gap-3">
        <Timer size={20} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="label">Focus session</p>
          <p className="truncate font-bold">{f.title}</p>
        </div>
        <div className="text-right">
          <div className={`font-display text-3xl font-bold tabular-nums ${overtime ? 'text-gold' : 'text-ink'}`}>
            {overtime ? `+${mmss(elapsedSec - plannedSec)}` : mmss(plannedSec - elapsedSec)}
          </div>
          <div className="text-[11px] text-muted">{overtime ? 'overtime' : `of ${f.plannedMin}:00`}</div>
        </div>
      </div>
      <ProgressBar pct={Math.min(1, elapsedSec / plannedSec)} className="mt-3 h-1.5" />
      <p className="mt-2 text-xs text-ink2">
        {reward
          ? <>Finish now: <b className="text-ink">+{reward.xp} XP</b>{reward.bonus > 0 && <span className="text-good"> (+{Math.round(reward.bonus * 100)}% early)</span>}</>
          : <>Claimable in {mmss(claimableIn)}. Stay with it.</>}
      </p>
      <div className="mt-3 flex gap-2">
        {confirmQuit ? (
          <>
            <button onClick={() => action.mutate({ path: '/focus/abandon' }, { onSuccess: () => toast('Session abandoned') })}
              className="flex-1 rounded-xl border border-bad/50 bg-bad/15 py-2 text-sm font-bold text-bad">Abandon (no XP)</button>
            <button onClick={() => setConfirmQuit(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink2">Keep going</button>
          </>
        ) : (
          <>
            <button onClick={finish} disabled={!reward || action.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-good/40 bg-good/10 py-2 text-sm font-bold text-good disabled:opacity-40">
              <Check size={16} /> Done
            </button>
            <button onClick={() => setConfirmQuit(true)} className="rounded-xl border border-line px-3 py-2 text-muted" aria-label="Abandon"><X size={16} /></button>
          </>
        )}
      </div>
    </div>
  );
}

export function FocusForm({ s, onDone }: { s: AppState; onDone: () => void }) {
  const action = useAction();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(25);
  const base = focusReward(minutes, minutes)!;
  const best = focusReward(minutes, minutes * FOCUS_MIN_SHARE)!;

  const start = () => {
    if (!title.trim()) return toast('What are you focusing on?', 'bad');
    action.mutate({ path: '/focus/start', body: { title, categoryId, minutes } }, {
      onSuccess: () => { toast('Focus started. The System is watching.', 'good'); onDone(); },
      onError: (e) => toast(e.message, 'bad'),
    });
  };

  return (
    <div>
      <Field label="Focus on"><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Chapter 4 problems" autoFocus /></Field>
      <Field label="Category"><CategoryPicker s={s} value={categoryId} onChange={setCategoryId} /></Field>
      <Field label="Duration (minutes)">
        <div className="flex flex-wrap gap-1.5">
          {FOCUS_PRESETS.map((m) => (
            <button key={m} type="button" onClick={() => setMinutes(m)}
              className={`rounded-xl border px-3.5 py-2 text-sm font-bold ${minutes === m ? 'border-accent bg-accent/20 text-ink' : 'border-line text-ink2'}`}>{m}</button>
          ))}
          <input type="number" min={5} max={240} className="field w-20" value={minutes} onChange={(e) => setMinutes(Math.max(5, Math.min(240, Number(e.target.value) || 5)))} />
        </div>
      </Field>
      <p className="mb-4 text-xs text-muted">
        Finish on time for <b className="text-ink2">+{base.xp} XP, +{base.credits} credits</b>. Finish early for up to +{Math.round(FOCUS_EARLY_BONUS_CAP * 100)}% ({best.xp} XP),
        but you can only claim after half the time. Abandoning costs nothing.
      </p>
      <Button className="w-full" onClick={start} disabled={action.isPending}><Timer size={16} /> Start focus</Button>
    </div>
  );
}
