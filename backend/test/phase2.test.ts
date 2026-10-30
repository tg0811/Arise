import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';

const START = Date.parse('2026-11-02T04:00:00Z');
const inHours = (h: number) => new Date(START + h * 3600_000).toISOString();

test('goal on time: full reward + credits; undo same day', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/goals', { title: 'Finish ML course', type: 'forge', categoryId: null, deadlineAt: inHours(72), xp: 500 });
  const gid = s.goals[0].id;
  s = await h.call('POST', `/api/goals/${gid}/complete`);
  assert.equal(s.progress.totalXp, 500);
  assert.equal(s.wallet.credits, 100);
  assert.equal(s.goals[0].status, 'done');
  s = await h.call('POST', `/api/goals/${gid}/undo`);
  assert.equal(s.progress.totalXp, 0);
  assert.equal(s.goals[0].status, 'active');
});

test('goal past due: penalty once, stays, late completion earns half; stakes lock', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'Gym', categoryId: null, difficulty: 'legendary' });
  for (let i = 0; i < 6; i++) {
    s = await h.call('POST', `/api/habits/${s.habits[0].id}/complete`);
    h.advance(24);
  }
  const before = (await h.call('GET', '/api/state')).progress.totalXp; // 6 days of gym, some at ×1
  s = await h.call('POST', '/api/goals', { title: 'Exam', type: 'siege', categoryId: null, deadlineAt: inHours(24 * 6 + 2), xp: 250 });
  const gid = s.goals[0].id;
  await h.call('POST', `/api/habits/${s.habits[0].id}/complete`);
  h.advance(3); // deadline passes
  s = await h.call('GET', '/api/state');
  const g = s.goals.find((x: any) => x.id === gid);
  assert.equal(g.pastDue, true);
  assert.equal(g.status, 'active', 'goal stays on the board');
  const afterPenalty = s.progress.totalXp;
  s = await h.call('GET', '/api/state'); // settling again must not charge twice
  assert.equal(s.progress.totalXp, afterPenalty);
  await assert.rejects(h.call('PUT', `/api/goals/${gid}`, { title: 'Exam', type: 'siege', categoryId: null, deadlineAt: inHours(500), xp: 250 }), { status: 409 });
  s = await h.call('POST', `/api/goals/${gid}/complete`);
  assert.equal(s.progress.totalXp, afterPenalty + 125, 'late = 50%');
  assert.ok(before > 0);
});

test('lootbox: locked under 80%, once per day, pinned roll → credits with streak bonus', async () => {
  // rolls: 0.1 → credits bucket, 0.5 → amount 25 + floor(0.5*51) = 50
  const h = harness(undefined, [0.1, 0.5]);
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'A', categoryId: null, difficulty: 'easy' });
  s = await h.call('POST', '/api/habits', { title: 'B', categoryId: null, difficulty: 'easy' });
  assert.equal(s.lootbox.available, false);
  await assert.rejects(h.call('POST', '/api/lootbox/open'), { status: 403 });
  await h.call('POST', `/api/habits/${s.habits[0].id}/complete`);
  s = await h.call('POST', `/api/habits/${s.habits[1].id}/complete`);
  assert.equal(s.lootbox.available, true);
  const creditsBefore = s.wallet.credits;
  s = await h.call('POST', '/api/lootbox/open');
  assert.deepEqual(s.loot, { type: 'credits', amount: 51 }); // 50 × (1 + 1 streak day × 2%)
  assert.equal(s.wallet.credits, creditsBefore + 51);
  assert.equal(s.lootbox.available, false);
  assert.equal(s.lootbox.claimed.type, 'credits');
  await assert.rejects(h.call('POST', '/api/lootbox/open'), { status: 409 });
});

