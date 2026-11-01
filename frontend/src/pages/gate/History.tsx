import { useState } from 'react';
import { ChevronDown, Flame, Trophy, Clock, X } from 'lucide-react';
import { useGate, type Gate } from '../../lib/api';
import { Panel, SectionTitle } from '../../components/ui';
import { formatDay } from '../../lib/time';

const WEEK_STYLE: Record<Gate['streak']['weeks'][number]['status'], { cls: string; mark: string; label: string }> = {
  complete: { cls: 'bg-good/25 text-good', mark: '✓', label: 'Every workout done' },
  broken: { cls: 'bg-bad/20 text-bad', mark: '✗', label: 'A workout was missed' },
  open: { cls: 'border border-accent/60 text-accent', mark: '…', label: 'This week, in progress' },
  none: { cls: 'border border-line text-muted', mark: '○', label: 'No workouts planned' },
};

export function GateHistory() {
  const { data: g } = useGate();
  const [open, setOpen] = useState<number | null>(null);
  if (!g) return null;
  const fmt = (d: string) => formatDay(d);

  return (
    <div>
      <Panel className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label">Weekly streak</p>
            <p className="mt-1 flex items-center gap-2 text-3xl font-bold"><Flame size={24} className="text-accent2" />{g.streak.current}<span className="text-sm font-semibold text-ink2">weeks</span></p>
          </div>
          <div className="text-right text-sm text-ink2">Best <b className="text-ink">{g.streak.best}</b><br />{g.workoutsDone} workouts</div>
        </div>
        <div className="mt-4 flex gap-1.5" role="img" aria-label="Last weeks">
          {g.streak.weeks.map((w) => (
            <span key={w.start} title={`Week of ${fmt(w.start)}: ${WEEK_STYLE[w.status].label}`}
              className={`flex h-8 flex-1 items-center justify-center rounded-md text-xs font-bold ${WEEK_STYLE[w.status].cls}`}>{WEEK_STYLE[w.status].mark}</span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Oldest on the left. A week counts only when every planned workout in it is done.</p>
      </Panel>

      <SectionTitle>Sessions</SectionTitle>
      {g.history.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No sessions yet. Your first workout will appear here.</p>
      ) : (
        <div className="space-y-2">
          {g.history.map((h) => (
            <Panel key={h.id} brackets={false} className="p-4">
              <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === h.id ? null : h.id)} disabled={h.status === 'missed'}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {h.status === 'missed' && <X size={14} className="text-bad" />}
                    <span className={`truncate font-bold ${h.status === 'missed' ? 'text-bad' : ''}`}>{h.title}</span>
                    {!h.scheduled && h.status !== 'missed' && <span className="rounded bg-accent2/15 px-1.5 text-[10px] font-bold text-accent2">EXTRA</span>}
                  </span>
                  <span className="block text-xs text-muted">{fmt(h.date)}{h.status === 'missed' ? ' · missed (−50 XP)' : h.status === 'active' ? ' · in progress' : ''}</span>
                </span>
                {h.status !== 'missed' && (
                  <span className="shrink-0 text-right text-xs text-ink2">
                    {h.sets} set{h.sets === 1 ? '' : 's'}{h.volume > 0 && ` · ${h.volume.toLocaleString()} kg`}
                    <span className="mt-0.5 flex items-center justify-end gap-2">
                      {h.minutes !== null && <span className="flex items-center gap-0.5"><Clock size={11} />{h.minutes}m</span>}
                      {h.prs > 0 && <span className="flex items-center gap-0.5 font-bold text-accent2"><Trophy size={11} />{h.prs} PR</span>}
                    </span>
                  </span>
                )}
                {h.status !== 'missed' && <ChevronDown size={16} className={`mt-0.5 shrink-0 text-muted transition ${open === h.id ? 'rotate-180' : ''}`} />}
              </button>
              {open === h.id && (
                <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
                  {h.exercises.map((e) => (
                    <div key={e.name}>
                      <div className="font-semibold">{e.name}</div>
                      <div className="text-xs text-ink2">
                        {e.sets.map((s) => (s.seconds || s.km ? `${Math.round((s.seconds ?? 0) / 60)} min${s.km ? ` · ${s.km} km` : ''}` : `${s.reps ?? 0}${s.kg ? ` × ${s.kg} kg` : ' reps'}`)).join('  ·  ')}
                      </div>
                    </div>
                  ))}
                  {h.note && <p className="text-xs italic text-muted">{h.note}</p>}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
