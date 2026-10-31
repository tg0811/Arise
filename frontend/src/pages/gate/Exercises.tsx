import { useState } from 'react';
import { Plus, Trash2, ChevronRight } from 'lucide-react';
import { useGate, useGateAction, type ExerciseKind, type Gate, type GateExercise } from '../../lib/api';
import { Button, Panel, SectionTitle, Sheet, useToast } from '../../components/ui';
import { ExercisePicker, KIND_VIEW, KindIcon } from './shared';

// The exercise library: PRs and a progress chart per exercise.

export function Exercises() {
  const { data: g } = useGate();
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  if (!g) return null;
  const active = g.exercises.filter((e) => !e.archived);
  const open = g.exercises.find((e) => e.id === openId) ?? null;

  return (
    <div>
      <SectionTitle right={<button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-bold text-accent"><Plus size={13} /> New</button>}>Library</SectionTitle>
      {active.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No exercises yet. Add them here or straight from your plan.</p>
      ) : (
        <div className="space-y-2">
          {active.map((e) => (
            <button key={e.id} onClick={() => setOpenId(e.id)} className="glass flex w-full items-center gap-3 rounded-2xl p-3.5 text-left">
              <KindIcon kind={e.kind} className="text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{e.name}</span>
                <span className="block text-xs text-muted">{[KIND_VIEW[e.kind].label, e.muscle].filter(Boolean).join(' · ')} · {e.sessions} session{e.sessions === 1 ? '' : 's'}</span>
              </span>
              <span className="text-right text-sm font-bold">{headline(e)}</span>
              <ChevronRight size={16} className="text-muted" />
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? ''}>
        {open && <ExerciseDetail e={open} onClose={() => setOpenId(null)} />}
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} title="New exercise">
        {adding && <ExercisePicker g={g as Gate} onPick={() => setAdding(false)} />}
      </Sheet>
    </div>
  );
}

const headline = (e: GateExercise) =>
  e.kind === 'cardio' ? (e.prs.km ? `${e.prs.km} km` : e.prs.seconds ? `${Math.round(e.prs.seconds / 60)} min` : '—')
    : e.kind === 'bodyweight' ? (e.prs.reps ? `${e.prs.reps} reps` : '—')
      : e.prs.kg ? `${e.prs.kg} kg` : '—';

/** Which number to chart for each kind of exercise. */
const METRICS: Record<ExerciseKind, { key: 'kg' | 'e1rm' | 'reps' | 'km' | 'seconds'; label: string; unit: string }[]> = {
  strength: [{ key: 'kg', label: 'Top set', unit: 'kg' }, { key: 'e1rm', label: 'Est. 1RM', unit: 'kg' }],
  bodyweight: [{ key: 'reps', label: 'Best set', unit: 'reps' }],
  cardio: [{ key: 'km', label: 'Distance', unit: 'km' }, { key: 'seconds', label: 'Time', unit: 'min' }],
};

function ExerciseDetail({ e, onClose }: { e: GateExercise; onClose: () => void }) {
  const action = useGateAction();
  const toast = useToast();
  const metrics = METRICS[e.kind];
  const [metric, setMetric] = useState(metrics[0]);
  const [name, setName] = useState(e.name);
  const [muscle, setMuscle] = useState(e.muscle);
  const prTiles = e.kind === 'cardio'
    ? [['Longest', e.prs.km ? `${e.prs.km} km` : '—'], ['Longest time', e.prs.seconds ? `${Math.round(e.prs.seconds / 60)} min` : '—']]
    : e.kind === 'bodyweight' ? [['Most reps', e.prs.reps || '—'], ['Sessions', e.sessions]]
      : [['Heaviest', e.prs.kg ? `${e.prs.kg} kg` : '—'], ['Est. 1RM', e.prs.e1rm ? `${e.prs.e1rm} kg` : '—'], ['Most reps', e.prs.reps || '—']];
  const points = e.series.map((p) => ({ date: p.date, v: metric.key === 'seconds' ? Math.round(p.seconds / 60) : p[metric.key] })).filter((p) => p.v > 0);

  return (
    <div>
      <div className={`grid gap-2 ${prTiles.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {prTiles.map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-line p-3">
            <div className="text-[11px] font-semibold text-ink2">{label}</div>
            <div className="mt-0.5 text-lg font-bold">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-sm font-semibold">Progress</span>
        {metrics.length > 1 && (
          <div className="flex gap-1 rounded-lg border border-line p-0.5">
            {metrics.map((m) => (
              <button key={m.key} onClick={() => setMetric(m)} className={`rounded-md px-2.5 py-1 text-xs font-bold ${metric.key === m.key ? 'bg-accent/20 text-ink' : 'text-muted'}`}>{m.label}</button>
            ))}
          </div>
        )}
      </div>
      <ProgressChart points={points} unit={metric.unit} label={metric.label} />

      <div className="mt-6 space-y-2 border-t border-line pt-4">
        <input className="field" value={name} onChange={(ev) => setName(ev.target.value)} maxLength={60} aria-label="Name" />
        <input className="field" value={muscle} onChange={(ev) => setMuscle(ev.target.value)} maxLength={40} placeholder="Muscle group" aria-label="Muscle group" />
        <div className="flex gap-2">
          <Button variant="bad" onClick={() => confirm(`Remove "${e.name}" from your library and plan? Logged sets stay in history.`) &&
            action.mutate({ method: 'DELETE', path: `/exercises/${e.id}` }, { onSuccess: () => { toast('Exercise removed'); onClose(); } })}>
            <Trash2 size={15} />
          </Button>
          <Button className="flex-1" disabled={!name.trim() || (name === e.name && muscle === e.muscle)}
            onClick={() => action.mutate({ method: 'PUT', path: `/exercises/${e.id}`, body: { name, kind: e.kind, muscle } }, { onSuccess: () => toast('Saved', 'good') })}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

/** One series over time: 2px line, 8px end markers, tap a point for its value; sr-only table. */
function ProgressChart({ points, unit, label }: { points: { date: string; v: number }[]; unit: string; label: string }) {
  const [sel, setSel] = useState<number | null>(null);
  if (points.length === 0) return <p className="py-8 text-center text-sm text-muted">Log this exercise to see your progress.</p>;
  const W = 320, H = 140, PAD = 8;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - PAD * 2));
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const active = points[sel ?? points.length - 1];
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div className="mt-2">
      <p className="mb-1 text-sm text-ink2"><span className="font-bold text-ink">{active.v} {unit}</span> · {fmt(active.date)}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} over time`}>
        <line x1={0} x2={W} y1={y(max)} y2={y(max)} stroke="var(--sl-line)" strokeWidth={1} />
        <line x1={0} x2={W} y1={y(min)} y2={y(min)} stroke="var(--sl-line)" strokeWidth={1} />
        <path d={path} fill="none" stroke="var(--sl-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <g key={p.date} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
            <circle cx={x(i)} cy={y(p.v)} r={14} fill="transparent" />
            <circle cx={x(i)} cy={y(p.v)} r={(sel ?? points.length - 1) === i ? 5 : 4} fill="var(--sl-accent)" stroke="var(--sl-panel)" strokeWidth={2} />
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] tabular-nums text-muted">
        <span>{fmt(points[0].date)}</span><span>{min}–{max} {unit}</span><span>{fmt(points[points.length - 1].date)}</span>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>Date</th><th>{unit}</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.date}><td>{p.date}</td><td>{p.v}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
