import { useState } from 'react';
import { Coins, Gem, Pencil, Plus, PackageOpen, Check, Trash2 } from 'lucide-react';
import { useAction, type AppState, type StoreItem } from '../lib/api';
import { formatDate } from '../lib/time';
import { Field } from '../components/TaskForm';
import { Button, Panel, REWARD_ICONS, RewardIcon, SectionTitle, Sheet, Tabs, useToast } from '../components/ui';

type Tab = 'store' | 'inventory';

const Price = ({ item }: { item: Pick<StoreItem, 'cost' | 'currency'> }) => (
  <span className={`inline-flex items-center gap-1 font-black ${item.currency === 'gems' ? 'text-accent2' : 'text-gold'}`}>
    {item.currency === 'gems' ? <Gem size={14} /> : <Coins size={14} />} {item.cost.toLocaleString()}
  </span>
);

export function Store({ s }: { s: AppState }) {
  const [tab, setTab] = useState<Tab>('store');
  const [editing, setEditing] = useState<StoreItem | 'new' | null>(null);
  const action = useAction();
  const toast = useToast();
  const ownedCount = s.inventory.owned.reduce((n, o) => n + o.count, 0);

  const buy = (item: StoreItem) =>
    action.mutate({ path: `/store/${item.id}/buy` }, { onSuccess: () => toast(`Acquired: ${item.name}`, 'good'), onError: (e) => toast(e.message, 'bad') });
  const use = (itemId: number, name: string) =>
    action.mutate({ path: `/inventory/${itemId}/use` }, { onSuccess: () => toast(`${name}: enjoy it, you earned it.`, 'good'), onError: (e) => toast(e.message, 'bad') });

  return (
    <div className="pt-2">
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'store', label: 'Store' }, { id: 'inventory', label: 'Inventory', badge: ownedCount }]} />

      {tab === 'store' && (
        <>
          <SectionTitle right={<button onClick={() => setEditing('new')} className="inline-flex items-center gap-1 text-xs font-bold text-accent"><Plus size={13} /> New reward</button>}>
            Rewards
          </SectionTitle>
          <p className="-mt-1 mb-3 text-xs text-muted">Real-world treats you've decided are worth the grind. Buy, then redeem from your inventory.</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {s.storeItems.map((item) => {
              const affordable = s.wallet[item.currency] >= item.cost;
              return (
                <Panel key={item.id} brackets={false} className="flex flex-col p-4">
                  <div className="flex items-start justify-between">
                    <span className="rounded-xl bg-accent/15 p-2.5 text-accent"><RewardIcon name={item.icon} size={20} /></span>
                    <button onClick={() => setEditing(item)} className="rounded-lg p-1 text-muted hover:text-ink" aria-label={`Edit ${item.name}`}><Pencil size={14} /></button>
                  </div>
                  <h3 className="mt-2 font-bold leading-tight">{item.name}</h3>
                  {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink2">{item.description}</p>}
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <Price item={item} />
                    <button onClick={() => buy(item)} disabled={!affordable || action.isPending}
                      className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-accent disabled:border-line disabled:bg-transparent disabled:text-muted">
                      Buy
                    </button>
                  </div>
                </Panel>
              );
            })}
          </div>
        </>
      )}

      {tab === 'inventory' && (
        <>
          <SectionTitle>Owned</SectionTitle>
          {s.inventory.owned.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted">
              Empty. Buy rewards in the store, or win them from the daily payload.
            </div>
          ) : (
            <div className="space-y-2">
              {s.inventory.owned.map((o) => (
                <Panel key={o.itemId} brackets={false} className="flex items-center gap-3 p-3">
                  <span className="rounded-xl bg-accent/15 p-2.5 text-accent"><RewardIcon name={o.icon} size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{o.name} {o.count > 1 && <span className="text-accent">×{o.count}</span>}</span>
                    {o.description && <span className="block truncate text-xs text-ink2">{o.description}</span>}
                  </span>
                  <button onClick={() => use(o.itemId, o.name)} disabled={action.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-good/40 bg-good/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-good">
                    <PackageOpen size={14} /> Use
                  </button>
                </Panel>
              ))}
            </div>
          )}
          {s.inventory.used.length > 0 && (
            <>
              <SectionTitle>Redeemed</SectionTitle>
              <Panel brackets={false} className="divide-y divide-line">
                {s.inventory.used.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <Check size={14} className="text-good" />
                    <span className="flex-1 text-ink2">{u.name}{u.source === 'lootbox' && <span className="ml-1.5 text-xs text-gold">(payload)</span>}</span>
                    <span className="text-xs text-muted">{formatDate(u.usedAt)}</span>
                  </div>
                ))}
              </Panel>
            </>
          )}
        </>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New reward' : 'Edit reward'}>
        {editing && <ItemForm key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function ItemForm({ item, onDone }: { item: StoreItem | null; onDone: () => void }) {
  const action = useAction();
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [icon, setIcon] = useState(item?.icon ?? 'gift');
  const [cost, setCost] = useState(String(item?.cost ?? 100));
  const [currency, setCurrency] = useState<'credits' | 'gems'>(item?.currency ?? 'credits');
  const [lootable, setLootable] = useState(item?.lootable ?? true);
  const done = { onSuccess: () => { toast('Saved', 'good'); onDone(); }, onError: (e: Error) => toast(e.message, 'bad') };

  const save = () => {
    const n = Number(cost);
    if (!name.trim()) return toast('Name the reward', 'bad');
    if (!Number.isInteger(n) || n < 1) return toast('Cost must be a whole number', 'bad');
    const body = { name, description, icon, cost: n, currency, lootable };
    action.mutate(item ? { method: 'PUT', path: `/store/${item.id}`, body } : { path: '/store', body }, done);
  };

  return (
    <div>
      <Field label="Name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="New headphones" autoFocus={!item} /></Field>
      <Field label="Description (optional)"><input className="field" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} /></Field>
      <Field label="Icon">
        <div className="grid grid-cols-7 gap-1.5">
          {Object.keys(REWARD_ICONS).map((k) => (
            <button key={k} type="button" onClick={() => setIcon(k)} aria-label={k}
              className={`flex aspect-square items-center justify-center rounded-lg border ${icon === k ? 'border-accent bg-accent/20 text-accent' : 'border-line text-ink2'}`}>
              <RewardIcon name={k} size={16} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Price">
        <div className="flex gap-2">
          <input type="number" min={1} inputMode="numeric" className="field" value={cost} onChange={(e) => setCost(e.target.value)} />
          <div className="flex shrink-0 gap-1 rounded-xl border border-line p-1">
            {(['credits', 'gems'] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCurrency(c)}
                className={`flex items-center gap-1 rounded-lg px-3 text-xs font-bold ${currency === c ? 'bg-accent/20 text-ink' : 'text-muted'}`}>
                {c === 'gems' ? <Gem size={13} /> : <Coins size={13} />} {c}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-xs text-muted">For scale: a Normal task pays 5 credits, a Hard one 10. Gems only drop from the daily payload.</p>
      </Field>
      <label className="mb-5 flex items-center gap-3 text-sm">
        <input type="checkbox" checked={lootable} onChange={(e) => setLootable(e.target.checked)} className="h-4 w-4 accent-[var(--sl-accent)]" />
        Can drop from the daily payload
      </label>
      <div className="flex gap-2">
        {item && (
          <Button variant="bad" onClick={() => confirm(`Remove "${item.name}" from the store? Owned copies stay.`) && action.mutate({ method: 'DELETE', path: `/store/${item.id}` }, done)}>
            <Trash2 size={15} />
          </Button>
        )}
        <Button className="flex-1" onClick={save} disabled={action.isPending}>{item ? 'Save' : 'Add to store'}</Button>
      </div>
    </div>
  );
}
