import { useState } from 'react';
import { Plus, ChevronUp, ChevronDown, X, Moon } from 'lucide-react';
import { useGate, useGateAction, type PlanDay, type PlanItem } from '../../lib/api';
import { Panel, Sheet, useToast } from '../../components/ui';
import { ExercisePicker, KindIcon, WEEKDAY_NAMES } from './shared';

// The weekly plan, Monday → Sunday. A day with exercises (and not marked Rest) is a workout day.

export function Plan() {
  const { data: g } = useGate();
  const [adding, setAdding] = useState<number | null>(null);
  const action = useGateAction();
  const toast = useToast();
  if (!g) return null;
  const scheduledCount = g.plan.filter((d) => d.scheduled).length;

  return (
    <div>
      <p className="mb-4 text-sm text-ink2">
        {scheduledCount ? `${scheduledCount} workout day${scheduledCount > 1 ? 's' : ''} a week.` : 'No workout days yet.'} Each finished workout day is +50 XP and +10 credits; a missed one is −50. A week counts toward your streak only if every workout day in it is done.
      </p>
      <div className="space-y-3">
        {g.plan.map((d) => <DayCard key={d.weekday} d={d} onAdd={() => setAdding(d.weekday)} />)}
      </div>
      <Sheet open={adding !== null} onClose={() => setAdding(null)} title={adding !== null ? `Add to ${WEEKDAY_NAMES[adding]}` : ''}>
        {adding !== null && (
          <ExercisePicker g={g} busy={action.isPending} onPick={(exerciseId) => {
            const kind = g.exercises.find((e) => e.id === exerciseId)?.kind;
            action.mutate({ path: `/days/${adding}/items`, body: kind === 'cardio' ? { exerciseId, targetSets: 1, targetMin: 20 } : { exerciseId, targetSets: 3, targetReps: 10 } }, {
              onSuccess: () => setAdding(null),
              onError: (e) => toast(e.message, 'bad'),
            });
          }} />
        )}
      </Sheet>
    </div>
  );
}

function DayCard({ d, onAdd }: { d: PlanDay; onAdd: () => void }) {
  const action = useGateAction();
  const [name, setName] = useState(d.name);
  const saveDay = (patch: Partial<{ name: string; isRest: boolean }>) =>
    action.mutate({ method: 'PUT', path: `/days/${d.weekday}`, body: { name, isRest: d.isRest, ...patch } });
  const move = (i: number, dir: -1 | 1) => {
    const ids = d.items.map((x) => x.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    action.mutate({ path: `/days/${d.weekday}/reorder`, body: { ids } });
  };

  return (
    <Panel brackets={d.scheduled} className={`p-4 ${d.scheduled ? '' : 'opacity-80'}`}>
      <div className="flex items-center gap-3">
        <span className="w-12 shrink-0 font-display text-sm font-bold tracking-widest text-accent">{WEEKDAY_NAMES[d.weekday].slice(0, 3).toUpperCase()}</span>
        <input className="field flex-1 py-1.5" value={name} placeholder={d.isRest ? 'Rest' : 'Name (e.g. Push day)'} maxLength={40}
          onChange={(e) => setName(e.target.value)} onBlur={() => name !== d.name && saveDay({ name })} />
        <button onClick={() => saveDay({ isRest: !d.isRest })}
          className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${d.isRest ? 'border-accent2/50 bg-accent2/15 text-accent2' : 'border-line text-muted'}`}>
          <Moon size={12} /> Rest
        </button>
      </div>

      {d.items.length > 0 && (
        <ul className={`mt-3 space-y-2 ${d.isRest ? 'opacity-50' : ''}`}>
          {d.items.map((it, i) => <ItemRow key={it.id} it={it} first={i === 0} last={i === d.items.length - 1} onMove={(dir) => move(i, dir)} />)}
        </ul>
      )}
      {d.isRest && d.items.length > 0 && <p className="mt-2 text-xs text-muted">Kept, but not scheduled while this is a rest day.</p>}
      {/* Adding an exercise turns a rest day into a workout day. */}
      <button onClick={onAdd} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
        <Plus size={13} /> {d.isRest && !d.items.length ? 'Add exercise (makes this a workout day)' : 'Add exercise'}
      </button>
    </Panel>
  );
}

function ItemRow({ it, first, last, onMove }: { it: PlanItem; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void }) {
  const action = useGateAction();
  const cardio = it.kind === 'cardio';
  const [sets, setSets] = useState(String(it.targetSets));
  const [reps, setReps] = useState(String(it.targetReps ?? ''));
  const [kg, setKg] = useState(String(it.targetKg ?? ''));
  const [min, setMin] = useState(String(it.targetMin ?? ''));
  const n = (v: string) => (v.trim() === '' ? null : Number(v));
  const save = () =>
    action.mutate({ method: 'PUT', path: `/items/${it.id}`, body: { targetSets: Math.max(1, n(sets) ?? 1), targetReps: n(reps), targetKg: n(kg), targetMin: n(min) } });

  return (
    <li className="rounded-xl border border-line p-2.5">
      <div className="flex items-center gap-2">
        <KindIcon kind={it.kind} size={15} className="text-accent" />
        <span className="flex-1 truncate text-sm font-semibold">{it.name}</span>
        <button disabled={first} onClick={() => onMove(-1)} className="text-muted disabled:opacity-20" aria-label="Move up"><ChevronUp size={16} /></button>
        <button disabled={last} onClick={() => onMove(1)} className="text-muted disabled:opacity-20" aria-label="Move down"><ChevronDown size={16} /></button>
        <button onClick={() => action.mutate({ method: 'DELETE', path: `/items/${it.id}` })} className="text-muted hover:text-bad" aria-label="Remove"><X size={16} /></button>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-ink2">
        {cardio ? (
          <><input type="number" className="field w-20 py-1 text-center" value={min} onChange={(e) => setMin(e.target.value)} onBlur={save} aria-label="Minutes" /> min</>
        ) : (
          <>
            <input type="number" className="field w-14 py-1 text-center" value={sets} onChange={(e) => setSets(e.target.value)} onBlur={save} aria-label="Sets" /> ×
            <input type="number" className="field w-14 py-1 text-center" value={reps} onChange={(e) => setReps(e.target.value)} onBlur={save} aria-label="Reps" /> reps
            {it.kind === 'strength' && <><span className="mx-1">@</span><input type="number" step="0.5" className="field w-16 py-1 text-center" value={kg} onChange={(e) => setKg(e.target.value)} onBlur={save} aria-label="Kilograms" /> kg</>}
          </>
        )}
      </div>
    </li>
  );
}
