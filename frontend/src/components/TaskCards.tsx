import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Undo2, Flame, Clock, Pencil, Skull, Crown, Link2, Trash2, Lock, LockOpen, CalendarDays } from 'lucide-react';
import { UnlockSheet } from './Private';
import { useQueryClient } from '@tanstack/react-query';
import type { AppState, Habit, Quest } from '../lib/api';
import { useAction } from '../lib/api';
import { DIFFICULTY_STYLE } from '../lib/theme';
import { CategoryIcon, useToast } from './ui';
import { sfx } from '../lib/sound';
import { Countdown } from './Countdown';
import { Button } from './ui';
import { daysLabel } from '../lib/time';

/** One chip per category, in the order they were picked. */
function CategoryChips({ s, ids }: { s: AppState; ids: number[] }) {
  return <>{ids.map((id) => <CategoryChip key={id} s={s} id={id} />)}</>;
}

function CategoryChip({ s, id }: { s: AppState; id: number }) {
  const c = s.categories.find((x) => x.id === id);
  if (!c) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 12%, transparent)` }}>
      <CategoryIcon name={c.icon} size={11} /> {c.name}
    </span>
  );
}

function DifficultyChip({ d }: { d: string }) {
  const st = DIFFICULTY_STYLE[d];
  return (
    <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider"
      style={{ color: st.color, borderColor: `color-mix(in srgb, ${st.color} 40%, transparent)` }}>
      {st.label}
    </span>
  );
}

function useTaskAction() {
  const action = useAction();
  const toast = useToast();
  return (path: string, done?: string, tone: 'good' | 'bad' | 'info' = 'info', method = 'POST') =>
    action.mutate({ path, method }, {
      onSuccess: () => {
        if (tone === 'good') sfx.complete();
        if (tone === 'bad') sfx.fail();
        if (done) toast(done, tone);
      },
      onError: (e) => toast(e.message, 'bad'),
    });
}

/** Card props shared by both kinds: tap the card for details, the pencil goes straight to editing. */
type CardProps = { s: AppState; onOpen: () => void; onEdit: () => void };

// The whole card is a tap target for touch and mouse; the title is the real button for keyboards and
// screen readers (a card with role="button" would wrap the Complete/Fail buttons, which is invalid).
const stop = (e: React.MouseEvent) => e.stopPropagation();
const TitleButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={(e) => { stop(e); onClick(); }} className="text-left">{children}</button>
);

/** Past the habit's "by HH:MM" today? (Still completable until midnight; it just shows late.) */
function isLate(deadline: string | null) {
  if (!deadline) return false;
  const [h, m] = deadline.split(':').map(Number);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() > h * 60 + m;
}

export function HabitCard({ s, h, onOpen, onEdit }: CardProps & { h: Habit }) {
  const run = useTaskAction();
  const [confirmFail, setConfirmFail] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const resolved = h.log !== null;
  const late = !resolved && isLate(h.deadlineTime);
  const unlock = () => setUnlockOpen(true);
  return (
    <>
      <motion.div layout onClick={h.masked ? unlock : onOpen}
        className={`glass relative cursor-pointer overflow-hidden rounded-2xl p-4 transition hover:border-accent/60 ${resolved ? 'opacity-70' : ''}`}>
        {h.log?.status === 'done' && <div className="absolute inset-y-0 left-0 w-1 bg-good" />}
        {h.log?.status === 'failed' && <div className="absolute inset-y-0 left-0 w-1 bg-bad" />}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryChips s={s} ids={h.categoryIds} />
              <DifficultyChip d={h.difficulty} />
              {h.streak > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-gold"><Flame size={11} />{h.streak}</span>
              )}
              {h.multiplier > 1 && !resolved && <span className="text-[11px] font-black text-accent2">×{h.multiplier}</span>}
            </div>
            {h.masked ? (
              // Looks like any other habit; tapping the name asks for the password.
              <p className={`mt-1.5 flex items-center gap-2 font-bold leading-snug ${h.log?.status === 'done' ? 'line-through decoration-good/60' : ''}`}>
                <Lock size={14} className="shrink-0 text-muted" /> <TitleButton onClick={unlock}><span className="tracking-widest text-ink2">{h.title}</span></TitleButton>
              </p>
            ) : (
              <h3 className={`mt-1.5 flex items-center gap-2 font-bold leading-snug ${h.log?.status === 'done' ? 'line-through decoration-good/60' : ''}`}>
                {h.private && <LockOpen size={14} className="shrink-0 text-accent" aria-label="Private habit" />}<TitleButton onClick={onOpen}>{h.title}</TitleButton>
              </h3>
            )}
            {h.description && <p className="mt-0.5 text-sm text-ink2">{h.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-ink2"><CalendarDays size={12} /> {daysLabel(h.days)}</span>
              {h.deadlineTime && (
                <span className={`inline-flex items-center gap-1 font-semibold ${late ? 'text-bad' : 'text-ink2'}`}>
                  <Clock size={12} /> by {h.deadlineTime}{late && ' · late'}
                </span>
              )}
              {resolved ? (
                <span className={`font-black ${h.log!.xp >= 0 ? 'text-good' : 'text-bad'}`}>{h.log!.xp >= 0 ? '+' : ''}{h.log!.xp} XP</span>
              ) : (
                <span className="font-bold text-muted"><span className="text-good">+{h.xpGain}</span> / <span className="text-bad">−{h.xpLoss}</span></span>
              )}
            </div>
          </div>
          <button onClick={(e) => { stop(e); (h.masked ? unlock : onEdit)(); }} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-ink" aria-label="Edit"><Pencil size={15} /></button>
        </div>

        <div className="mt-3 flex gap-2" onClick={stop}>
          {resolved ? (
            <button onClick={() => run(`/habits/${h.id}/undo`, 'Undone')} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-ink">
              <Undo2 size={13} /> Undo
            </button>
          ) : confirmFail ? (
            <>
              <button onClick={() => { setConfirmFail(false); run(`/habits/${h.id}/fail`, `−${h.xpLoss} XP. Rise again tomorrow.`, 'bad'); }}
                className="flex-1 rounded-xl border border-bad/50 bg-bad/15 py-2 text-sm font-bold text-bad">Confirm fail</button>
              <button onClick={() => setConfirmFail(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink2">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => run(`/habits/${h.id}/complete`, `+${h.xpGain} XP`, 'good')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-good/40 bg-good/10 py-2 text-sm font-bold text-good active:scale-95">
                <Check size={16} /> Complete
              </button>
              <button onClick={() => setConfirmFail(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-bad/30 px-4 py-2 text-sm font-bold text-bad/80 active:scale-95">
                <X size={16} /> Fail
              </button>
            </>
          )}
        </div>
      </motion.div>
      {/* Outside the card: taps inside the sheet must not bubble up and open the card. */}
      <UnlockSheet open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </>
  );
}

export function QuestCard({ s, q, onOpen, onEdit }: CardProps & { q: Quest }) {
  const run = useTaskAction();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<null | 'fail' | 'delete'>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const unlock = () => setUnlockOpen(true);
  const pending = q.status === 'pending';
  const isBoss = q.boss !== 'none';
  return (
    <>
      <motion.div layout onClick={q.masked ? unlock : onOpen}
        className={`glass relative cursor-pointer overflow-hidden rounded-2xl p-4 transition hover:border-accent/60 ${!pending ? 'opacity-70' : ''} ${isBoss && pending ? 'border-accent/60 shadow-[0_0_24px_color-mix(in_srgb,var(--sl-accent)_25%,transparent)]' : ''}`}>
        {q.status === 'done' && <div className="absolute inset-y-0 left-0 w-1 bg-good" />}
        {q.status === 'failed' && <div className="absolute inset-y-0 left-0 w-1 bg-bad" />}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {q.boss === 'weekly' && <span className="inline-flex items-center gap-1 rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-accent"><Crown size={11} /> Weekly Mega Boss</span>}
              {q.boss === 'boss' && <span className="inline-flex items-center gap-1 rounded-md bg-bad/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-bad"><Skull size={11} /> Boss</span>}
              <CategoryChips s={s} ids={q.categoryIds} />
              <DifficultyChip d={q.difficulty} />
              {q.chain && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ink2"><Link2 size={11} /> Part {q.chain.index}/{q.chain.total}</span>}
            </div>
            <h3 className={`mt-1.5 flex items-center gap-2 font-bold leading-snug ${q.status === 'done' ? 'line-through decoration-good/60' : ''}`}>
              {q.masked ? <Lock size={14} className="shrink-0 text-muted" /> : q.private && <LockOpen size={14} className="shrink-0 text-accent" aria-label="Private quest" />}
              <TitleButton onClick={q.masked ? unlock : onOpen}><span className={q.masked ? 'tracking-widest text-ink2' : ''}>{q.title}</span></TitleButton>
            </h3>
            {q.description && <p className="mt-0.5 text-sm text-ink2">{q.description}</p>}
            <div className="mt-2 flex items-center gap-3 text-xs">
              {pending ? (
                <>
                  <span className="inline-flex items-center gap-1 text-ink2"><Clock size={12} /><Countdown to={q.deadlineAt} onExpire={() => qc.invalidateQueries({ queryKey: ['state'] })} /></span>
                  <span className="font-bold text-muted"><span className="text-good">+{q.xp}</span> / <span className="text-bad">−{q.xp}</span></span>
                </>
              ) : (
                <span className={`font-black ${q.status === 'done' ? 'text-good' : 'text-bad'}`}>{q.status === 'done' ? `+${q.xp}` : `−${q.xp}`} XP</span>
              )}
            </div>
          </div>
          {pending && <button onClick={(e) => { stop(e); (q.masked ? unlock : onEdit)(); }} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-ink" aria-label="Edit"><Pencil size={15} /></button>}
        </div>

        <div className="mt-3 flex gap-2" onClick={stop}>
          {!pending ? (
            q.canUndo && (
              <button onClick={() => run(`/quests/${q.id}/undo`, 'Undone')} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-ink">
                <Undo2 size={13} /> Undo
              </button>
            )
          ) : confirm ? (
            <>
              <button
                onClick={() => {
                  setConfirm(null);
                  if (confirm === 'fail') run(`/quests/${q.id}/fail`, `Quest abandoned. −${q.xp} XP`, 'bad');
                  else run(`/quests/${q.id}`, 'Quest removed', 'info', 'DELETE');
                }}
                className="flex-1 rounded-xl border border-bad/50 bg-bad/15 py-2 text-sm font-bold text-bad">
                {confirm === 'fail' ? `Abandon (−${q.xp} XP)` : 'Remove, no penalty'}
              </button>
              <button onClick={() => setConfirm(null)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink2">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => run(`/quests/${q.id}/complete`, `Quest cleared! +${q.xp} XP`, 'good')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-good/40 bg-good/10 py-2 text-sm font-bold text-good active:scale-95">
                <Check size={16} /> Clear
              </button>
              <button onClick={() => setConfirm('fail')} className="rounded-xl border border-bad/30 px-3 py-2 text-sm font-bold text-bad/80" aria-label="Abandon"><X size={16} /></button>
              {/* Free removal is for the first hour only (typos); after that a quest can only be abandoned. */}
            {Date.now() < Date.parse(q.freeRemoveUntil) && (
              <button onClick={() => (q.masked ? unlock() : setConfirm('delete'))} className="rounded-xl border border-line px-3 py-2 text-sm text-muted" aria-label="Remove"><Trash2 size={15} /></button>
            )}
            </>
          )}
        </div>
      </motion.div>
      <UnlockSheet open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------- details popup

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <div className="label">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{children}</div>
    </div>
  );
}

/** What a tapped habit or quest shows: everything about it, plus Edit. */
export function TaskDetail({ s, task, onEdit }: { s: AppState; task: { kind: 'habit'; h: Habit } | { kind: 'quest'; q: Quest }; onEdit: () => void }) {
  const t = task.kind === 'habit' ? task.h : task.q;
  const deadline = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {task.kind === 'quest' && task.q.boss === 'weekly' && <span className="inline-flex items-center gap-1 rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-accent"><Crown size={11} /> Weekly Mega Boss</span>}
        {task.kind === 'quest' && task.q.boss === 'boss' && <span className="inline-flex items-center gap-1 rounded-md bg-bad/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-bad"><Skull size={11} /> Boss</span>}
        <CategoryChips s={s} ids={t.categoryIds} />
        <DifficultyChip d={t.difficulty} />
        {t.private && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent"><LockOpen size={11} /> Private</span>}
      </div>
      <h4 className="mt-2 text-xl font-black leading-snug">{t.title}</h4>
      {t.description && <p className="mt-1 whitespace-pre-line text-sm text-ink2">{t.description}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {task.kind === 'habit' ? (
          <>
            <Fact label="Repeats">{daysLabel(task.h.days)}</Fact>
            <Fact label="Deadline">{task.h.deadlineTime ? `by ${task.h.deadlineTime}` : 'End of day'}</Fact>
            <Fact label="Streak"><span className="inline-flex items-center gap-1"><Flame size={13} className="text-gold" />{task.h.streak} day{task.h.streak === 1 ? '' : 's'}</span>{task.h.multiplier > 1 && <span className="ml-1.5 text-accent2">×{task.h.multiplier}</span>}</Fact>
            <Fact label="XP"><span className="text-good">+{task.h.xpGain}</span> / <span className="text-bad">−{task.h.xpLoss}</span></Fact>
            <Fact label="Today">{!task.h.scheduledToday ? 'Rest day' : task.h.log ? (task.h.log.status === 'done' ? <span className="text-good">Done</span> : <span className="text-bad">Failed</span>) : 'Not done yet'}</Fact>
          </>
        ) : (
          <>
            <Fact label="Deadline">{deadline(task.q.deadlineAt)}</Fact>
            <Fact label="Time left">{task.q.status === 'pending' ? <Countdown to={task.q.deadlineAt} /> : <span className={task.q.status === 'done' ? 'text-good' : 'text-bad'}>{task.q.status === 'done' ? 'Cleared' : 'Failed'}</span>}</Fact>
            <Fact label="XP"><span className="text-good">+{task.q.xp}</span> / <span className="text-bad">−{task.q.xp}</span></Fact>
            <Fact label="Credits">+{task.q.credits}</Fact>
            {task.q.chain && <Fact label="Chain"><span className="inline-flex items-center gap-1"><Link2 size={13} /> Part {task.q.chain.index} of {task.q.chain.total}</span></Fact>}
          </>
        )}
      </div>

      {(task.kind === 'habit' || task.q.status === 'pending') && (
        <Button className="mt-5 w-full" onClick={onEdit}><Pencil size={15} /> Edit</Button>
      )}
    </div>
  );
}
