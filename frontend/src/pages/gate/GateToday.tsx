import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Plus, Trash2, Timer, Undo2, Swords, Moon, Trophy, CalendarDays } from 'lucide-react';
import { e1rm } from '@shared';
import { useGate, useGateAction, type Gate, type GateExercise, type GateSession, type GateSet } from '../../lib/api';
import { sfx } from '../../lib/sound';
import { Button, Panel, Sheet, useToast } from '../../components/ui';
import { ExercisePicker, KindIcon, WEEKDAY_NAMES, targetText } from './shared';
import { weekdayName } from '../../lib/time';

const REST_SECONDS = 90;

export function GateToday() {
  const { data: g } = useGate();
  if (!g) return null;
  return (
    <>
      <WeekStrip g={g} />
      {g.session ? <SessionView g={g} session={g.session} /> : <TodayPlan g={g} />}
    </>
  );
}

// ---------------------------------------------------------------- this week

const DAY_STYLE: Record<Gate['week'][number]['status'], { mark: string; cls: string; label: string }> = {
  done: { mark: '✓', cls: 'bg-good/20 text-good border-good/40', label: 'Done' },
  extra: { mark: '✓', cls: 'bg-accent2/15 text-accent2 border-accent2/40', label: 'Extra session' },
  missed: { mark: '✗', cls: 'bg-bad/15 text-bad border-bad/40', label: 'Missed' },
  active: { mark: '…', cls: 'bg-accent/20 text-accent border-accent/50', label: 'In progress' },
  planned: { mark: '•', cls: 'text-ink2 border-line', label: 'Planned' },
  rest: { mark: '–', cls: 'text-muted border-transparent', label: 'Rest' },
};

