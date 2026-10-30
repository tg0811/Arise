import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Moon, Target, ChevronRight } from 'lucide-react';
import { LootboxButton } from '../components/Lootbox';
import { Countdown } from '../components/Countdown';
import { DAY_CLEAR_RATIO } from '@shared';
import type { AppState, Habit, Quest } from '../lib/api';
import { HabitCard, QuestCard } from '../components/TaskCards';
import { TaskForm } from '../components/TaskForm';
import { Panel, ProgressBar, SectionTitle, Sheet } from '../components/ui';

type Editing = { kind: 'new' } | { kind: 'habit'; habit: Habit } | { kind: 'quest'; quest: Quest } | null;

export function Today({ s }: { s: AppState }) {
  const [editing, setEditing] = useState<Editing>(null);
  const todayHabits = s.habits.filter((h) => h.scheduledToday);
  const restHabits = s.habits.filter((h) => !h.scheduledToday);
  // Unresolved first, then done, then failed.
  const order = (h: Habit) => (h.log === null ? 0 : h.log.status === 'done' ? 1 : 2);
  const sortedHabits = [...todayHabits].sort((a, b) => order(a) - order(b));
  const activeQuests = s.quests.filter((q) => q.status === 'pending');
  const resolvedQuests = s.quests.filter((q) => q.status !== 'pending');
  const t = s.streak.today;
  const activeGoals = s.goals.filter((g) => g.status === 'active');
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
      {sortedHabits.length === 0 ? (
        <EmptyHint text="No habits today. Add the disciplines you want to hold yourself to." onAdd={() => setEditing({ kind: 'new' })} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sortedHabits.map((h) => <HabitCard key={h.id} s={s} h={h} onEdit={() => setEditing({ kind: 'habit', habit: h })} />)}
        </div>
      )}

      <SectionTitle right={<span className="text-xs font-bold text-muted">{activeQuests.length} active</span>}>Quests</SectionTitle>
      {activeQuests.length === 0 && resolvedQuests.length === 0 ? (
        <EmptyHint text="No active quests. One-off missions with a deadline go here." onAdd={() => setEditing({ kind: 'new' })} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {[...activeQuests, ...resolvedQuests].map((q) => <QuestCard key={q.id} s={s} q={q} onEdit={() => setEditing({ kind: 'quest', quest: q })} />)}
        </div>
      )}

      {restHabits.length > 0 && (
        <>
          <SectionTitle>Resting today</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {restHabits.map((h) => (
              <button key={h.id} onClick={() => setEditing({ kind: 'habit', habit: h })}
                className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-ink2">
                <Moon size={13} /> {h.title}
              </button>
            ))}
          </div>
        </>
      )}

      <button onClick={() => setEditing({ kind: 'new' })} aria-label="Add"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-[0_0_24px_color-mix(in_srgb,var(--sl-accent)_60%,transparent)] transition active:scale-90 md:bottom-8 md:right-8"
        style={{ background: 'linear-gradient(135deg, var(--sl-accent), var(--sl-accent2))' }}>
        <Plus size={26} />
      </button>

      <Sheet open={editing !== null} onClose={() => setEditing(null)}
        title={editing?.kind === 'habit' ? 'Edit habit' : editing?.kind === 'quest' ? 'Edit quest' : 'New task'}>
        {editing && (
          <TaskForm key={editing.kind === 'habit' ? `h${editing.habit.id}` : editing.kind === 'quest' ? `q${editing.quest.id}` : 'new'}
            s={s} mode={editing} onDone={() => setEditing(null)} />
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
