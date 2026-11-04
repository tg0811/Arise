import { useState } from 'react';
import { Plus, Search, Dumbbell, PersonStanding, Footprints } from 'lucide-react';
import { useGateAction, type ExerciseKind, type Gate, type GateExercise } from '../../lib/api';
import { Button, useToast } from '../../components/ui';

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const KIND_VIEW: Record<ExerciseKind, { label: string; icon: typeof Dumbbell }> = {
  strength: { label: 'Strength', icon: Dumbbell },
  bodyweight: { label: 'Bodyweight', icon: PersonStanding },
  cardio: { label: 'Cardio', icon: Footprints },
};

export const KindIcon = ({ kind, size = 16, className }: { kind: ExerciseKind; size?: number; className?: string }) => {
  const Icon = KIND_VIEW[kind].icon;
  return <Icon size={size} className={className} />;
};

/** "4×8 · 60 kg" / "20 min" style target summary. */
export function targetText(t: { kind: ExerciseKind; targetSets: number; targetReps: number | null; targetKg: number | null; targetMin: number | null }) {
  if (t.kind === 'cardio') return t.targetMin ? `${t.targetMin} min` : `${t.targetSets} set${t.targetSets > 1 ? 's' : ''}`;
  const base = `${t.targetSets}×${t.targetReps ?? '?'}`;
  return t.targetKg ? `${base} · ${t.targetKg} kg` : base;
}

/** Pick an exercise from the library, or create a new one, then call onPick with its id. */
export function ExercisePicker({ g, onPick, busy }: { g: Gate; onPick: (id: number) => void; busy?: boolean }) {
  const action = useGateAction();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<ExerciseKind>('strength');
  const [muscle, setMuscle] = useState('');
  const list = g.exercises.filter((e) => !e.archived && e.name.toLowerCase().includes(q.trim().toLowerCase()));

  const create = () => {
    if (!q.trim()) return toast('Name the exercise', 'bad');
    action.mutate({ path: '/exercises', body: { name: q.trim(), kind, muscle } }, {
      onSuccess: (r) => r.id && onPick(r.id),
      onError: (e) => toast(e.message, 'bad'),
    });
  };

  return (
    <div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="field pl-9" value={q} onChange={(e) => { setQ(e.target.value); setCreating(false); }} placeholder="Search or name a new exercise" autoFocus />
      </div>
      <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
        {list.map((e: GateExercise) => (
          <button key={e.id} disabled={busy} onClick={() => onPick(e.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-white/5 disabled:opacity-50">
            <KindIcon kind={e.kind} className="text-accent" />
            <span className="flex-1"><span className="block font-semibold">{e.name}</span>{e.muscle && <span className="block text-xs text-muted">{e.muscle}</span>}</span>
            <Plus size={16} className="text-muted" />
          </button>
        ))}
        {list.length === 0 && !q && <p className="py-4 text-center text-sm text-muted">Your library is empty. Type a name above to create your first exercise.</p>}
      </div>
      {q.trim() && !g.exercises.some((e) => !e.archived && e.name.toLowerCase() === q.trim().toLowerCase()) && (
        creating ? (
          <div className="mt-3 rounded-xl border border-line p-3">
            <p className="mb-2 text-sm font-semibold">New: {q.trim()}</p>
            <div className="mb-2 grid grid-cols-3 gap-1.5">
              {(Object.keys(KIND_VIEW) as ExerciseKind[]).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-bold ${kind === k ? 'border-accent bg-accent/20 text-ink' : 'border-line text-ink2'}`}>
                  <KindIcon kind={k} size={13} /> {KIND_VIEW[k].label}
                </button>
              ))}
            </div>
            <input className="field mb-2" value={muscle} onChange={(e) => setMuscle(e.target.value)} placeholder="Muscle group (optional), e.g. Chest" maxLength={40} />
            <Button className="w-full" onClick={create} disabled={action.isPending || busy}>Create &amp; add</Button>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-accent/50 py-2.5 text-sm font-bold text-accent">
            <Plus size={15} /> Create "{q.trim()}"
          </button>
        )
      )}
    </div>
  );
}
