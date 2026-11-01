import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';
import { openDb } from '../src/db.ts';

const attr = (s: any, name: string) => s.categories.find((c: any) => c.name === name);

test('multi-category habit: level XP counts once, every category gets the full XP, and a miss costs each', async () => {
  const h = harness();
  let s = await h.boot();
  const ids = ['Mind', 'Body', 'Soul', 'Intellect'].map((n) => attr(s, n).id);
  s = await h.call('POST', '/api/habits', { title: 'Japa Meditation', categoryIds: ids, difficulty: 'hard' });
  assert.deepEqual(s.habits[0].categoryIds, ids);
  assert.equal(s.habits[0].categoryId, ids[0], 'categoryId stays as the first one');

  s = await h.call('POST', `/api/habits/${s.habits[0].id}/complete`);
  assert.equal(s.progress.totalXp, 50, 'level XP once, not ×4');
  for (const n of ['Mind', 'Body', 'Soul', 'Intellect']) assert.equal(attr(s, n).xp, 50, n);

  // Next day it's missed: each category loses the same 50 (floored at 0).
  h.advance(48);
  s = await h.call('GET', '/api/state');
  assert.equal(s.progress.totalXp, 0);
  for (const n of ['Mind', 'Body', 'Soul', 'Intellect']) assert.equal(attr(s, n).xp, 0, n);
});

test('categories can be added and removed on edit; unknown ids are rejected; a single categoryId still works', async () => {
  const h = harness();
  let s = await h.boot();
  const [mind, soul, intellect] = ['Mind', 'Soul', 'Intellect'].map((n) => attr(s, n).id);
  s = await h.call('POST', '/api/habits', { title: 'Read the Bhagavad Gita', categoryIds: [mind, soul], difficulty: 'normal' });
  const id = s.habits[0].id;
  s = await h.call('PUT', `/api/habits/${id}`, { title: 'Read the Bhagavad Gita', categoryIds: [mind, soul, intellect], difficulty: 'normal' });
  assert.deepEqual(s.habits[0].categoryIds, [mind, soul, intellect], 'added');
  s = await h.call('PUT', `/api/habits/${id}`, { title: 'Read the Bhagavad Gita', categoryIds: [soul, intellect], difficulty: 'normal' });
  assert.deepEqual(s.habits[0].categoryIds, [soul, intellect], 'removed');
  s = await h.call('PUT', `/api/habits/${id}`, { title: 'Read the Bhagavad Gita', categoryIds: [soul, soul], difficulty: 'normal' });
  assert.deepEqual(s.habits[0].categoryIds, [soul], 'deduped');
  await assert.rejects(h.call('PUT', `/api/habits/${id}`, { title: 'x', categoryIds: [9999], difficulty: 'normal' }), { status: 400 });
  s = await h.call('POST', '/api/habits', { title: 'Old client', categoryId: mind, difficulty: 'easy' });
  assert.deepEqual(s.habits.find((x: any) => x.title === 'Old client').categoryIds, [mind]);
});

test('multi-category quest (chain parts inherit, edit reaches locked parts) and goal', async () => {
  const h = harness();
  let s = await h.boot();
  const [mind, body, soul] = ['Mind', 'Body', 'Soul'].map((n) => attr(s, n).id);
  const deadlineAt = new Date(Date.parse('2026-11-02T04:00:00Z') + 6 * 3600_000).toISOString();
  s = await h.call('POST', '/api/quests', { title: 'Pilgrimage', categoryIds: [mind, soul], difficulty: 'normal', deadlineAt, parts: [{ title: 'Return', durationHours: 24 }] });
  const q = s.quests[0];
  assert.deepEqual(q.categoryIds, [mind, soul]);
  s = await h.call('PUT', `/api/quests/${q.id}`, { title: 'Pilgrimage', description: '', categoryIds: [mind, body, soul], deadlineAt });
  s = await h.call('POST', `/api/quests/${q.id}/complete`);
  for (const n of ['Mind', 'Body', 'Soul']) assert.equal(attr(s, n).xp, 25, n);
  assert.deepEqual(s.quests.find((x: any) => x.title === 'Return').categoryIds, [mind, body, soul], 'the next part got the edit');

  s = await h.call('POST', '/api/goals', { title: 'Half marathon', type: 'gauntlet', categoryIds: [body, soul], deadlineAt, xp: 100 });
  const g = s.goals[0];
  assert.deepEqual(g.categoryIds, [body, soul]);
  s = await h.call('POST', `/api/goals/${g.id}/complete`);
  assert.equal(attr(s, 'Body').xp, 125);
  assert.equal(attr(s, 'Soul').xp, 125);
  assert.equal(attr(s, 'Mind').xp, 25);
});

test('migration and old backups: single category_id becomes the list', async () => {
  const h = harness();
  let s = await h.boot();
  const mind = attr(s, 'Mind').id;
  s = await h.call('POST', '/api/habits', { title: 'Meditate', categoryId: mind, difficulty: 'easy' });
  await h.call('POST', `/api/habits/${s.habits[0].id}/complete`);
  const backup = await h.call('GET', '/api/backup');
  // Simulate a pre-multi-category backup: no category_ids anywhere.
  for (const t of ['tasks', 'goals', 'xp_events']) for (const row of backup.tables[t]) delete row.category_ids;
  backup.schemaVersion = 9;
  s = await h.call('POST', '/api/restore', backup);
  assert.deepEqual(s.habits[0].categoryIds, [mind]);
  assert.equal(attr(s, 'Mind').xp, 10, 'attribute XP survives the restore');

  const db = openDb(':memory:');
  assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version, 10);
});
