import { useState } from 'react';
import { motion } from 'framer-motion';
import { Castle, Hammer, Swords, Plus, Pencil, Trophy, Undo2, Trash2, Clock, ScrollText, NotebookPen, ChevronDown } from 'lucide-react';
import { GOAL_LATE_SHARE, GOAL_SIZES, GOAL_TYPES, JOURNAL_AAR_XP, creditsFor, type GoalType } from '@shared';
import { useAction, type AppState, type Goal, type JournalEntry } from '../lib/api';
import { formatDate, toLocalInput } from '../lib/time';
import { Countdown } from '../components/Countdown';
import { CategoryPicker, Field } from '../components/TaskForm';
import { Button, CategoryIcon, Panel, SectionTitle, Sheet, Tabs, useToast } from '../components/ui';

export const GOAL_TYPE_VIEW: Record<GoalType, { label: string; hint: string; icon: typeof Castle }> = {
  siege: { label: 'Siege', hint: 'Exam or test', icon: Castle },
  forge: { label: 'Forge', hint: 'Project to build', icon: Hammer },
  gauntlet: { label: 'Gauntlet', hint: 'Event or challenge', icon: Swords },
};

type Tab = 'goals' | 'mission' | 'journal';

export function Goals({ s }: { s: AppState }) {
  const [tab, setTab] = useState<Tab>('goals');
  const [editingGoal, setEditingGoal] = useState<Goal | 'new' | null>(null);
  const [journalSheet, setJournalSheet] = useState<{ entry?: JournalEntry; kind: 'note' | 'aar'; goalId?: number } | null>(null);
  const active = s.goals.filter((g) => g.status === 'active');
  const done = s.goals.filter((g) => g.status === 'done');
  const needsAar = s.goals.filter((g) => (g.status === 'done' || g.pastDue) && !g.hasAar).length;

  return (
    <div className="pt-2">
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: 'goals', label: 'Goals', badge: active.length },
        { id: 'mission', label: 'Mission' },
        { id: 'journal', label: 'Journal', badge: needsAar },
      ]} />

      {tab === 'goals' && (
        <>
          <SectionTitle right={<button onClick={() => setEditingGoal('new')} className="inline-flex items-center gap-1 text-xs font-bold text-accent"><Plus size={13} /> New goal</button>}>
            Active
          </SectionTitle>
          {active.length === 0 ? (
            <button onClick={() => setEditingGoal('new')} className="w-full rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted hover:border-accent">
              No major goals. Set an exam, project or challenge with a deadline, and stake XP on it.
            </button>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {active.map((g) => <GoalCard key={g.id} s={s} g={g} onEdit={() => setEditingGoal(g)} onReview={() => setJournalSheet({ kind: 'aar', goalId: g.id })} />)}
            </div>
          )}
          {done.length > 0 && (
            <>
              <SectionTitle>Conquered</SectionTitle>
              <div className="grid gap-3 lg:grid-cols-2">
                {done.map((g) => <GoalCard key={g.id} s={s} g={g} onEdit={() => {}} onReview={() => setJournalSheet({ kind: 'aar', goalId: g.id })} />)}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'mission' && <Mission s={s} />}

      {tab === 'journal' && (
        <Journal s={s} onNew={(kind, goalId) => setJournalSheet({ kind, goalId })} onEdit={(entry) => setJournalSheet({ entry, kind: entry.kind })} />
      )}

      <Sheet open={editingGoal !== null} onClose={() => setEditingGoal(null)} title={editingGoal === 'new' ? 'New major goal' : 'Edit goal'}>
        {editingGoal && <GoalForm key={editingGoal === 'new' ? 'new' : editingGoal.id} s={s} goal={editingGoal === 'new' ? null : editingGoal} onDone={() => setEditingGoal(null)} />}
      </Sheet>
      <Sheet open={journalSheet !== null} onClose={() => setJournalSheet(null)}
        title={journalSheet?.kind === 'aar' ? 'After-action review' : journalSheet?.entry ? 'Edit note' : 'New note'}>
        {journalSheet && <JournalForm key={journalSheet.entry?.id ?? `${journalSheet.kind}-${journalSheet.goalId}`} s={s} {...journalSheet} onDone={() => setJournalSheet(null)} />}
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- goals

function GoalCard({ s, g, onEdit, onReview }: { s: AppState; g: Goal; onEdit: () => void; onReview: () => void }) {
  const action = useAction();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const view = GOAL_TYPE_VIEW[g.type];
  const cat = s.categories.find((c) => c.id === g.categoryId);
  const run = (method: string, path: string, msg: string, tone: 'good' | 'info' = 'info') =>
    action.mutate({ method, path }, { onSuccess: () => toast(msg, tone), onError: (e) => toast(e.message, 'bad') });

  return (
    <motion.div layout className={`glass relative overflow-hidden rounded-2xl p-4 ${g.pastDue && g.status === 'active' ? 'border-bad/50' : ''} ${g.status === 'done' ? 'opacity-75' : ''}`}>
      {g.status === 'done' && <div className="absolute inset-y-0 left-0 w-1 bg-good" />}
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-accent/15 p-2.5 text-accent"><view.icon size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-accent">{view.label}</span>
            {cat && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: cat.color }}><CategoryIcon name={cat.icon} size={11} /> {cat.name}</span>}
            {g.pastDue && g.status === 'active' && <span className="rounded bg-bad/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-bad">Past due · −{g.xp} paid</span>}
          </div>
          <h3 className="mt-1 font-bold leading-snug">{g.title}</h3>
          {g.description && <p className="mt-0.5 text-sm text-ink2">{g.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {g.status === 'done' ? (
              <span className="font-bold text-good">Conquered {formatDate(g.completedAt!)} · +{g.reward} XP</span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 text-ink2"><Clock size={12} />{g.pastDue ? formatDate(g.deadlineAt) : <Countdown to={g.deadlineAt} />}</span>
                <span className="font-bold text-muted">
                  <span className="text-good">+{g.reward}</span>
                  {!g.pastDue && <> / <span className="text-bad">−{g.xp}</span></>}
                  {g.pastDue && <span className="text-ink2"> (late, {Math.round(GOAL_LATE_SHARE * 100)}%)</span>}
                </span>
              </>
            )}
          </div>
        </div>
        {g.status === 'active' && <button onClick={onEdit} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-ink" aria-label="Edit goal"><Pencil size={15} /></button>}
      </div>

      <div className="mt-3 flex gap-2">
        {g.status === 'active' ? (
          confirmDelete ? (
            <>
              <button onClick={() => run('DELETE', `/goals/${g.id}`, 'Goal removed')} className="flex-1 rounded-xl border border-bad/50 bg-bad/15 py-2 text-sm font-bold text-bad">
                Remove{g.pastDue ? ' (penalty stays)' : ''}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink2">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => run('POST', `/goals/${g.id}/complete`, `Victory! +${g.reward} XP`, 'good')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-good/40 bg-good/10 py-2 text-sm font-bold text-good active:scale-95">
                <Trophy size={15} /> Claim victory
              </button>
              {g.pastDue && !g.hasAar && <button onClick={onReview} className="rounded-xl border border-line px-3 py-2 text-ink2" aria-label="Write review"><ScrollText size={15} /></button>}
              <button onClick={() => setConfirmDelete(true)} className="rounded-xl border border-line px-3 py-2 text-muted" aria-label="Remove goal"><Trash2 size={15} /></button>
            </>
          )
        ) : (
          <>
            {!g.hasAar && (
              <button onClick={onReview} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 py-2 text-sm font-bold text-accent">
                <ScrollText size={15} /> Write review (+{JOURNAL_AAR_XP} XP)
              </button>
            )}
            {g.canUndo && <button onClick={() => run('POST', `/goals/${g.id}/undo`, 'Undone')} className="inline-flex items-center gap-1.5 px-2 text-xs font-bold text-muted"><Undo2 size={13} /> Undo</button>}
          </>
        )}
      </div>
    </motion.div>
  );
}

function defaultDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  d.setHours(23, 59, 0, 0);
  return d;
}

function GoalForm({ s, goal, onDone }: { s: AppState; goal: Goal | null; onDone: () => void }) {
  const action = useAction();
  const toast = useToast();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [type, setType] = useState<GoalType>(goal?.type ?? 'forge');
  const [categoryId, setCategoryId] = useState<number | null>(goal?.categoryId ?? null);
  const [xp, setXp] = useState(goal?.xp ?? GOAL_SIZES[1].xp);
  const [deadline, setDeadline] = useState(toLocalInput(goal ? new Date(goal.deadlineAt) : defaultDeadline()));
  const locked = !!goal?.pastDue;

  const save = () => {
    if (!title.trim()) return toast('Name the goal', 'bad');
    const body = { title, description, type, categoryId, xp, deadlineAt: locked ? goal!.deadlineAt : new Date(deadline).toISOString() };
    action.mutate(goal ? { method: 'PUT', path: `/goals/${goal.id}`, body } : { path: '/goals', body }, {
      onSuccess: () => { toast('Saved', 'good'); onDone(); },
      onError: (e) => toast(e.message, 'bad'),
    });
  };

  return (
    <div>
      <Field label="Title"><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Clear the semester finals" autoFocus={!goal} /></Field>
      <Field label="Description (optional)"><textarea className="field min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>
      <Field label="Type">
        <div className="grid grid-cols-3 gap-1.5">
          {GOAL_TYPES.map((t) => {
            const v = GOAL_TYPE_VIEW[t];
            return (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`rounded-xl border px-2 py-2 text-center transition ${type === t ? 'border-accent bg-accent/20' : 'border-line'}`}>
                <v.icon size={16} className="mx-auto text-accent" />
                <div className="mt-1 text-xs font-bold">{v.label}</div>
                <div className="text-[10px] text-muted">{v.hint}</div>
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Category"><CategoryPicker s={s} value={categoryId} onChange={setCategoryId} /></Field>
      <Field label="Stakes: XP won on time, lost if the deadline passes">
        <div className="grid grid-cols-4 gap-1.5">
          {GOAL_SIZES.map((sz) => (
            <button key={sz.id} type="button" disabled={locked} onClick={() => setXp(sz.xp)}
              className={`rounded-xl border py-2 text-center transition disabled:opacity-40 ${xp === sz.xp ? 'border-accent bg-accent/20' : 'border-line'}`}>
              <div className="text-xs font-bold">{sz.label}</div>
              <div className="text-[10px] text-ink2">±{sz.xp}</div>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">Also pays {creditsFor(xp)} credits. Finishing after the deadline still earns {Math.round(GOAL_LATE_SHARE * 100)}%.</p>
      </Field>
      <Field label="Deadline">
        <input type="datetime-local" className="field" value={deadline} disabled={locked} onChange={(e) => setDeadline(e.target.value)} />
        {locked && <p className="mt-1.5 text-xs text-bad">Deadline has passed, so stakes and deadline are locked.</p>}
      </Field>
      <Button className="w-full" onClick={save} disabled={action.isPending}>{goal ? 'Save' : 'Set goal'}</Button>
    </div>
  );
}

// ---------------------------------------------------------------- mission (My State)

const MISSION_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'coreMission', label: 'Core mission', hint: 'Who are you becoming? The one sentence everything else serves.' },
  { key: 'longTermGoals', label: 'Long-term goals', hint: 'Where you want to be in 1–5 years.' },
  { key: 'shortTermGoals', label: 'Short-term goals', hint: 'What matters in the next weeks or months.' },
  { key: 'emergencyGoals', label: 'Emergency goals', hint: 'Fires to put out right now.' },
  { key: 'sideQuests', label: 'Side quests', hint: 'Nice-to-haves, curiosities, someday ideas.' },
];

function Mission({ s }: { s: AppState }) {
  const action = useAction();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...s.profile.myState }));
  const dirty = MISSION_FIELDS.some((f) => (values[f.key] ?? '') !== (s.profile.myState[f.key] ?? ''));
  return (
    <div className="mt-4 space-y-3">
      {MISSION_FIELDS.map((f, i) => (
        <Panel key={f.key} brackets={i === 0} className="p-4">
          <label className="block">
            <span className={`block font-display font-bold tracking-wider ${i === 0 ? 'text-accent' : ''}`}>{f.label}</span>
            <span className="mb-2 block text-xs text-muted">{f.hint}</span>
            <textarea className="field min-h-[80px]" value={values[f.key] ?? ''} maxLength={4000}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          </label>
        </Panel>
      ))}
      <Button className="sticky bottom-24 w-full md:bottom-6" disabled={!dirty || action.isPending}
        onClick={() => action.mutate({ method: 'PUT', path: '/profile', body: { myState: values } }, { onSuccess: () => toast('Mission saved', 'good') })}>
        {dirty ? 'Save mission' : 'Saved'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- journal

const AAR_FIELDS = [
  { key: 'planned', label: 'What was supposed to happen?' },
  { key: 'happened', label: 'What actually happened?' },
  { key: 'why', label: 'Why was there a difference?' },
  { key: 'next', label: 'What will you do differently next time?' },
] as const;

function Journal({ s, onNew, onEdit }: { s: AppState; onNew: (kind: 'note' | 'aar', goalId?: number) => void; onEdit: (e: JournalEntry) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const pending = s.goals.filter((g) => (g.status === 'done' || g.pastDue) && !g.hasAar);
  return (
    <>
      {pending.length > 0 && (
        <>
          <SectionTitle>Awaiting review</SectionTitle>
          <div className="space-y-2">
            {pending.map((g) => (
              <button key={g.id} onClick={() => onNew('aar', g.id)} className="glass flex w-full items-center gap-3 rounded-2xl p-3 text-left">
                <ScrollText size={18} className="text-accent" />
                <span className="flex-1 text-sm font-semibold">{g.title}<span className="block text-xs font-normal text-muted">{g.status === 'done' ? 'Conquered' : 'Past due'}</span></span>
                <span className="text-xs font-bold text-accent">+{JOURNAL_AAR_XP} XP</span>
              </button>
            ))}
          </div>
        </>
      )}
      <SectionTitle right={<button onClick={() => onNew('note')} className="inline-flex items-center gap-1 text-xs font-bold text-accent"><Plus size={13} /> New note</button>}>Entries</SectionTitle>
      {s.journal.length === 0 ? (
        <button onClick={() => onNew('note')} className="w-full rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted hover:border-accent">
          Nothing written yet. Notes are free-form; reviews follow conquered or failed goals.
        </button>
      ) : (
        <div className="space-y-2">
          {s.journal.map((j) => (
            <Panel key={j.id} brackets={false} className="p-4">
              <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === j.id ? null : j.id)}>
                {j.kind === 'aar' ? <ScrollText size={18} className="mt-0.5 text-accent" /> : <NotebookPen size={18} className="mt-0.5 text-ink2" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{j.kind === 'aar' ? `Review: ${j.goalTitle ?? 'removed goal'}` : j.title || 'Untitled note'}</span>
                  <span className="block text-xs text-muted">{formatDate(j.createdAt)}</span>
                </span>
                <ChevronDown size={16} className={`mt-1 text-muted transition ${open === j.id ? 'rotate-180' : ''}`} />
              </button>
              {open === j.id && (
                <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm">
                  {j.kind === 'aar'
                    ? AAR_FIELDS.map((f) => j[f.key] && (
                        <div key={f.key}><div className="label mb-0.5">{f.label}</div><p className="whitespace-pre-wrap text-ink2">{j[f.key]}</p></div>
                      ))
                    : <p className="whitespace-pre-wrap text-ink2">{j.body}</p>}
                  <button onClick={() => onEdit(j)} className="inline-flex items-center gap-1 text-xs font-bold text-accent"><Pencil size={12} /> Edit</button>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}

function JournalForm({ s, kind, goalId, entry, onDone }: { s: AppState; kind: 'note' | 'aar'; goalId?: number; entry?: JournalEntry; onDone: () => void }) {
  const action = useAction();
  const toast = useToast();
  const [v, setV] = useState({
    title: entry?.title ?? '', body: entry?.body ?? '',
    planned: entry?.planned ?? '', happened: entry?.happened ?? '', why: entry?.why ?? '', next: entry?.next ?? '',
  });
  const goal = s.goals.find((g) => g.id === (entry?.goalId ?? goalId));
  const done = { onSuccess: () => { toast('Saved', 'good'); onDone(); }, onError: (e: Error) => toast(e.message, 'bad') };
  const save = () => {
    if (kind === 'aar' && !AAR_FIELDS.some((f) => v[f.key].trim())) return toast('Write at least one answer', 'bad');
    if (kind === 'note' && !v.body.trim() && !v.title.trim()) return toast('Write something first', 'bad');
    if (entry) action.mutate({ method: 'PUT', path: `/journal/${entry.id}`, body: v }, done);
    else action.mutate({ path: '/journal', body: { ...v, kind, goalId: goalId ?? null } }, done);
  };
  const remove = () => {
    if (entry && confirm('Delete this entry?')) action.mutate({ method: 'DELETE', path: `/journal/${entry.id}` }, done);
  };

  return (
    <div>
      {kind === 'aar' ? (
        <>
          {goal && <p className="mb-4 text-sm text-ink2">Reviewing <b className="text-ink">{goal.title}</b>. Be honest; this is only for you.</p>}
          {AAR_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <textarea className="field min-h-[70px]" value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} maxLength={4000} />
            </Field>
          ))}
        </>
      ) : (
        <>
          <Field label="Title (optional)"><input className="field" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={120} /></Field>
          <Field label="Entry"><textarea className="field min-h-[180px]" value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} maxLength={10000} autoFocus={!entry} /></Field>
        </>
      )}
      <div className="flex gap-2">
        {entry && <Button variant="bad" onClick={remove}><Trash2 size={15} /></Button>}
        <Button className="flex-1" onClick={save} disabled={action.isPending}>{entry ? 'Save' : kind === 'aar' ? `Submit review${goal && !goal.hasAar ? ` (+${JOURNAL_AAR_XP} XP)` : ''}` : 'Save note'}</Button>
      </div>
    </div>
  );
}
