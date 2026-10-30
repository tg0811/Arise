import { tx } from './db.ts';
import { HttpError, addCurrency, addXp, dayProgress, today, type Ctx } from './game.ts';
import { rollLoot, type LootType } from '../../shared/engine.ts';

// Wallet, store of real-world rewards, inventory, and the daily lootbox.

type Currency = 'credits' | 'gems';

export interface StoreItemInput {
  name: string;
  description: string;
  icon: string;
  cost: number;
  currency: Currency;
  lootable: boolean;
}

interface StoreItem {
  id: number;
  name: string;
  description: string;
  icon: string;
  cost: number;
  currency: Currency;
  lootable: number;
  archived: number;
}

export function balance(ctx: Ctx, currency: Currency): number {
  const row = ctx.db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM currency_events WHERE currency = ?').get(currency) as { total: number };
  return row.total;
}

function getItem(ctx: Ctx, id: number): StoreItem {
  const item = ctx.db.prepare('SELECT * FROM store_items WHERE id = ?').get(id) as unknown as StoreItem | undefined;
  if (!item) throw new HttpError(404, 'Item not found');
  return item;
}

// ---------------------------------------------------------------- store

export function createItem(ctx: Ctx, i: StoreItemInput) {
  const { m } = ctx.db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM store_items').get() as { m: number };
  ctx.db.prepare('INSERT INTO store_items (name, description, icon, cost, currency, lootable, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(i.name, i.description, i.icon, i.cost, i.currency, i.lootable ? 1 : 0, m + 1, ctx.at.toISOString());
}

export function updateItem(ctx: Ctx, id: number, i: StoreItemInput) {
  getItem(ctx, id);
  ctx.db.prepare('UPDATE store_items SET name = ?, description = ?, icon = ?, cost = ?, currency = ?, lootable = ? WHERE id = ?')
    .run(i.name, i.description, i.icon, i.cost, i.currency, i.lootable ? 1 : 0, id);
}

/** Archive rather than delete: owned units and purchase history keep pointing at it. */
export function deleteItem(ctx: Ctx, id: number) {
  getItem(ctx, id);
  ctx.db.prepare('UPDATE store_items SET archived = 1 WHERE id = ?').run(id);
}

export function buyItem(ctx: Ctx, id: number) {
  tx(ctx.db, () => {
    const item = getItem(ctx, id);
    if (item.archived) throw new HttpError(404, 'Item not found');
    if (balance(ctx, item.currency) < item.cost) throw new HttpError(400, `Not enough ${item.currency}`);
    const res = ctx.db.prepare("INSERT INTO inventory (item_id, source, acquired_at) VALUES (?, 'store', ?)").run(id, ctx.at.toISOString());
    addCurrency(ctx, today(ctx), item.currency, -item.cost, 'store', Number(res.lastInsertRowid), `Bought: ${item.name}`);
  });
}

// ---------------------------------------------------------------- inventory

/** Redeem one owned unit: you've earned it, go enjoy it. */
export function useItem(ctx: Ctx, itemId: number) {
  const unit = ctx.db.prepare('SELECT id FROM inventory WHERE item_id = ? AND used_at IS NULL ORDER BY acquired_at LIMIT 1').get(itemId) as { id: number } | undefined;
  if (!unit) throw new HttpError(404, 'You don\'t own this item');
  ctx.db.prepare('UPDATE inventory SET used_at = ? WHERE id = ?').run(ctx.at.toISOString(), unit.id);
}

// ---------------------------------------------------------------- lootbox

export interface LootResult {
  type: LootType;
  amount: number;
  itemName?: string;
}

export function openLootbox(ctx: Ctx): LootResult {
  return tx(ctx.db, () => {
    const date = today(ctx);
    if (ctx.db.prepare('SELECT 1 FROM lootbox_claims WHERE date = ?').get(date)) throw new HttpError(409, 'Already opened today');
    const { cleared, streak } = dayProgress(ctx);
    if (!cleared) throw new HttpError(403, 'Clear 80% of today\'s tasks to unlock the lootbox');

    const rng = ctx.rng ?? Math.random;
    let loot: LootResult = rollLoot(rng, streak.current);
    let itemId: number | null = null;
    if (loot.type === 'item') {
      const pool = ctx.db.prepare('SELECT id, name FROM store_items WHERE archived = 0 AND lootable = 1').all() as { id: number; name: string }[];
      if (pool.length) {
        const pick = pool[Math.floor(rng() * pool.length)];
        itemId = pick.id;
        loot = { ...loot, itemName: pick.name };
        ctx.db.prepare("INSERT INTO inventory (item_id, source, acquired_at) VALUES (?, 'lootbox', ?)").run(pick.id, ctx.at.toISOString());
      } else {
        loot = { type: 'credits', amount: 50 }; // nothing droppable → fallback
      }
    }
    if (loot.type === 'credits' || loot.type === 'gems') addCurrency(ctx, date, loot.type, loot.amount, 'lootbox', null, 'Daily lootbox');
    if (loot.type === 'xp') addXp(ctx, date, loot.amount, null, 'lootbox', null, 'Daily lootbox');
    ctx.db.prepare('INSERT INTO lootbox_claims (date, type, amount, item_id, at) VALUES (?, ?, ?, ?, ?)')
      .run(date, loot.type, loot.amount, itemId, ctx.at.toISOString());
    return loot;
  });
}

// ---------------------------------------------------------------- state

export function economyState(ctx: Ctx, cleared: boolean) {
  const items = (ctx.db.prepare('SELECT * FROM store_items WHERE archived = 0 ORDER BY sort, id').all() as unknown as StoreItem[])
    .map((i) => ({ id: i.id, name: i.name, description: i.description, icon: i.icon, cost: i.cost, currency: i.currency, lootable: !!i.lootable }));

  const owned = ctx.db.prepare(`SELECT s.id AS itemId, s.name, s.description, s.icon, COUNT(*) AS count
    FROM inventory inv JOIN store_items s ON s.id = inv.item_id
    WHERE inv.used_at IS NULL GROUP BY s.id ORDER BY MIN(inv.acquired_at)`).all() as { itemId: number; name: string; description: string; icon: string; count: number }[];
  const used = ctx.db.prepare(`SELECT inv.id, s.name, s.icon, inv.source, inv.used_at AS usedAt
    FROM inventory inv JOIN store_items s ON s.id = inv.item_id
    WHERE inv.used_at IS NOT NULL ORDER BY inv.used_at DESC LIMIT 30`).all() as { id: number; name: string; icon: string; source: string; usedAt: string }[];

  const claim = ctx.db.prepare(`SELECT c.type, c.amount, s.name AS itemName FROM lootbox_claims c
    LEFT JOIN store_items s ON s.id = c.item_id WHERE c.date = ?`).get(today(ctx)) as { type: LootType; amount: number; itemName: string | null } | undefined;

  return {
    storeItems: items,
    inventory: { owned, used },
    lootbox: { available: cleared && !claim, claimed: claim ? { type: claim.type, amount: claim.amount, itemName: claim.itemName ?? undefined } : null },
  };
}
