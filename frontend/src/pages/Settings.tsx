import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Plus, Pencil, LogOut } from 'lucide-react';
import { api, useAction, type AppState, type Category } from '../lib/api';
import { Avatar, resizeImage } from '../components/Avatar';
import { BodyStats } from '../components/BodyStats';
import { Button, CATEGORY_ICONS, CategoryIcon, Panel, SectionTitle, Sheet, useToast } from '../components/ui';

const COLORS = ['#60a5fa', '#f87171', '#c084fc', '#facc15', '#fb923c', '#4ade80', '#22d3ee', '#f472b6', '#a3e635', '#e2e8f0'];

export function Settings({ s }: { s: AppState }) {
  const action = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(s.profile.name);
  const [editingCat, setEditingCat] = useState<Category | 'new' | null>(null);

  const saveProfile = (body: object, msg = 'Saved') =>
    action.mutate({ method: 'PUT', path: '/profile', body }, { onSuccess: () => toast(msg, 'good'), onError: (e) => toast(e.message, 'bad') });

  const logout = async () => {
    await api('POST', '/auth/logout');
    qc.clear();
    location.reload();
  };

  return (
    <div className="pt-2">
      <SectionTitle>Profile</SectionTitle>
      <Panel className="p-5">
        <div className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()} className="relative">
            <Avatar src={s.profile.avatar} name={s.profile.name} rank={s.progress.rank} size={64} />
            <span className="absolute bottom-1 right-1 rounded-full bg-accent p-1.5 text-white"><Camera size={12} /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) saveProfile({ avatar: await resizeImage(f) }, 'Photo updated'); }} />
          <div className="flex-1 space-y-2">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => saveProfile({ name })} disabled={!name.trim() || name === s.profile.name}>Save name</Button>
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

      <SectionTitle>Session</SectionTitle>
      <Button variant="ghost" onClick={logout}><LogOut size={15} /> Log out</Button>

      <Sheet open={editingCat !== null} onClose={() => setEditingCat(null)} title={editingCat === 'new' ? 'New category' : 'Edit category'}>
        {editingCat && <CategoryForm key={editingCat === 'new' ? 'new' : editingCat.id} cat={editingCat === 'new' ? null : editingCat} onDone={() => setEditingCat(null)} />}
      </Sheet>
    </div>
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
