import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Footprints, Trash2 } from 'lucide-react';
import { KM_PER_MI, RUN_MIN_KM, RUN_XP, creditsFor, formatDuration, paceSeconds } from '@shared';
import { useGate, useGateAction, type Run, type RunUnit } from '../../lib/api';
import { Button, Panel, SectionTitle, useToast } from '../../components/ui';
import { sfx } from '../../lib/sound';
import { formatDay } from '../../lib/time';
import { holdCelebrations } from '../../lib/celebrate';
import { ClearSplash } from './effects';

// Runs: record distance + time, the pace is worked out. Separate from workout sessions, with their own history.

const round2 = (n: number) => Math.round(n * 100) / 100;
const inUnit = (km: number, unit: RunUnit) => (unit === 'mi' ? km / KM_PER_MI : km);
const num = (v: string) => (v.trim() === '' ? 0 : Number(v));

export function Runs() {
  const { data: g } = useGate();
  const action = useGateAction();
  const toast = useToast();
  const [unit, setUnit] = useState<RunUnit | null>(null); // null → the last unit used
  const [distance, setDistance] = useState('');
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const [sec, setSec] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<{ distance: string; time: string; pace: string; xp: number } | null>(null);
  const release = useRef<(() => void) | null>(null);
  const closeSplash = useCallback(() => { setDone(null); release.current?.(); release.current = null; }, []);
  useEffect(() => () => release.current?.(), []);
  if (!g) return null;
  const runs = g.runs;
  const u = unit ?? runs.unit;

  const dist = num(distance);
  const seconds = num(h) * 3600 + num(m) * 60 + num(sec);
  const valid = dist > 0 && seconds >= 60 && [distance, h, m, sec].every((v) => v.trim() === '' || Number.isFinite(Number(v)));
  const pace = valid ? paceSeconds(dist, seconds) : 0;
  const km = u === 'mi' ? dist * KM_PER_MI : dist;
  const paidToday = runs.list.some((r) => r.date === g.today && r.xp > 0);
  const willPay = valid && km >= RUN_MIN_KM && !paidToday;

  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { set(e.target.value); setConfirming(false); };

  const record = () => {
    release.current = holdCelebrations(); // a level-up from this run plays after the splash
    const summary = { distance: `${round2(dist)} ${u}`, time: formatDuration(seconds), pace: `${formatDuration(pace)}/${u}` };
    action.mutate({ path: '/runs', body: { distance: dist, unit: u, seconds, note } }, {
      onSuccess: (r) => {
        const got = r.gate.runs.list.find((x) => x.id === r.id)?.xp ?? 0;
        sfx.levelUp();
        toast(got ? `Run recorded: +${RUN_XP} XP · +${creditsFor(RUN_XP)} credits` : 'Run recorded', 'good');
        setDone({ ...summary, xp: got });
        setDistance(''); setH(''); setM(''); setSec(''); setNote(''); setConfirming(false);
      },
      onError: (e) => { closeSplash(); toast(e.message, 'bad'); setConfirming(false); },
    });
  };

  const remove = (r: Run) => {
    if (!confirm(`Remove today's ${round2(r.distance)} ${r.unit} run?${r.xp ? ` Its +${RUN_XP} XP goes too.` : ''}`)) return;
    action.mutate({ method: 'DELETE', path: `/runs/${r.id}` }, { onError: (e) => toast(e.message, 'bad') });
  };

  return (
    <div>
      <AnimatePresence>
        {done && (
          <ClearSplash kicker="Run complete" title={done.distance.toUpperCase()} detail={`${done.time} · ${done.pace}`}
            rewards={done.xp ? [`+${done.xp} XP`, `+${creditsFor(done.xp)} credits`] : undefined} onClose={closeSplash} />
        )}
      </AnimatePresence>
      <Panel className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="label">Record a run</p>
          <div className="flex rounded-lg border border-line p-0.5 text-xs font-bold">
            {(['km', 'mi'] as RunUnit[]).map((x) => (
              <button key={x} onClick={() => { setUnit(x); setConfirming(false); }}
                className={`rounded-md px-3 py-1 ${u === x ? 'bg-accent/20 text-ink' : 'text-muted'}`}>{x === 'km' ? 'Km' : 'Miles'}</button>
            ))}
          </div>
        </div>

        <label className="mb-1 block text-xs text-muted">Distance ({u === 'km' ? 'km' : 'miles'})</label>
        <input className="field mb-3" type="number" inputMode="decimal" min="0" step="0.01" value={distance} onChange={edit(setDistance)} placeholder={u === 'km' ? 'e.g. 5' : 'e.g. 3.1'} />

        <label className="mb-1 block text-xs text-muted">Time</label>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {([['h', h, setH, 'hr'], ['m', m, setM, 'min'], ['s', sec, setSec, 'sec']] as const).map(([k, v, set, label]) => (
            <div key={k} className="relative">
              <input className="field pr-10" type="number" inputMode="numeric" min="0" max={k === 'h' ? 47 : 59} value={v} onChange={edit(set)} placeholder="0" aria-label={label} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{label}</span>
            </div>
          ))}
        </div>

        <input className="field mb-3" value={note} onChange={edit(setNote)} maxLength={200} placeholder="Note (optional), e.g. Park loop" />

        <div className="mb-3 flex items-baseline justify-between rounded-xl border border-line px-3 py-2">
          <span className="text-xs text-muted">Pace</span>
          <span className="font-display text-xl font-bold">{pace ? formatDuration(pace) : '–:––'}<span className="ml-1 text-xs font-semibold text-ink2">/{u}</span></span>
        </div>

        {confirming ? (
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button className="flex-[2]" onClick={record} disabled={action.isPending}>Confirm {round2(dist)} {u} · {formatDuration(seconds)}</Button>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setConfirming(true)} disabled={!valid}>
            <Footprints size={16} /> Record run{willPay ? ` · +${RUN_XP} XP` : ''}
          </Button>
        )}
        <p className="mt-2 text-[11px] text-muted">
          {paidToday ? "Today's run XP is claimed: more runs today are recorded without XP." : `The first run of the day (at least ${RUN_MIN_KM} km) gives +${RUN_XP} XP · Body.`}
        </p>
      </Panel>

      {runs.list.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ['Runs', String(runs.list.length)],
            ['Total', `${round2(inUnit(runs.totalKm, u))} ${u}`],
            ['Best pace', runs.bestPaceKm ? `${formatDuration(u === 'mi' ? runs.bestPaceKm * KM_PER_MI : runs.bestPaceKm)}/${u}` : '–'],
          ].map(([label, v]) => (
            <Panel key={label} brackets={false} className="px-2 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
              <p className="mt-0.5 font-bold">{v}</p>
            </Panel>
          ))}
        </div>
      )}

      <SectionTitle>Runs</SectionTitle>
      {runs.list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No runs yet. Your first one will appear here.</p>
      ) : (
        <div className="space-y-2">
          {runs.list.map((r) => (
            <Panel key={r.id} brackets={false} className="flex items-center gap-3 p-4">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-bold">{round2(r.distance)} {r.unit}</span>
                  <span className="text-sm text-ink2">in {formatDuration(r.seconds)}</span>
                  {r.xp > 0 && <span className="rounded bg-good/15 px-1.5 text-[10px] font-bold text-good">+{r.xp} XP</span>}
                </span>
                <span className="block truncate text-xs text-muted">{formatDay(r.date)}{r.note && ` · ${r.note}`}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-bold">{formatDuration(r.pace)}</span>
                <span className="block text-[10px] text-muted">/{r.unit}</span>
              </span>
              {r.date === g.today && (
                <button onClick={() => remove(r)} disabled={action.isPending} aria-label="Remove run" className="rounded-lg p-1.5 text-muted hover:text-bad">
                  <Trash2 size={15} />
                </button>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
