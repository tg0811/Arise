import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';
import { runReminders } from '../src/reminders.ts';

const MASK = '• • • • • • • •';

async function withPrivateHabit(start?: string) {
  const h = harness(start);
  let s = await h.boot();
  const soul = s.categories.find((c: any) => c.name === 'Soul').id;
  s = await h.call('POST', '/api/habits', { title: 'Secret ritual', description: 'Only I know', categoryId: soul, difficulty: 'hard', deadlineTime: '22:30', private: true });
  return { h, s, soul, id: s.habits[0].id };
}

test('locked private habit: masked name, description and category; still completable; XP still counts', async () => {
  const { h, s, soul, id } = await withPrivateHabit();
  const hb = s.habits[0];
  assert.deepEqual([hb.title, hb.description, hb.categoryId, hb.private, hb.masked], [MASK, '', null, true, true]);
  assert.equal(JSON.stringify(s).includes('Secret ritual'), false, 'the real name never leaves the server');
  const s2 = await h.call('POST', `/api/habits/${id}/complete`);
  assert.equal(s2.progress.totalXp, 50);
  assert.equal(s2.categories.find((c: any) => c.id === soul).xp, 50, 'attribute still trained');
});

test('editing or deleting a locked private habit is refused', async () => {
  const { h, soul, id } = await withPrivateHabit();
  const body = { title: MASK, categoryId: soul, difficulty: 'hard', private: true };
  await assert.rejects(h.call('PUT', `/api/habits/${id}`, body), { status: 403 });
  await assert.rejects(h.call('DELETE', `/api/habits/${id}`), { status: 403 });
});

test('unlock with the password reveals for 5 minutes, on this session only; lock re-hides', async () => {
  const { h } = await withPrivateHabit();
  await assert.rejects(h.call('POST', '/api/private/unlock', { password: 'nope' }), { status: 401 });
  let s = await h.call('POST', '/api/private/unlock', { password: 'arise123' });
  assert.equal(s.habits[0].title, 'Secret ritual');
  assert.equal(s.habits[0].description, 'Only I know');
  assert.equal(s.habits[0].masked, false);
  assert.ok(s.privateUntil);
  h.advance(4 / 60);
  s = await h.call('GET', '/api/state');
  assert.equal(s.habits[0].masked, false, 'still open at 4 min');
  h.advance(2 / 60);
  s = await h.call('GET', '/api/state');
  assert.equal(s.habits[0].masked, true, 'auto-hidden after 5 min');
  assert.equal(s.privateUntil, null);

  s = await h.call('POST', '/api/private/unlock', { password: 'arise123' });
  s = await h.call('POST', '/api/private/lock');
  assert.equal(s.habits[0].masked, true);

  // Another device (a new login session) is not unlocked by this one.
  await h.call('POST', '/api/private/unlock', { password: 'arise123' });
  await h.call('POST', '/api/auth/login', { password: 'arise123' });
  s = await h.call('GET', '/api/state');
  assert.equal(s.habits[0].masked, true);
});

test('unlocked edit keeps or clears the private flag', async () => {
  const { h, soul, id } = await withPrivateHabit();
  await h.call('POST', '/api/private/unlock', { password: 'arise123' });
  let s = await h.call('PUT', `/api/habits/${id}`, { title: 'Secret ritual v2', categoryId: soul, difficulty: 'hard', private: true });
  assert.equal(s.habits[0].title, 'Secret ritual v2');
  s = await h.call('PUT', `/api/habits/${id}`, { title: 'Not secret anymore', categoryId: soul, difficulty: 'hard', private: false });
  await h.call('POST', '/api/private/lock');
  s = await h.call('GET', '/api/state');
  assert.equal(s.habits[0].title, 'Not secret anymore');
  assert.equal(s.habits[0].private, false);
});