function WeekStrip({ g }: { g: Gate }) {
  return (
    <div className="mb-4 grid grid-cols-7 gap-1.5">
      {g.week.map((d) => {
        const st = DAY_STYLE[d.status];
        return (
          <div key={d.date} title={`${WEEKDAY_NAMES[new Date(d.date + 'T12:00:00').getDay()]}: ${d.name || st.label} (${st.label})`}
            className={`flex flex-col items-center rounded-xl border py-2 ${st.cls} ${d.isToday ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}>
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">{weekdayName(d.date, 'narrow')}</span>
            <span className="text-base font-bold leading-tight">{st.mark}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- before starting

function TodayPlan({ g }: { g: Gate }) {
  const action = useGateAction();
  const toast = useToast();
  const p = g.todayPlan;
  const start = () => action.mutate({ path: '/session/start' }, { onError: (e) => toast(e.message, 'bad') });
  const noPlan = !g.plan.some((d) => d.scheduled);

  if (noPlan) {
    return (
      <Panel className="p-6 text-center">
        <CalendarDays size={32} className="mx-auto text-accent" />
        <h2 className="mt-3 font-display text-xl font-bold tracking-wider">No plan yet</h2>
        <p className="mt-1 text-sm text-ink2">Set your week: which days you train and what you do on each.</p>
        <Link to="/gate/plan" className="mt-4 inline-block"><Button>Build my week</Button></Link>
      </Panel>
    );
  }

  if (!p.scheduled) {
    const next = [1, 2, 3, 4, 5, 6, 7].map((i) => g.plan.find((d) => d.weekday === (p.weekday + i) % 7)!).find((d) => d.scheduled);
    return (
      <Panel className="p-6 text-center">
        <Moon size={30} className="mx-auto text-accent2" />
        <h2 className="mt-3 font-display text-xl font-bold tracking-wider">Rest day</h2>
        <p className="mt-1 text-sm text-ink2">Recovery is training. See you {next ? `on ${WEEKDAY_NAMES[next.weekday]}${next.name ? ` for ${next.name}` : ''}` : 'soon'}.</p>
        <button onClick={start} disabled={action.isPending} className="mt-4 text-xs font-bold text-muted underline-offset-4 hover:text-ink2 hover:underline">
          Log an extra session anyway (no XP)
        </button>
      </Panel>
    );
  }

  return (
    <Panel className="p-5">
      <p className="label">{WEEKDAY_NAMES[p.weekday]}</p>
      <h2 className="mt-1 font-display text-2xl font-bold tracking-wider">{p.name || 'Workout'}</h2>
      <ul className="mt-4 space-y-2">
        {p.items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 text-sm">
            <KindIcon kind={it.kind} className="text-accent" />
            <span className="flex-1 font-semibold">{it.name}</span>
            <span className="text-ink2">{targetText(it)}</span>
          </li>
        ))}
      </ul>
      <Button className="mt-5 w-full" onClick={start} disabled={action.isPending}><Swords size={16} /> Start workout</Button>
      <p className="mt-2 text-center text-xs text-muted">+50 Body XP when finished · missing it costs 50 at midnight</p>
    </Panel>
  );
}

// ---------------------------------------------------------------- the session

function useElapsed(startedAt: string | null, running: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!startedAt) return '0:00';
  const sec = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function SessionView({ g, session }: { g: Gate; session: GateSession }) {
  const action = useGateAction();
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const active = session.status === 'active';
  const elapsed = useElapsed(session.startedAt, active);
  const doneSets = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const totalSets = session.exercises.reduce((n, e) => n + e.sets.length, 0);

  const finish = () =>
    action.mutate({ path: '/session/finish', body: {} }, {
      onSuccess: () => { sfx.complete(); toast(session.scheduled ? 'Workout complete: +50 Body XP' : 'Extra session logged', 'good'); },
      onError: (e) => toast(e.message, 'bad'),
    });

  if (!active) {
    return (
      <Panel className="p-6 text-center">
        <Trophy size={32} className="mx-auto text-accent2" />
        <h2 className="mt-3 font-display text-xl font-bold tracking-wider">{session.title} cleared</h2>
        <p className="mt-1 text-sm text-ink2">{doneSets} sets{session.scheduled ? ' · +50 Body XP' : ' · extra session'}</p>
        <button onClick={() => action.mutate({ path: '/session/undo' })} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-ink2">
          <Undo2 size={13} /> Reopen (mis-tap)
        </button>
      </Panel>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="label">{session.scheduled ? 'In the Dungeon' : 'Extra session'}</p>
          <h2 className="font-display text-2xl font-bold tracking-wider">{session.title}</h2>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold tabular-nums">{elapsed}</div>
          <div className="text-xs text-muted">{doneSets}/{totalSets} sets</div>
        </div>
      </div>

      {restUntil && <RestTimer until={restUntil} onDone={() => setRestUntil(null)} />}

      <div className="space-y-3">
        {session.exercises.map((ex) => (
          <ExerciseBlock key={ex.exerciseId} ex={ex} lib={g.exercises.find((e) => e.id === ex.exerciseId)} onTicked={() => setRestUntil(Date.now() + REST_SECONDS * 1000)} />
        ))}
      </div>

      <button onClick={() => setPicker(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-3 text-sm font-bold text-ink2 hover:border-accent hover:text-ink">
        <Plus size={15} /> Add exercise
      </button>

      <div className="sticky bottom-24 mt-4 flex gap-2 md:bottom-4">
        {confirmDiscard ? (
          <>
            <Button variant="bad" className="flex-1" onClick={() => action.mutate({ method: 'DELETE', path: '/session' }, { onSuccess: () => toast('Session discarded') })}>Discard session</Button>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>Keep</Button>
          </>
        ) : (
          <>
            <Button className="flex-1" onClick={finish} disabled={!doneSets || action.isPending}><Check size={16} /> Finish workout</Button>
            <Button variant="ghost" onClick={() => setConfirmDiscard(true)} aria-label="Discard"><Trash2 size={16} /></Button>
          </>
        )}
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Add exercise">
        {picker && <ExercisePicker g={g} busy={action.isPending}
          onPick={(id) => action.mutate({ path: '/session/exercise', body: { exerciseId: id } }, { onSuccess: () => setPicker(false), onError: (e) => toast(e.message, 'bad') })} />}
      </Sheet>
    </div>
  );
}

function RestTimer({ until, onDone }: { until: number; onDone: () => void }) {
  const [left, setLeft] = useState(Math.ceil((until - Date.now()) / 1000));
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.ceil((until - Date.now()) / 1000);
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        navigator.vibrate?.(200);
        onDone();
      }
    }, 250);
    return () => clearInterval(t);
  }, [until, onDone]);
  return (
    <div className="sticky top-24 z-30 mb-3 flex items-center gap-3 rounded-xl border border-accent2/40 bg-panel px-3 py-2 text-sm">
      <Timer size={15} className="text-accent2" />
      <span className="flex-1 text-ink2">Rest <span className="font-bold tabular-nums text-ink">{Math.floor(left / 60)}:{String(Math.max(0, left % 60)).padStart(2, '0')}</span></span>
      <button onClick={onDone} className="text-xs font-bold text-muted hover:text-ink">Skip</button>
    </div>
  );
}

function ExerciseBlock({ ex, lib, onTicked }: { ex: GateSession['exercises'][number]; lib?: GateExercise; onTicked: () => void }) {
  const action = useGateAction();
  return (
    <Panel brackets={false} className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <KindIcon kind={ex.kind} className="text-accent" />
        <h3 className="flex-1 font-bold">{ex.name}</h3>
        {lib && lib.prs.kg > 0 && <span className="text-[11px] text-muted">PR {lib.prs.kg} kg</span>}
      </div>
      {ex.previous.length > 0 && (
        <p className="mb-2 text-xs text-muted">Last time: {ex.previous.map((p) => (ex.kind === 'cardio' ? `${Math.round((p.seconds ?? 0) / 60)}m${p.km ? ` ${p.km}km` : ''}` : `${p.reps ?? 0}${p.kg ? `×${p.kg}` : ''}`)).join(', ')}</p>
      )}
      <div className="mb-1 grid grid-cols-[2rem_1fr_1fr_2.5rem_1.75rem] items-center gap-2 text-[10px] font-black uppercase tracking-wider text-muted">
        <span>Set</span>
        <span>{ex.kind === 'cardio' ? 'Min' : 'Reps'}</span>
        <span>{ex.kind === 'cardio' ? 'Km' : 'Kg'}</span>
        <span />
        <span />
      </div>
      <div className="space-y-1.5">
        {ex.sets.map((st) => <SetRow key={st.id} st={st} kind={ex.kind} prs={lib?.prs} name={ex.name} onTicked={onTicked} />)}
      </div>
      <button onClick={() => action.mutate({ path: '/session/sets', body: { exerciseId: ex.exerciseId } })} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-accent">
        <Plus size={13} /> Add set
      </button>
    </Panel>
  );
}

function SetRow({ st, kind, prs, name, onTicked }: { st: GateSet; kind: GateExercise['kind']; prs?: GateExercise['prs']; name: string; onTicked: () => void }) {
  const action = useGateAction();
  const toast = useToast();
  const cardio = kind === 'cardio';
  const [a, setA] = useState(String(cardio ? (st.seconds ? Math.round(st.seconds / 60) : '') : (st.reps ?? '')));
  const [b, setB] = useState(String(cardio ? (st.km ?? '') : (st.kg ?? '')));
  // Local tick state: the tap shows instantly, and repeat taps are ignored until the server confirms.
  const [done, setDone] = useState(st.done);
  const [ticking, setTicking] = useState(false);
  useEffect(() => { if (!ticking) setDone(st.done); }, [st.done, ticking]);
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const values = () => (cardio
    ? { reps: null, kg: null, seconds: num(a) === null ? null : Math.round(num(a)! * 60), km: num(b) }
    : { reps: num(a), kg: num(b), seconds: null, km: null });

  /** Field edits save numbers only; they never change whether the set is ticked. */
  const saveValues = () => action.mutate({ method: 'PUT', path: `/sets/${st.id}`, body: values() }, { onError: (e) => toast(e.message, 'bad') });

  const tick = () => {
    if (ticking) return;
    const next = !done;
    const v = values();
    // New PR? Compare against records from before this set (only if there were records to beat).
    if (next && prs) {
      const kg = v.kg ?? 0;
      if ((prs.kg > 0 && kg > prs.kg) || (prs.e1rm > 0 && e1rm(kg, v.reps ?? 0) > prs.e1rm)) {
        sfx.levelUp();
        toast(`New PR! ${name}: ${kg} kg × ${v.reps}`, 'good');
      } else if (prs.km > 0 && (v.km ?? 0) > prs.km) {
        sfx.levelUp();
        toast(`New PR! ${name}: ${v.km} km`, 'good');
      }
    }
    setDone(next);
    setTicking(true);
    action.mutate({ method: 'PUT', path: `/sets/${st.id}`, body: { ...v, done: next } }, {
      onSuccess: () => { if (next) onTicked(); },
      onError: (e) => { setDone(!next); toast(e.message, 'bad'); },
      onSettled: () => setTicking(false),
    });
  };

  return (
    <div className={`grid grid-cols-[2rem_1fr_1fr_2.5rem_1.75rem] items-center gap-2 rounded-lg ${done ? 'bg-good/10' : ''}`}>
      <span className="text-center text-sm font-bold text-ink2">{st.setNo}</span>
      <input type="number" inputMode="decimal" className="field py-1.5 text-center" value={a} onChange={(e) => setA(e.target.value)} onBlur={saveValues} aria-label={cardio ? 'Minutes' : 'Reps'} />
      <input type="number" inputMode="decimal" step="0.5" className="field py-1.5 text-center" value={b} onChange={(e) => setB(e.target.value)} onBlur={saveValues} aria-label={cardio ? 'Kilometres' : 'Kilograms'} />
      <button onClick={tick} aria-label={done ? 'Untick set' : 'Tick set'} aria-pressed={done}
        className={`flex h-9 items-center justify-center rounded-lg border transition ${done ? 'border-good bg-good/25 text-good' : 'border-line text-muted hover:text-ink'}`}>
        <Check size={17} />
      </button>
      <button onClick={() => action.mutate({ method: 'DELETE', path: `/sets/${st.id}` })} className="text-muted hover:text-bad" aria-label="Remove set"><X size={15} /></button>
    </div>
  );
}

