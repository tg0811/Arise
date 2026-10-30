import { useState } from 'react';
import { Pencil, Check, X, Ruler, Scale } from 'lucide-react';
import { useAction, type AppState } from '../lib/api';
import { useToast } from './ui';

/** Height (fixed) and weight (editable inline via the pen) — shown wherever the avatar is. */
export function BodyStats({ s, size = 'md' }: { s: AppState; size?: 'sm' | 'md' }) {
  const action = useAction();
  const toast = useToast();
  const { heightCm, weightKg } = s.profile;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(weightKg?.toString() ?? '');
  const sm = size === 'sm';
  const text = sm ? 'text-[11px]' : 'text-sm';
  const icon = sm ? 11 : 14;

  const save = () => {
    const kg = Number(value);
    if (!kg || kg < 20 || kg > 400) return toast('Enter a weight in kg', 'bad');
    action.mutate({ method: 'PUT', path: '/profile', body: { weightKg: kg } }, {
      onSuccess: () => { setEditing(false); toast('Weight updated', 'good'); },
      onError: (e) => toast(e.message, 'bad'),
    });
  };

  return (
    <div className={`flex items-center gap-3 font-semibold text-ink2 ${text}`}>
      {heightCm && <span className="inline-flex items-center gap-1"><Ruler size={icon} className="text-muted" />{heightCm} cm</span>}
      {editing ? (
        <form className="inline-flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Scale size={icon} className="text-muted" />
          <input type="number" inputMode="decimal" step="0.1" autoFocus value={value} onChange={(e) => setValue(e.target.value)}
            className={`w-16 rounded-md border border-accent bg-black/30 px-1.5 py-0.5 outline-none ${text}`} />
          <span>kg</span>
          <button type="submit" className="rounded p-0.5 text-good" aria-label="Save weight"><Check size={icon + 2} /></button>
          <button type="button" onClick={() => setEditing(false)} className="rounded p-0.5 text-muted" aria-label="Cancel"><X size={icon + 2} /></button>
        </form>
      ) : (
        <span className="inline-flex items-center gap-1">
          <Scale size={icon} className="text-muted" />
          {weightKg !== null ? `${weightKg} kg` : 'Weight —'}
          <button onClick={() => { setValue(weightKg?.toString() ?? ''); setEditing(true); }}
            className="rounded p-0.5 text-muted hover:text-accent" aria-label="Edit weight">
            <Pencil size={icon - 1} />
          </button>
        </span>
      )}
    </div>
  );
}
