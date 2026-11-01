import { useState, type ReactNode } from 'react';
import { Plus, Trash2, Repeat, Swords, Skull, Crown, Lock } from 'lucide-react';
import { DIFFICULTIES, DIFFICULTY_XP, BOSS_MULTIPLIER, addDays as addDayStr, type Difficulty } from '@shared';
import { useAction, type AppState, type Habit, type Quest } from '../lib/api';
import { DIFFICULTY_STYLE } from '../lib/theme';
import { formatDateTime, formatDay, toLocalInput } from '../lib/time';
import { Button, CategoryIcon, useToast } from './ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  // Late at night, default to tomorrow instead of a deadline minutes away.
  if (d.getTime() - Date.now() < 2 * 3600_000) d.setDate(d.getDate() + 1);
  return d;
}

// A group, not a <label>: wrapping button pickers in a label makes taps on the
// caption toggle the first button.
export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div role="group" aria-label={label} className="mb-4">
    <span className="label mb-1.5 block">{label}</span>
    {children}
  </div>
);

function CategoryToggle({ c, on, onClick }: { c: AppState['categories'][number]; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition"
      style={{ color: on ? '#fff' : c.color, borderColor: `color-mix(in srgb, ${c.color} ${on ? 90 : 35}%, transparent)`, background: on ? `color-mix(in srgb, ${c.color} 35%, transparent)` : 'transparent' }}>
      <CategoryIcon name={c.icon} size={12} /> {c.name}
    </button>
  );
}

/** One category (or none): tap to pick, tap again to clear. */
export function CategoryPicker({ s, value, onChange }: { s: AppState; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {s.categories.map((c) => <CategoryToggle key={c.id} c={c} on={value === c.id} onClick={() => onChange(value === c.id ? null : c.id)} />)}
    </div>
  );
}

/** Any number of categories: tap to add, tap again to remove. Each one gets the full XP. */
export function CategoriesPicker({ s, value, onChange }: { s: AppState; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {s.categories.map((c) => {
          const on = value.includes(c.id);
          return <CategoryToggle key={c.id} c={c} on={on} onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])} />;
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {value.length > 1 ? `Trains ${value.length} attributes: each gets the full XP.` : 'Tap to add or remove. Pick several if it trains more than one.'}
      </p>
    </div>
  );
}

/** `min`: difficulties below it can't be picked (an existing habit can only be raised). */
function DifficultyPicker({ value, onChange, multiplier = 1, min }: { value: Difficulty; onChange: (d: Difficulty) => void; multiplier?: number; min?: Difficulty }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {DIFFICULTIES.map((d) => {
        const st = DIFFICULTY_STYLE[d];
        const on = value === d;
        return (
          <button key={d} type="button" onClick={() => onChange(d)} disabled={!!min && DIFFICULTIES.indexOf(d) < DIFFICULTIES.indexOf(min)}
            className="rounded-xl border py-2 text-center transition disabled:opacity-30"
            style={{ borderColor: `color-mix(in srgb, ${st.color} ${on ? 90 : 25}%, transparent)`, background: on ? `color-mix(in srgb, ${st.color} 22%, transparent)` : 'transparent' }}>
            <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: st.color }}>{st.label}</div>
            <div className="text-[10px] font-bold text-ink2">±{DIFFICULTY_XP[d] * multiplier}</div>
          </button>
        );
      })}
    </div>
  );
}

type Mode = { kind: 'new'; as: 'habit' | 'quest' } | { kind: 'habit'; habit: Habit } | { kind: 'quest'; quest: Quest };