test('archive history and streaks are masked while locked', async () => {
  const { h, id, soul } = await withPrivateHabit();
  await h.call('POST', `/api/habits/${id}/complete`);
  let a = await h.call('GET', '/api/archive');
  assert.equal(a.history[0].events[0].note, `Completed: ${MASK}`);
  assert.deepEqual(a.history[0].events[0].categoryIds, []);
  assert.equal(a.habitStreaks[0].title, MASK);
  assert.equal(JSON.stringify(a).includes('Secret ritual'), false);
  await h.call('POST', '/api/private/unlock', { password: 'arise123' });
  a = await h.call('GET', '/api/archive');
  assert.equal(a.history[0].events[0].note, 'Completed: Secret ritual');
  assert.deepEqual(a.history[0].events[0].categoryIds, [soul]);
  assert.equal(a.habitStreaks[0].title, 'Secret ritual');
});

test('deadline nudge never names a private habit', async () => {
  const { h } = await withPrivateHabit('2026-11-02T16:30:00Z'); // 22:00 IST
  await h.call('POST', '/api/push/subscribe', { endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } });
  h.advance(5 / 60);
  const msgs = await runReminders(h.ctx(), h.sender);
  const nudge = msgs.find((m) => m.tag.startsWith('habit-'))!;
  assert.equal(nudge.title, '🔒 Private habit');
  assert.equal(JSON.stringify(msgs).includes('Secret ritual'), false);
});

test('private quest: masked while locked (chain parts too), still clearable, archive note masked, edit needs unlock', async () => {
  const h = harness();
  let s = await h.boot();
  const mind = s.categories.find((c: any) => c.name === 'Mind').id;
  const deadlineAt = new Date(Date.parse('2026-11-02T04:00:00Z') + 6 * 3600_000).toISOString();
  s = await h.call('POST', '/api/quests', {
    title: 'Secret project', description: 'hush', categoryId: mind, difficulty: 'hard', deadlineAt, private: true,
    parts: [{ title: 'Secret part two', durationHours: 24 }],
  });
  const q = s.quests[0];
  assert.deepEqual([q.title, q.description, q.categoryId, q.private, q.masked], [MASK, '', null, true, true]);
  assert.equal(JSON.stringify(s).includes('Secret'), false);
  await assert.rejects(h.call('PUT', `/api/quests/${q.id}`, { title: MASK, description: '', categoryId: null, deadlineAt }), { status: 403 });
  await assert.rejects(h.call('DELETE', `/api/quests/${q.id}`), { status: 403 });

  s = await h.call('POST', `/api/quests/${q.id}/complete`);
  assert.equal(s.progress.totalXp, 50, 'clearing works while hidden');
  const part2 = s.quests.find((x: any) => x.status === 'pending');
  assert.equal(part2.masked, true, 'the unlocked chain part is private too');
  const a = await h.call('GET', '/api/archive');
  assert.equal(JSON.stringify(a).includes('Secret'), false, 'archive ledger is masked');

  s = await h.call('POST', '/api/private/unlock', { password: 'arise123' });
  assert.equal(s.quests.find((x: any) => x.id === part2.id).title, 'Secret part two');
  s = await h.call('PUT', `/api/quests/${part2.id}`, { title: 'Secret part two', description: '', categoryId: mind, deadlineAt: part2.deadlineAt, private: false });
  await h.call('POST', '/api/private/lock');
  s = await h.call('GET', '/api/state');
  assert.equal(s.quests.find((x: any) => x.id === part2.id).title, 'Secret part two', 'made public again');
});

test('deadline nudge never names a private quest', async () => {
  const h = harness();
  await h.boot();
  await h.call('POST', '/api/push/subscribe', { endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } });
  const deadlineAt = new Date(Date.parse('2026-11-02T04:00:00Z') + 20 * 60_000).toISOString();
  await h.call('POST', '/api/quests', { title: 'Hidden errand', categoryId: null, difficulty: 'easy', deadlineAt, private: true });
  h.advance(1 / 60);
  const msgs = await runReminders(h.ctx(), h.sender);
  const nudge = msgs.find((m) => m.tag.startsWith('quest-'))!;
  assert.equal(nudge.title, '🔒 Private quest');
  assert.equal(JSON.stringify(msgs).includes('Hidden errand'), false);
});
