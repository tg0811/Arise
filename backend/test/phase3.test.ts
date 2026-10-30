import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';

const START = Date.parse('2026-11-02T04:00:00Z'); // Monday 09:30 IST
const inHours = (h: number) => new Date(START + h * 3600_000).toISOString();
const has = (s: any, key: string) => s.titles.find((t: any) => t.key === key)?.unlocked;

test('titles unlock from milestones, stay unlocked, and can be equipped only once earned', async () => {
  const h = harness();
  let s = await h.boot();
  assert.equal(has(s, 'first_blood'), false);
  await assert.rejects(h.call('PUT', '/api/profile', { equippedTitle: 'first_blood' }), { status: 400 });
  s = await h.call('POST', '/api/habits', { title: 'Run', categoryId: null, difficulty: 'easy' });
  const hid = s.habits[0].id;
  for (let d = 0; d < 7; d++) {
    s = await h.call('POST', `/api/habits/${hid}/complete`);
    if (d < 6) h.advance(24);
  }
  assert.equal(has(s, 'first_blood'), true);
  assert.equal(has(s, 'iron_will'), true, '7-day daily streak');
  const iron = s.titles.find((t: any) => t.key === 'iron_will');
  assert.deepEqual([iron.cur, iron.target], [7, 7]);
  // Break the streak: the title stays.
  h.advance(48);
  s = await h.call('GET', '/api/state');
  assert.equal(s.streak.current, 0);
  assert.equal(has(s, 'iron_will'), true);
  s = await h.call('PUT', '/api/profile', { equippedTitle: 'iron_will' });
  assert.deepEqual(s.equippedTitle, { key: 'iron_will', name: 'Iron Will' });
  s = await h.call('PUT', '/api/profile', { equippedTitle: null });
  assert.equal(s.equippedTitle, null);
});

test('boss, chain and goal titles; per-category titles exist for every category', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/quests', {
    title: 'P1', categoryId: null, difficulty: 'easy', deadlineAt: inHours(5), boss: 'boss',
    parts: [{ title: 'P2', durationHours: 2 }],
  });
  s = await h.call('POST', `/api/quests/${s.quests[0].id}/complete`);
  assert.equal(has(s, 'boss_slayer'), true);
  assert.equal(has(s, 'chain_breaker'), false, 'chain not finished yet');
  s = await h.call('POST', `/api/quests/${s.quests.find((q: any) => q.status === 'pending').id}/complete`);
  assert.equal(has(s, 'chain_breaker'), true);
  s = await h.call('POST', '/api/goals', { title: 'G', type: 'forge', categoryId: null, deadlineAt: inHours(10), xp: 250 });
  s = await h.call('POST', `/api/goals/${s.goals[0].id}/complete`);
  assert.equal(has(s, 'conqueror'), true);
  for (const c of s.categories) {
    assert.ok(s.titles.some((t: any) => t.name === `${c.name} Adept`));
    assert.ok(s.titles.some((t: any) => t.name === `${c.name} Master`));
  }
});

test('archive: overview, heatmap, week split, history paging, habit streaks', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'Read', categoryId: s.categories[3].id, difficulty: 'normal' });
  const hid = s.habits[0].id;
  // Day 1 done, day 2 failed, day 3 done, day 4 done (today).
  await h.call('POST', `/api/habits/${hid}/complete`); h.advance(24);
  await h.call('POST', `/api/habits/${hid}/fail`); h.advance(24);
  await h.call('POST', `/api/habits/${hid}/complete`); h.advance(24);
  s = await h.call('POST', `/api/habits/${hid}/complete`);
  const a = await h.call('GET', '/api/archive');

  assert.equal(a.overview.tasksDone, 3);
  assert.equal(a.overview.tasksFailed, 1);
  assert.equal(a.overview.completionRate, 0.75);
  assert.equal(a.overview.daysActive, 4);
  assert.equal(a.heatmap.length, 28);
  assert.equal(a.heatmap.at(-1).date, a.today);
  assert.deepEqual(a.heatmap.at(-1), { date: a.today, total: 1, done: 1, gained: 25, lost: 0 });
  assert.equal(a.week.length, 7);
  assert.deepEqual(a.week.slice(-3).map((d: any) => [d.gained, d.lost]), [[0, 25], [25, 0], [25, 0]]);
  assert.equal(a.history[0].date, a.today);
  assert.match(a.history[0].events[0].note, /Completed: Read/);
  assert.equal(a.historyNext, null, 'everything fits in the first page');

  const hs = a.habitStreaks[0];
  assert.deepEqual([hs.current, hs.best, hs.done, hs.failed], [2, 2, 3, 1]);
  assert.deepEqual(hs.strip.slice(-4), ['done', 'failed', 'done', 'done']);
  assert.equal(hs.strip[0], 'none', 'before the habit existed');

  // Paging: jump 20 days ahead; the first page holds only recent days, the cursor reaches the old ones.
  h.advance(24 * 20);
  s = await h.call('GET', '/api/state'); // settles the skipped days (auto-fails)
  const p1 = await h.call('GET', '/api/archive');
  assert.ok(p1.historyNext);
  const p2 = await h.call('GET', `/api/archive?before=${p1.historyNext}`);
  assert.ok(p2.history.length > 0);
  assert.ok(p2.history.every((d: any) => d.date < p1.historyNext));
  await assert.rejects(h.call('GET', '/api/archive?before=nope'), { status: 400 });
});

test('purchases show in history', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/goals', { title: 'G', type: 'forge', categoryId: null, deadlineAt: inHours(10), xp: 500 });
  s = await h.call('POST', `/api/goals/${s.goals[0].id}/complete`);
  const coffee = s.storeItems.find((i: any) => i.name === 'Fancy coffee');
  await h.call('POST', `/api/store/${coffee.id}/buy`);
  const a = await h.call('GET', '/api/archive');
  const purchase = a.history[0].events.find((e: any) => e.kind === 'purchase');
  assert.deepEqual([purchase.amount, purchase.currency, purchase.note], [-100, 'credits', 'Bought: Fancy coffee']);
});