test('lootbox item drop lands in inventory', async () => {
  const h = harness(undefined, [0.95, 0, 0]); // item bucket, then first lootable item
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'A', categoryId: null, difficulty: 'easy' });
  s = await h.call('POST', `/api/habits/${s.habits[0].id}/complete`);
  s = await h.call('POST', '/api/lootbox/open');
  assert.equal(s.loot.type, 'item');
  assert.equal(s.inventory.owned.length, 1);
  assert.equal(s.inventory.owned[0].name, s.loot.itemName);
});

test('store: starter items, buy needs funds, use redeems one unit', async () => {
  const h = harness();
  let s = await h.boot();
  assert.ok(s.storeItems.length >= 5);
  const coffee = s.storeItems.find((i: any) => i.name === 'Fancy coffee');
  await assert.rejects(h.call('POST', `/api/store/${coffee.id}/buy`), { status: 400 });
  // Earn 100 credits: a 500 XP goal pays 100.
  s = await h.call('POST', '/api/goals', { title: 'G', type: 'forge', categoryId: null, deadlineAt: inHours(10), xp: 500 });
  s = await h.call('POST', `/api/goals/${s.goals[0].id}/complete`);
  s = await h.call('POST', `/api/store/${coffee.id}/buy`);
  assert.equal(s.wallet.credits, 0);
  assert.deepEqual(s.inventory.owned.map((o: any) => [o.name, o.count]), [['Fancy coffee', 1]]);
  s = await h.call('POST', `/api/inventory/${coffee.id}/use`);
  assert.equal(s.inventory.owned.length, 0);
  assert.equal(s.inventory.used[0].name, 'Fancy coffee');
  // Custom item, then archive it.
  s = await h.call('POST', '/api/store', { name: 'Concert ticket', cost: 3, currency: 'gems', icon: 'music' });
  const ticket = s.storeItems.find((i: any) => i.name === 'Concert ticket');
  assert.equal(ticket.currency, 'gems');
  s = await h.call('DELETE', `/api/store/${ticket.id}`);
  assert.equal(s.storeItems.some((i: any) => i.name === 'Concert ticket'), false);
});

test('journal: notes, AAR only for resolved goals, XP once per goal into Mind', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/journal', { kind: 'note', title: 'Day 1', body: 'Started.' });
  assert.equal(s.journal.length, 1);
  assert.equal(s.progress.totalXp, 0, 'notes give no XP');
  s = await h.call('POST', '/api/goals', { title: 'Exam', type: 'siege', categoryId: null, deadlineAt: inHours(10), xp: 250 });
  const gid = s.goals[0].id;
  await assert.rejects(h.call('POST', '/api/journal', { kind: 'aar', goalId: gid, planned: 'x' }), { status: 400 });
  s = await h.call('POST', `/api/goals/${gid}/complete`);
  s = await h.call('POST', '/api/journal', { kind: 'aar', goalId: gid, planned: 'Study 2h/day', happened: 'Did 1h', why: 'Phone', next: 'Phone in other room' });
  assert.equal(s.progress.totalXp, 275);
  assert.equal(s.categories.find((c: any) => c.name === 'Mind').xp, 25);
  assert.equal(s.goals[0].hasAar, true);
  s = await h.call('POST', '/api/journal', { kind: 'aar', goalId: gid, planned: 'again' });
  assert.equal(s.progress.totalXp, 275, 'second AAR for same goal gives no XP');
  const aar = s.journal.find((j: any) => j.kind === 'aar' && j.planned === 'Study 2h/day');
  s = await h.call('PUT', `/api/journal/${aar.id}`, { planned: 'Study 2h/day', happened: 'Did 1h', why: 'Phone', next: 'Phone in a drawer' });
  assert.equal(s.journal.find((j: any) => j.id === aar.id).next, 'Phone in a drawer');
});

test('my state saves through profile', async () => {
  const h = harness();
  await h.boot();
  const s = await h.call('PUT', '/api/profile', { myState: { coreMission: 'Become unbreakable', shortTermGoals: 'Ship v1' } });
  assert.equal(s.profile.myState.coreMission, 'Become unbreakable');
});
