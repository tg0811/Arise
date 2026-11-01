import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Camera, Plus, Pencil, LogOut, ScrollText, ChevronRight, Bell, BellRing, Volume2, VolumeX, Download, Upload, AlertTriangle, KeyRound } from 'lucide-react';
import { disablePush, enablePush, pushStatus, type PushStatus } from '../lib/push';
import { setSoundEnabled, sfx, soundEnabled } from '../lib/sound';
import { api, useAction, type AppState, type Category } from '../lib/api';
import { Avatar, resizeImage } from '../components/Avatar';
import { BodyStats } from '../components/BodyStats';
import { USERNAME_RE } from '@shared';
import { Button, CATEGORY_ICONS, CategoryIcon, Panel, SectionTitle, Sheet, useToast } from '../components/ui';

const COLORS = ['#60a5fa', '#f87171', '#c084fc', '#facc15', '#fb923c', '#4ade80', '#22d3ee', '#f472b6', '#a3e635', '#e2e8f0'];

export function Settings({ s }: { s: AppState }) {
  const action = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(s.profile.name);
  const [username, setUsername] = useState(s.profile.username);
  const identityChanged = name.trim() !== s.profile.name || username.trim() !== s.profile.username;
  const usernameOk = USERNAME_RE.test(username.trim());
  const [editingCat, setEditingCat] = useState<Category | 'new' | null>(null);
  const [pwOpen, setPwOpen] = useState(false);

  const saveProfile = (body: object, msg = 'Saved') =>
    action.mutate({ method: 'PUT', path: '/profile', body }, { onSuccess: () => toast(msg, 'good'), onError: (e) => toast(e.message, 'bad') });

  const logout = async () => {
    await api('POST', '/auth/logout');
    qc.clear();
    location.reload();
  };

  return (
    <div className="pt-2">
      <Link to="/settings/rules" className="glass mt-3 flex items-center gap-3 rounded-2xl p-4 transition hover:border-accent">
        <span className="rounded-xl bg-accent/15 p-2.5 text-accent"><ScrollText size={20} /></span>
        <span className="flex-1">
          <span className="block font-display font-bold tracking-wider">Rules of the System</span>
          <span className="block text-xs text-ink2">XP, failing, streaks, levels, ranks: every rule in one place</span>
        </span>
        <ChevronRight size={18} className="text-muted" />
      </Link>

      <SectionTitle>Profile</SectionTitle>
      <Panel className="p-5">
        <div className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()} className="relative">
            <Avatar src={s.profile.avatar} name={s.profile.name} rank={s.progress.rank} size={64} />
            <span className="absolute bottom-1 right-1 rounded-full bg-accent p-1.5 text-white"><Camera size={12} /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) saveProfile({ avatar: await resizeImage(f) }, 'Photo updated'); }} />
          <div className="min-w-0 flex-1 space-y-2">
            <label className="block"><span className="label mb-1 block">Full name</span>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" />
            </label>
            <label className="block"><span className="label mb-1 block">Username <span className="normal-case tracking-normal text-muted">(shown in the header)</span></span>
              <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            </label>
            {!usernameOk && <p className="text-xs text-bad">3–20 letters, digits, _ or .</p>}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => saveProfile({ name: name.trim(), username: username.trim() })} disabled={!name.trim() || !usernameOk || !identityChanged}>Save</Button>
              {s.profile.avatar && <Button variant="ghost" onClick={() => saveProfile({ avatar: null }, 'Photo removed')}>Remove photo</Button>}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <BodyStats s={s} />
          <label className="inline-flex items-center gap-2 text-sm text-ink2">
            Height
            <input type="number" className="field w-20 py-1" defaultValue={s.profile.heightCm ?? ''} min={50} max={260}
              onBlur={(e) => { const v = Number(e.target.value); if (v && v !== s.profile.heightCm) saveProfile({ heightCm: v }, 'Height updated'); }} />
            cm
          </label>
        </div>
        <p className="mt-4 text-xs text-muted">Timezone: {s.profile.timezone} — days roll over at midnight here.</p>
      </Panel>

      <SectionTitle right={<button onClick={() => setEditingCat('new')} className="inline-flex items-center gap-1 text-xs font-bold text-accent"><Plus size={13} /> Add</button>}>
        Categories
      </SectionTitle>
      <Panel brackets={false} className="divide-y divide-line">
        {s.categories.map((c) => (
          <button key={c.id} onClick={() => setEditingCat(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5">
            <span className="rounded-lg p-1.5" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}><CategoryIcon name={c.icon} size={16} /></span>
            <span className="flex-1 font-semibold">{c.name}</span>
            <span className="text-xs text-muted">Lv {c.level}</span>
            <Pencil size={14} className="text-muted" />
          </button>
        ))}
      </Panel>

      <Notifications s={s} />
      <DataSection />

      <SectionTitle>Session</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => setPwOpen(true)}><KeyRound size={15} /> Change password</Button>
        <Button variant="ghost" onClick={logout}><LogOut size={15} /> Log out</Button>
      </div>

      <Sheet open={pwOpen} onClose={() => setPwOpen(false)} title="Change password">
        {pwOpen && <PasswordForm onDone={() => setPwOpen(false)} />}
      </Sheet>

      <Sheet open={editingCat !== null} onClose={() => setEditingCat(null)} title={editingCat === 'new' ? 'New category' : 'Edit category'}>
        {editingCat && <CategoryForm key={editingCat === 'new' ? 'new' : editingCat.id} cat={editingCat === 'new' ? null : editingCat} onDone={() => setEditingCat(null)} />}
      </Sheet>
    </div>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) return setError('New passwords do not match');
    setBusy(true);
    try {
      await api('POST', '/password', { current, next });
      toast('Password changed. Other devices are signed out.', 'good');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input type="password" className="field" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
      <input type="password" className="field" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <input type="password" className="field" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}
      <p className="text-xs text-muted">At least 6 characters. Your other devices will need to log in again.</p>
      <Button type="submit" className="w-full" disabled={busy || !current || next.length < 6}>Change password</Button>
    </form>
  );
}

