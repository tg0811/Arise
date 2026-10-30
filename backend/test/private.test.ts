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
  const { h, id } = await withPrivateHabit();
  await h.call('POST', `/api/habits/${id}/complete`);
  let a = await h.call('GET', '/api/archive');
  assert.equal(a.history[0].events[0].note, `Completed: ${MASK}`);
  assert.equal(a.history[0].events[0].categoryId, null);
  assert.equal(a.habitStreaks[0].title, MASK);
  assert.equal(JSON.stringify(a).includes('Secret ritual'), false);
  await h.call('POST', '/api/private/unlock', { password: 'arise123' });
  a = await h.call('GET', '/api/archive');
  assert.equal(a.history[0].events[0].note, 'Completed: Secret ritual');
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
