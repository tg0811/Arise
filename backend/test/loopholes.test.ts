import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';

// The owner's rule: no loopholes. Each test tries one way of dodging a penalty and expects it to fail.
const START = Date.parse('2026-11-02T04:00:00Z'); // Monday 09:30 IST
const inHours = (h: number) => new Date(START + h * 3600_000).toISOString();

test('1. deleting a habit that is still due today counts as today\'s fail', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'Due', difficulty: 'hard' });
  s = await h.call('POST', '/api/habits', { title: 'Done already', difficulty: 'hard' });
  const [due, done] = s.habits;
  s = await h.call('POST', `/api/habits/${done.id}/complete`);
  assert.equal(s.progress.totalXp, 50);
  s = await h.call('DELETE', `/api/habits/${done.id}`);
  assert.equal(s.progress.totalXp, 50, 'a resolved habit deletes for free');
  s = await h.call('DELETE', `/api/habits/${due.id}`);
  assert.equal(s.progress.totalXp, 0, 'the unresolved one fails on the way out');
  const a = await h.call('GET', '/api/archive');
  assert.ok(a.history[0].events.some((e: any) => e.amount === -50 && e.note === 'Failed: Due'));
});

test('2. unticking today in "Repeats on" applies from tomorrow: today still fails at midnight', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'Run', difficulty: 'normal', days: '0123456' });
  const id = s.habits[0].id;
  s = await h.call('PUT', `/api/habits/${id}`, { title: 'Run', difficulty: 'normal', days: '0' }); // Sundays only; today is Monday
  assert.equal(s.habits[0].scheduledToday, true, 'still due today');
  h.advance(24); // past midnight: Tuesday
  s = await h.call('GET', '/api/state');
  assert.equal(s.progress.totalXp, 0);
  const a = await h.call('GET', '/api/archive');
  assert.ok(a.history.flatMap((d: any) => d.events).some((e: any) => e.amount === -25), 'Monday failed');
  assert.equal(s.habits[0].scheduledToday, false, 'from Tuesday the new days apply');
});

test('3. a quest deadline can move earlier but never later', async () => {
  const h = harness();
  await h.boot();
  let s = await h.call('POST', '/api/quests', { title: 'Q', difficulty: 'normal', deadlineAt: inHours(6) });
  const q = s.quests[0];
  const edit = (deadlineAt: string) => h.call('PUT', `/api/quests/${q.id}`, { title: 'Q', description: '', deadlineAt });
  await assert.rejects(edit(inHours(30)), { status: 409 });
  s = await edit(inHours(3));
  assert.equal(s.quests[0].deadlineAt, inHours(3));
  await assert.rejects(edit(inHours(4)), { status: 409 }, 'and not back out again');
});

test('4. a goal\'s XP is locked and its deadline only moves earlier', async () => {
  const h = harness();
  await h.boot();
  let s = await h.call('POST', '/api/goals', { title: 'G', type: 'forge', deadlineAt: inHours(72), xp: 250 });
  const g = s.goals[0];
  const edit = (extra: object) => h.call('PUT', `/api/goals/${g.id}`, { title: 'G', type: 'forge', deadlineAt: inHours(72), xp: 250, ...extra });
  await assert.rejects(edit({ xp: 100 }), { status: 409 }, 'lower stakes');
  await assert.rejects(edit({ xp: 1000 }), { status: 409 }, 'raise stakes');
  await assert.rejects(edit({ deadlineAt: inHours(200) }), { status: 409 }, 'push back');
  s = await edit({ deadlineAt: inHours(48), title: 'G renamed' });
  assert.deepEqual([s.goals[0].title, s.goals[0].deadlineAt], ['G renamed', inHours(48)]);
});

test('5a. removing a quest is free only in its first hour; after that it must be abandoned', async () => {
  const h = harness();
  await h.boot();
  let s = await h.call('POST', '/api/quests', { title: 'Typo', difficulty: 'hard', deadlineAt: inHours(6) });
  s = await h.call('DELETE', `/api/quests/${s.quests[0].id}`);
  assert.deepEqual([s.quests.length, s.progress.totalXp], [0, 0], 'free within the hour');

  s = await h.call('POST', '/api/quests', { title: 'Real', difficulty: 'hard', deadlineAt: inHours(6) });
  const q = s.quests[0];
  assert.equal(q.freeRemoveUntil, inHours(1));
  h.advance(1.5);
  await assert.rejects(h.call('DELETE', `/api/quests/${q.id}`), { status: 409 });
  s = await h.call('POST', `/api/quests/${q.id}/fail`);
  assert.equal(s.progress.totalXp, 0, 'abandoning costs the XP (floored at 0)');
});

test('5b. removing a goal is free in its first hour or once its penalty is paid; otherwise it costs the stake', async () => {
  const h = harness();
  await h.boot();
  await h.call('POST', '/api/habits', { title: 'Earn', difficulty: 'legendary' });
  let s = await h.call('GET', '/api/state');
  s = await h.call('POST', `/api/habits/${s.habits[0].id}/complete`);
  assert.equal(s.progress.totalXp, 100);

  s = await h.call('POST', '/api/goals', { title: 'Typo', type: 'forge', deadlineAt: inHours(72), xp: 100 });
  s = await h.call('DELETE', `/api/goals/${s.goals[0].id}`);
  assert.equal(s.progress.totalXp, 100, 'free within the hour');

  s = await h.call('POST', '/api/goals', { title: 'Real', type: 'forge', deadlineAt: inHours(72), xp: 100 });
  h.advance(2);
  s = await h.call('DELETE', `/api/goals/${s.goals[0].id}`);
  assert.equal(s.progress.totalXp, 0, 'abandoning a goal costs its stake');

  s = await h.call('POST', '/api/goals', { title: 'Late', type: 'forge', deadlineAt: inHours(5), xp: 100 });
  h.advance(6); // past its deadline: penalty paid by settlement
  s = await h.call('GET', '/api/state');
  s = await h.call('DELETE', `/api/goals/${s.goals[0].id}`);
  const notes = (await h.call('GET', '/api/archive')).history.flatMap((d: any) => d.events).map((e: any) => e.note);
  assert.ok(notes.includes('Goal deadline missed: Late'), 'the deadline penalty was charged');
  assert.equal(notes.includes('Goal abandoned: Late'), false, 'no second penalty on removal');
});