function CategoryForm({ cat, onDone }: { cat: Category | null; onDone: () => void }) {
  const action = useAction();
  const toast = useToast();
  const [name, setName] = useState(cat?.name ?? '');
  const [color, setColor] = useState(cat?.color ?? COLORS[0]);
  const [icon, setIcon] = useState(cat?.icon ?? 'target');
  const done = { onSuccess: () => { toast('Saved', 'good'); onDone(); }, onError: (e: Error) => toast(e.message, 'bad') };

  return (
    <div>
      <label className="mb-4 block"><span className="label mb-1.5 block">Name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus />
      </label>
      <span className="label mb-1.5 block">Color</span>
      <div className="mb-4 flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />
        ))}
      </div>
      <span className="label mb-1.5 block">Icon</span>
      <div className="mb-5 grid grid-cols-8 gap-1.5">
        {Object.keys(CATEGORY_ICONS).map((k) => (
          <button key={k} onClick={() => setIcon(k)} className={`flex aspect-square items-center justify-center rounded-lg border ${icon === k ? 'border-accent bg-accent/20' : 'border-line'}`}
            style={{ color: icon === k ? color : undefined }}>
            <CategoryIcon name={k} size={16} />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {cat && (
          <Button variant="bad" onClick={() => confirm(`Remove "${cat.name}"? Past XP stays in history.`) && action.mutate({ method: 'DELETE', path: `/categories/${cat.id}` }, done)}>
            Remove
          </Button>
        )}
        <Button className="flex-1" disabled={!name.trim() || action.isPending}
          onClick={() => action.mutate(cat ? { method: 'PUT', path: `/categories/${cat.id}`, body: { name, color, icon } } : { path: '/categories', body: { name, color, icon } }, done)}>
          Save
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- notifications & sound

const STATUS_TEXT: Record<PushStatus, string> = {
  on: 'On for this device',
  off: 'Off on this device',
  blocked: 'Blocked in browser settings: allow notifications for this site, then try again',
  insecure: 'Needs HTTPS. Works once the app is deployed (or on localhost)',
  unsupported: 'This browser does not support push notifications',
};

function Notifications({ s }: { s: AppState }) {
  const qc = useQueryClient();
  const action = useAction();
  const toast = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(soundEnabled());
  const r = s.reminders;
  useEffect(() => { void pushStatus().then(setStatus); }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      const next = status === 'on' ? await disablePush() : await enablePush();
      qc.setQueryData(['state'], next);
      setStatus(await pushStatus());
      toast(status === 'on' ? 'Notifications off for this device' : 'Notifications on', 'good');
    } catch (e) {
      toast((e as Error).message, 'bad');
      setStatus(await pushStatus());
    } finally {
      setBusy(false);
    }
  };

  const save = (patch: Partial<typeof r>) => {
    const { devices: _devices, ...prefs } = { ...r, ...patch };
    action.mutate({ method: 'PUT', path: '/reminders', body: prefs }, { onError: (e) => toast(e.message, 'bad') });
  };

  // TEMPORARY (owner request 2026-10-31): manual test button while notifications are being tried out.
  const test = async () => {
    try {
      await api('POST', '/push/test');
      toast('Test sent. Check your notifications.', 'good');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  return (
    <>
      <SectionTitle>Notifications</SectionTitle>
      <Panel className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Bell size={18} className={status === 'on' ? 'text-accent' : 'text-muted'} />
          <div className="flex-1">
            <p className="font-semibold">Push reminders</p>
            <p className="text-xs text-muted">{status ? STATUS_TEXT[status] : 'Checking…'}{r.devices > 0 && ` · ${r.devices} device${r.devices > 1 ? 's' : ''} subscribed`}</p>
          </div>
          {(status === 'on' || status === 'off') && (
            <Button variant={status === 'on' ? 'ghost' : 'primary'} onClick={toggle} disabled={busy}>{status === 'on' ? 'Turn off' : 'Turn on'}</Button>
          )}
        </div>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Send reminders<span className="block text-xs text-muted">Applies to every subscribed device</span></span>
          <input type="checkbox" checked={r.enabled} onChange={(e) => save({ enabled: e.target.checked })} className="h-4 w-4 accent-[var(--sl-accent)]" />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Remind me every<span className="block text-xs text-muted">"N tasks still undone": only today's scheduled tasks, never when all are done</span></span>
          <select className="field w-24" value={r.intervalHours} onChange={(e) => save({ intervalHours: Number(e.target.value) })}>
            {[1, 2, 3, 4, 6, 8].map((h) => <option key={h} value={h}>{h} h</option>)}
          </select>
        </label>
        <div className="text-sm">
          <span>Quiet hours<span className="block text-xs text-muted">No interval reminders in this window</span></span>
          <span className="mt-2 flex items-center gap-2">
            <input type="time" className="field flex-1 py-1.5" aria-label="Quiet hours start" value={r.quietStart} onChange={(e) => e.target.value && save({ quietStart: e.target.value })} />
            <span className="text-muted">to</span>
            <input type="time" className="field flex-1 py-1.5" aria-label="Quiet hours end" value={r.quietEnd} onChange={(e) => e.target.value && save({ quietEnd: e.target.value })} />
          </span>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Deadline nudge<span className="block text-xs text-muted">Before a habit's "by" time or a quest's deadline (ignores quiet hours)</span></span>
          <select className="field w-28" value={r.nudgeMinutes} onChange={(e) => save({ nudgeMinutes: Number(e.target.value) })}>
            {[0, 15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m === 0 ? 'Off' : `${m} min`}</option>)}
          </select>
        </label>

        <Button variant="ghost" className="w-full" onClick={test} disabled={r.devices === 0}>
          <BellRing size={15} /> Send test notification
        </Button>

        <label className="flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
          <span className="flex items-center gap-2">{sound ? <Volume2 size={16} /> : <VolumeX size={16} />} Sound effects<span className="text-xs text-muted">(this device)</span></span>
          <input type="checkbox" checked={sound} onChange={(e) => { setSoundEnabled(e.target.checked); setSound(e.target.checked); if (e.target.checked) sfx.complete(); }} className="h-4 w-4 accent-[var(--sl-accent)]" />
        </label>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- backup, restore, reset

function DataSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [phrase, setPhrase] = useState('');

  const restore = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return toast('That file is not valid JSON', 'bad');
    }
    if (!confirm('Overwrite ALL current data with this backup? This cannot be undone.')) return;
    try {
      qc.setQueryData(['state'], await api('POST', '/restore', data));
      await qc.invalidateQueries({ queryKey: ['archive'] });
      toast('Progress restored from backup', 'good');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  const reset = async () => {
    try {
      qc.setQueryData(['state'], await api('POST', '/reset', { phrase }));
      await qc.invalidateQueries({ queryKey: ['archive'] });
      setResetOpen(false);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  return (
    <>
      <SectionTitle>Data</SectionTitle>
      <Panel brackets={false} className="divide-y divide-line">
        <a href="/api/backup" download className="flex items-center gap-3 px-4 py-3 hover:bg-white/5">
          <Download size={16} className="text-accent" />
          <span className="flex-1 text-sm font-semibold">Download backup<span className="block text-xs font-normal text-muted">Everything as one JSON file (no password inside)</span></span>
        </a>
        <button onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5">
          <Upload size={16} className="text-accent" />
          <span className="flex-1 text-sm font-semibold">Restore from backup<span className="block text-xs font-normal text-muted">Replaces all current data</span></span>
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f); }} />
        <button onClick={() => { setPhrase(''); setResetOpen(true); }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5">
          <AlertTriangle size={16} className="text-bad" />
          <span className="flex-1 text-sm font-semibold text-bad">Reset everything<span className="block text-xs font-normal text-muted">Wipe all progress and start over from the Awakening</span></span>
        </button>
      </Panel>

      <Sheet open={resetOpen} onClose={() => setResetOpen(false)} title="Reset everything">
        <p className="text-sm text-ink2">This wipes <b className="text-bad">all</b> progress: XP, levels, habits, quests, goals, journal, store and history. Your login and notification devices stay. There is no undo. Download a backup first if you might want it back.</p>
        <p className="mt-4 text-sm">Type <b className="font-mono text-bad">{RESET_PHRASE}</b> to confirm:</p>
        <input className="field mt-2 font-mono" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Type here…" autoCapitalize="characters" />
        <Button variant="bad" className="mt-4 w-full" disabled={phrase !== RESET_PHRASE} onClick={reset}>I accept the reset</Button>
      </Sheet>
    </>
  );
}

const RESET_PHRASE = 'I ACCEPT THE RESET';
