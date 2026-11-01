import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Moon, Target, ChevronRight, Timer, Orbit } from 'lucide-react';
import { FocusForm } from '../components/Focus';
import { PrivateUnlockedBar } from '../components/Private';
import { LootboxButton } from '../components/Lootbox';
import { Countdown } from '../components/Countdown';
import { DAY_CLEAR_RATIO } from '@shared';
import { daysLabel } from '../lib/time';
import type { AppState, Habit } from '../lib/api';
import { HabitCard, QuestCard, TaskDetail } from '../components/TaskCards';
import { TaskForm } from '../components/TaskForm';
import { Panel, ProgressBar, SectionTitle, Sheet } from '../components/ui';

// What the task sheet shows: a new task (starting on the tab you came from), or one habit/quest by id,
// either its details (`edit: false`) or its form. By id, so the sheet follows live state updates.
type Editing = { kind: 'new'; as: 'habit' | 'quest' } | { kind: 'habit' | 'quest'; id: number; edit: boolean } | null;

export function Today({ s }: { s: AppState }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const todayHabits = s.habits.filter((h) => h.scheduledToday);
  const restHabits = s.habits.filter((h) => !h.scheduledToday);
  // Unresolved first, then done, then failed.
  const order = (h: Habit) => (h.log === null ? 0 : h.log.status === 'done' ? 1 : 2);
  const sortedHabits = [...todayHabits].sort((a, b) => order(a) - order(b));
  const activeQuests = s.quests.filter((q) => q.status === 'pending');
  const resolvedQuests = s.quests.filter((q) => q.status !== 'pending');
  const t = s.streak.today;
  const activeGoals = s.goals.filter((g) => g.status === 'active');
  const openHabit = editing?.kind === 'habit' ? s.habits.find((h) => h.id === editing.id) : undefined;
  const openQuest = editing?.kind === 'quest' ? s.quests.find((q) => q.id === editing.id) : undefined;
  // Deleted (or expired out of today's list) while open: close the sheet.
  const sheetOpen = editing?.kind === 'new' || !!openHabit || !!openQuest;
  const sheetTitle = editing?.kind === 'new' ? 'New task'
    : `${editing && 'edit' in editing && editing.edit ? 'Edit ' : ''}${editing?.kind === 'habit' ? 'habit' : 'quest'}`.replace(/^./, (c) => c.toUpperCase());
  const date = new Date(s.today + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="pt-2">
      <Panel className="mt-3 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="label">{date}</p>
            <p className="mt-1 text-2xl font-black">{t.done}<span className="text-ink2"> / {t.total}</span> <span className="text-sm font-bold text-ink2">cleared</span></p>
          </div>
          <LootboxButton s={s} />
        </div>
        <div className="relative mt-3">
          <ProgressBar pct={t.ratio} className="h-2.5" />
          <span className="absolute top-0 h-2.5 w-0.5 bg-gold" style={{ left: `${DAY_CLEAR_RATIO * 100}%` }} title="Clear line" />
        </div>
      </Panel>

      {s.workoutToday && (
        <Link to="/gate" className={`glass mt-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${s.workoutToday.done ? 'opacity-70' : ''}`}>
          <Orbit size={17} style={{ color: '#dc2626' }} />
          <span className="flex-1">
            <span className="font-bold">Today: {s.workoutToday.name}</span>
            <span className="ml-2 text-ink2">{s.workoutToday.done ? 'cleared ✓' : s.workoutToday.completed ? `${s.workoutToday.completed}/${s.workoutToday.total}` : `${s.workoutToday.total} exercise${s.workoutToday.total === 1 ? '' : 's'}`}</span>
          </span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
      )}

      {!s.focus && (
        <button onClick={() => setFocusOpen(true)} className="glass mt-3 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:border-accent">
          <span className="rounded-xl bg-accent/15 p-2 text-accent"><Timer size={18} /></span>
          <span className="flex-1">
            <span className="block text-sm font-bold">Start a focus session</span>
            <span className="block text-xs text-muted">Timed deep work: 1.5 XP per minute, bonus for finishing early</span>
          </span>
          <ChevronRight size={16} className="text-muted" />
        </button>
      )}

      {activeGoals.length > 0 && (
        <Link to="/goals" className="glass mt-3 block rounded-2xl p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label flex items-center gap-1.5"><Target size={12} /> Major goals</span>
            <ChevronRight size={14} className="text-muted" />
          </div>
          {activeGoals.slice(0, 3).map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="truncate font-semibold">{g.title}</span>
              {g.pastDue ? <span className="shrink-0 text-xs font-bold text-bad">PAST DUE</span> : <span className="shrink-0"><Countdown to={g.deadlineAt} /></span>}
            </div>
          ))}
        </Link>
      )}

      <SectionTitle right={<span className="text-xs font-bold text-muted">{todayHabits.filter((h) => h.log).length}/{todayHabits.length}</span>}>Daily Habits</SectionTitle>
      <PrivateUnlockedBar s={s} />
      {sortedHabits.length === 0 ? (
        <EmptyHint text="No habits today. Add the disciplines you want to hold yourself to." onAdd={() => setEditing({ kind: 'new', as: 'habit' })} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sortedHabits.map((h) => (
            <HabitCard key={h.id} s={s} h={h} onOpen={() => setEditing({ kind: 'habit', id: h.id, edit: false })} onEdit={() => setEditing({ kind: 'habit', id: h.id, edit: true })} />
          ))}
        </div>
      )}

      <SectionTitle right={<span className="text-xs font-bold text-muted">{activeQuests.length} active</span>}>Quests</SectionTitle>
      {activeQuests.length === 0 && resolvedQuests.length === 0 ? (
        <EmptyHint text="No active quests. One-off missions with a deadline go here." onAdd={() => setEditing({ kind: 'new', as: 'quest' })} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {[...activeQuests, ...resolvedQuests].map((q) => (
            <QuestCard key={q.id} s={s} q={q} onOpen={() => setEditing({ kind: 'quest', id: q.id, edit: false })} onEdit={() => setEditing({ kind: 'quest', id: q.id, edit: true })} />
          ))}
        </div>
      )}

      {restHabits.length > 0 && (
        <>
          <SectionTitle>Resting today</SectionTitle>
          <p className="-mt-1 mb-2 text-xs text-muted">Not scheduled today, so nothing to do: no XP to gain or lose.</p>
          <div className="flex flex-wrap gap-2">
            {restHabits.map((h) => (
              <button key={h.id} onClick={() => setEditing({ kind: 'habit', id: h.id, edit: false })}
                className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-ink2">
                <Moon size={13} /> {h.title} <span className="text-xs text-muted">· {daysLabel(h.days)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <button onClick={() => setEditing({ kind: 'new', as: 'habit' })} aria-label="Add"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-[0_0_24px_color-mix(in_srgb,var(--sl-accent)_60%,transparent)] transition active:scale-90 md:bottom-8 md:right-8"
        style={{ background: 'linear-gradient(135deg, var(--sl-accent), var(--sl-accent2))' }}>
        <Plus size={26} />
      </button>

      <Sheet open={focusOpen} onClose={() => setFocusOpen(false)} title="Focus session">
        {focusOpen && <FocusForm s={s} onDone={() => setFocusOpen(false)} />}
      </Sheet>

      <Sheet open={sheetOpen} onClose={() => setEditing(null)} title={sheetTitle}>
        {editing?.kind === 'new' && <TaskForm key={`new-${editing.as}`} s={s} mode={{ kind: 'new', as: editing.as }} onDone={() => setEditing(null)} />}
        {editing && editing.kind !== 'new' && (openHabit || openQuest) && (
          editing.edit ? (
            <TaskForm key={`${editing.kind}${editing.id}`} s={s}
              mode={openHabit ? { kind: 'habit', habit: openHabit } : { kind: 'quest', quest: openQuest! }} onDone={() => setEditing(null)} />
          ) : (
            <TaskDetail s={s} task={openHabit ? { kind: 'habit', h: openHabit } : { kind: 'quest', q: openQuest! }}
              onEdit={() => setEditing({ ...editing, edit: true })} />
          )
        )}
      </Sheet>
    </div>
  );
}

function EmptyHint({ text, onAdd }: { text: string; onAdd: () => void }) {
  return (
    <button onClick={onAdd} className="w-full rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted transition hover:border-accent hover:text-ink2">
      {text}
      <span className="mt-2 flex items-center justify-center gap-1 font-bold text-accent"><Plus size={14} /> Add</span>
    </button>
  );
}