export function TaskForm({ s, mode, onDone }: { s: AppState; mode: Mode; onDone: () => void }) {
  const action = useAction();
  const toast = useToast();
  const editingHabit = mode.kind === 'habit' ? mode.habit : null;
  const editingQuest = mode.kind === 'quest' ? mode.quest : null;
  const [kind, setKind] = useState<'habit' | 'quest'>(mode.kind === 'new' ? mode.as : mode.kind);

  const src = editingHabit ?? editingQuest;
  const [title, setTitle] = useState(src?.title ?? '');
  const [description, setDescription] = useState(src?.description ?? '');
  const [categoryIds, setCategoryIds] = useState<number[]>(src?.categoryIds ?? []);
  const [difficulty, setDifficulty] = useState<Difficulty>(editingHabit?.nextDifficulty?.difficulty ?? src?.difficulty ?? 'normal');
  // habit
  const [days, setDays] = useState(editingHabit?.days ?? '0123456');
  const [deadlineTime, setDeadlineTime] = useState(editingHabit?.deadlineTime ?? '');
  const [isPrivate, setIsPrivate] = useState(src?.private ?? false);
  // A new habit added in the evening usually can't be done today (e.g. "Wake up at 5:30"): default to tomorrow.
  const [startsTomorrow, setStartsTomorrow] = useState(new Date().getHours() >= 18);
  // In its first hour a habit can still be fixed freely (server rule); after that its stakes and today are fixed.
  const fresh = !!editingHabit && Date.now() < Date.parse(editingHabit.freeEditUntil);
  const nowHHMM = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  // quest
  const [deadline, setDeadline] = useState(toLocalInput(editingQuest ? new Date(editingQuest.deadlineAt) : endOfToday()));
  const [boss, setBoss] = useState<'none' | 'boss' | 'weekly'>('none');
  const [parts, setParts] = useState<{ title: string; durationHours: number }[]>([]);

  const submit = () => {
    if (!title.trim()) return toast('Give it a name', 'bad');
    const done = { onSuccess: () => { toast('Saved', 'good'); onDone(); }, onError: (e: Error) => toast(e.message, 'bad') };
    if (kind === 'habit') {
      if (!days) return toast('Pick at least one day', 'bad');
      const body = { title, description, categoryIds, difficulty, days, deadlineTime: deadlineTime || null, private: isPrivate, ...(editingHabit ? {} : { startsTomorrow }) };
      action.mutate(editingHabit ? { method: 'PUT', path: `/habits/${editingHabit.id}`, body } : { path: '/habits', body }, done);
    } else {
      const deadlineAt = editingQuest && deadline === toLocalInput(new Date(editingQuest.deadlineAt)) ? editingQuest.deadlineAt : new Date(deadline).toISOString();
      if (editingQuest) {
        action.mutate({ method: 'PUT', path: `/quests/${editingQuest.id}`, body: { title, description, categoryIds, deadlineAt, private: isPrivate } }, done);
      } else {
        const cleanParts = parts.filter((p) => p.title.trim()).map((p) => ({ ...p, description: '' }));
        action.mutate({ path: '/quests', body: { title, description, categoryIds, difficulty, deadlineAt, boss, private: isPrivate, parts: cleanParts } }, done);
      }
    }
  };

  const archive = () => {
    if (!editingHabit) return;
    // Deleting a habit that's still due today fails it first (server rule), so say so.
    const failsToday = !fresh && editingHabit.scheduledToday && !editingHabit.log;
    const warning = failsToday ? ` It's still due today, so today counts as a fail (−${editingHabit.xpLoss} XP).` : '';
    if (!confirm(`Delete "${editingHabit.title}"?${warning} Its history stays in your records.`)) return;
    action.mutate({ method: 'DELETE', path: `/habits/${editingHabit.id}` }, { onSuccess: () => { toast('Habit removed'); onDone(); } });
  };

  const toggleDay = (i: number) => {
    const d = String(i);
    setDays(days.includes(d) ? days.replace(d, '') : [...days, d].sort().join(''));
  };

  return (
    <div>
      {mode.kind === 'new' && (
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-line p-1">
          {([['habit', 'Habit', Repeat, 'Repeats daily'], ['quest', 'Quest', Swords, 'One-off, with deadline']] as const).map(([k, label, Icon, sub]) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`rounded-lg px-3 py-2 text-left transition ${kind === k ? 'bg-accent/20 text-ink' : 'text-ink2'}`}>
              <div className="flex items-center gap-1.5 text-sm font-bold"><Icon size={14} /> {label}</div>
              <div className="text-[11px] text-muted">{sub}</div>
            </button>
          ))}
        </div>
      )}

      <Field label="Title">
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
          placeholder={kind === 'habit' ? 'Sleep by 22:30' : 'Finish the API refactor'} autoFocus={mode.kind === 'new'} />
      </Field>
      <Field label="Description (optional)">
        <textarea className="field min-h-[60px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </Field>
      <Field label="Categories">
        <CategoriesPicker s={s} value={categoryIds} onChange={setCategoryIds} />
      </Field>
      {/* Stakes are set once: an existing quest hides them, an existing habit shows them locked. */}
      {!editingQuest && (
        <Field label={`Difficulty — XP gained / lost${kind === 'quest' && boss === 'boss' ? ` (×${BOSS_MULTIPLIER} boss)` : ''}`}>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} multiplier={kind === 'quest' && boss === 'boss' ? BOSS_MULTIPLIER : 1} min={editingHabit && !fresh ? editingHabit.difficulty : undefined} />
          {editingHabit && (fresh
            ? <p className="mt-1.5 text-xs text-muted">Still changeable until {formatDateTime(editingHabit.freeEditUntil)} (its first hour). Then it locks.</p>
            : difficulty !== editingHabit.difficulty
              ? <p className="mt-1.5 text-xs text-ink2">{DIFFICULTY_STYLE[difficulty].label} from {formatDay(addDayStr(s.today, 1))}. Today stays {DIFFICULTY_STYLE[editingHabit.difficulty].label}.</p>
              : <p className="mt-1.5 text-xs text-muted">Can be raised (from the next day), never lowered.</p>)}
        </Field>
      )}

      {kind === 'habit' ? (
        <>
          <Field label="Repeats on">
            <div className="flex gap-1.5">
              {WEEKDAYS.map((d, i) => {
                const on = days.includes(String(i));
                return (
                  <button key={i} type="button" onClick={() => toggleDay(i)}
                    className={`h-9 flex-1 rounded-lg border text-sm font-bold transition ${on ? 'border-accent bg-accent/20 text-ink' : 'border-line text-muted'}`}>
                    {d}
                  </button>
                );
              })}
            </div>
            {editingHabit && !fresh && <p className="mt-1.5 text-xs text-muted">Changes apply from tomorrow. If it's due today, it stays due today.</p>}
          </Field>
          <Field label="Deadline time (optional)">
            <div className="flex gap-2">
              <input type="time" className="field" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} />
              {deadlineTime && <Button variant="ghost" onClick={() => setDeadlineTime('')}>Clear</Button>}
            </div>
            <p className="mt-1.5 text-xs text-muted">Shown as "by HH:MM". You report honestly; anything unresolved fails at midnight.</p>
          </Field>
          {!editingHabit && (
            <Field label="Starts">
              <div className="grid grid-cols-2 gap-1.5">
                {([[false, 'Today'], [true, 'Tomorrow']] as const).map(([v, label]) => (
                  <button key={label} type="button" onClick={() => setStartsTomorrow(v)} aria-pressed={startsTomorrow === v}
                    className={`rounded-xl border py-2 text-sm font-bold transition ${startsTomorrow === v ? 'border-accent bg-accent/20 text-ink' : 'border-line text-ink2'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {!startsTomorrow && deadlineTime && deadlineTime <= nowHHMM ? (
                <p className="mt-1.5 text-xs font-semibold text-bad">It's already past {deadlineTime} today, so today would count as late. Start tomorrow?</p>
              ) : (
                <p className="mt-1.5 text-xs text-muted">{startsTomorrow ? 'Nothing due today: its first day is tomorrow.' : 'Due today if today is one of its days.'}</p>
              )}
            </Field>
          )}
        </>
      ) : (
        <>
          <Field label="Deadline">
            <input type="datetime-local" className="field" value={deadline} onChange={(e) => setDeadline(e.target.value)}
              max={editingQuest ? toLocalInput(new Date(editingQuest.deadlineAt)) : undefined} />
            {deadline && <p className="mt-1.5 text-xs text-ink2">Due {formatDateTime(new Date(deadline))}</p>}
            {editingQuest && <p className="mt-1 text-xs text-muted">Can only move earlier, never later.</p>}
          </Field>
          {!editingQuest && (
            <>
              <Field label="Type">
                <div className="grid grid-cols-3 gap-1.5">
                  {([['none', 'Normal', Swords], ['boss', `Boss ×${BOSS_MULTIPLIER}`, Skull], ['weekly', 'Mega Boss', Crown]] as const).map(([v, label, Icon]) => {
                    const disabled = v === 'weekly' && !s.weeklyBossAvailable;
                    return (
                      <button key={v} type="button" disabled={disabled} onClick={() => setBoss(v)}
                        className={`flex items-center justify-center gap-1 rounded-xl border py-2 text-xs font-bold transition disabled:opacity-30 ${boss === v ? 'border-accent bg-accent/20 text-ink' : 'border-line text-ink2'}`}>
                        <Icon size={13} /> {label}
                      </button>
                    );
                  })}
                </div>
                {boss === 'weekly' && <p className="mt-1.5 text-xs text-muted">Worth ±25% of the XP you need for your next level. One per week.</p>}
                {!s.weeklyBossAvailable && <p className="mt-1.5 text-xs text-muted">This week's Mega Boss is already set.</p>}
              </Field>
              <Field label="Chain — follow-up parts (optional)">
                {parts.map((p, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <span className="flex w-8 shrink-0 items-center justify-center text-xs font-bold text-muted">#{i + 2}</span>
                    <input className="field" value={p.title} placeholder={`Part ${i + 2} title`}
                      onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                    <input type="number" min={1} className="field w-20 shrink-0" value={p.durationHours} title="Hours to finish once unlocked"
                      onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, durationHours: Number(e.target.value) || 24 } : x)))} />
                    <button type="button" onClick={() => setParts(parts.filter((_, j) => j !== i))} className="text-muted"><Trash2 size={15} /></button>
                  </div>
                ))}
                {parts.length < 9 && (
                  <button type="button" onClick={() => setParts([...parts, { title: '', durationHours: 24 }])}
                    className="inline-flex items-center gap-1 text-xs font-bold text-accent"><Plus size={13} /> Add part</button>
                )}
                {parts.length > 0 && <p className="mt-1.5 text-xs text-muted">Each part unlocks when the previous one is cleared, with its own hours to finish. Failing a part ends the chain.</p>}
              </Field>
            </>
          )}
        </>
      )}

      <label className="mb-4 flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--sl-accent)]" />
        <span>
          <span className="flex items-center gap-1.5 font-semibold"><Lock size={13} /> Private {kind}</span>
          <span className="block text-xs text-muted">
            Name, description and category stay hidden (• • • •) until you unlock with your password. You can still {kind === 'habit' ? 'complete' : 'clear'} it while hidden.
            {kind === 'quest' && ' Applies to every part of a chain.'}
          </span>
        </span>
      </label>

      <div className="mt-2 flex gap-2">
        {editingHabit && <Button variant="bad" onClick={archive}><Trash2 size={15} /></Button>}
        <Button className="flex-1" onClick={submit} disabled={action.isPending}>
          {mode.kind === 'new' ? (kind === 'habit' ? 'Create habit' : 'Accept quest') : 'Save'}
        </Button>
      </div>
    </div>
  );
}
