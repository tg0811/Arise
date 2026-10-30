import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';
import { runReminders } from '../src/reminders.ts';
import { focusReward, inQuietHours } from '../../shared/engine.ts';

// Harness clock starts Monday 2026-11-02 09:30 IST (04:00Z).
const FAKE_SUB = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };

test('focus reward rules', () => {
  assert.equal(focusReward(25, 10), null, 'under half the planned time');
  assert.deepEqual(focusReward(25, 25), { xp: 38, credits: 13, bonus: 0 });
  assert.deepEqual(focusReward(60, 30), { xp: 135, credits: 45, bonus: 0.5 }, 'half time = max +50%');
  assert.equal(focusReward(25, 90)!.bonus, 0, 'overtime earns the base');
});

test('focus session: one at a time, too-early guard, reward, abandon', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/focus/start', { title: 'Deep work', categoryId: s.categories[3].id, minutes: 25 });
  assert.equal(s.focus.plannedMin, 25);
  await assert.rejects(h.call('POST', '/api/focus/start', { title: 'Again', categoryId: null, minutes: 25 }), { status: 409 });
  h.advance(10 / 60);
  await assert.rejects(h.call('POST', '/api/focus/complete'), { status: 400 });
  h.advance(10 / 60); // 20 of 25 min → +20% early bonus
  s = await h.call('POST', '/api/focus/complete');
  assert.equal(s.focus, null);
  assert.equal(s.progress.totalXp, 45);
  assert.equal(s.wallet.credits, 15);
  assert.equal(s.categories[3].xp, 45);
  s = await h.call('POST', '/api/focus/start', { title: 'Second', categoryId: null, minutes: 15 });
  s = await h.call('POST', '/api/focus/abandon');
  assert.equal(s.focus, null);
  assert.equal(s.progress.totalXp, 45, 'abandon: no gain, no loss');
});

test('quiet hours wrap past midnight', () => {
  assert.equal(inQuietHours(23 * 60 + 30, '23:00', '07:00'), true);
  assert.equal(inQuietHours(6 * 60, '23:00', '07:00'), true);
  assert.equal(inQuietHours(12 * 60, '23:00', '07:00'), false);
  assert.equal(inQuietHours(13 * 60, '12:00', '14:00'), true);
});

test('interval reminders: only open tasks scheduled today, never in quiet hours, never twice in an interval', async () => {
  const h = harness();
  let s = await h.boot();
  await h.call('POST', '/api/habits', { title: 'Sleep by 22:30', categoryId: null, difficulty: 'hard', deadlineTime: '22:30' });
  await h.call('POST', '/api/habits', { title: 'Gym', categoryId: null, difficulty: 'hard', days: '246' }); // not Monday
  s = await h.call('POST', '/api/push/subscribe', FAKE_SUB);
  assert.equal(s.reminders.devices, 1);

  assert.deepEqual(await runReminders(h.ctx(), h.sender), [], 'subscribing starts the clock; no instant ping');
  h.advance(3); // 12:30 IST
  const [m] = await runReminders(h.ctx(), h.sender);
  assert.match(m.body, /^1 of 1 task still undone\./, 'the rest-day Gym habit is not counted');
  assert.deepEqual(await runReminders(h.ctx(), h.sender), [], 'not again within the interval');
  h.advance(11); // 23:30 IST: quiet hours
  assert.deepEqual((await runReminders(h.ctx(), h.sender)).filter((x) => x.tag === 'interval'), []);
  assert.equal(h.pushed.length, 1);
});

test('deadline nudges fire once; nothing when everything is done', async () => {
  const h = harness('2026-11-02T16:30:00Z'); // 22:00 IST
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'Sleep by 22:30', categoryId: null, difficulty: 'hard', deadlineTime: '22:30' });
  await h.call('PUT', '/api/reminders', { enabled: true, intervalHours: 3, quietStart: '23:00', quietEnd: '07:00', nudgeMinutes: 30 });
  await h.call('POST', '/api/push/subscribe', FAKE_SUB);
  h.advance(5 / 60); // 22:05
  const msgs = await runReminders(h.ctx(), h.sender);
  assert.deepEqual(msgs.map((x) => [x.title, x.body]), [['⏳ Sleep by 22:30', 'Due by 22:30: 25 min left.']]);
  h.advance(5 / 60);
  assert.deepEqual(await runReminders(h.ctx(), h.sender), [], 'nudge fires once');

  // Once the habit is done, interval reminders stay silent.
  await h.call('POST', `/api/habits/${s.habits[0].id}/complete`);
  h.advance(4);
  assert.deepEqual(await runReminders(h.ctx(), h.sender), []);
});

test('quest nudge, goal 24h heads-up, disabled prefs, dead subscriptions are dropped', async () => {
  const h = harness(undefined, [], true); // sender reports every subscription as gone
  await h.boot();
  await h.call('POST', '/api/quests', { title: 'Submit form', categoryId: null, difficulty: 'easy', deadlineAt: new Date(Date.parse('2026-11-02T04:00:00Z') + 20 * 60_000).toISOString() });
  await h.call('POST', '/api/goals', { title: 'Exam', type: 'siege', categoryId: null, deadlineAt: new Date(Date.parse('2026-11-02T04:00:00Z') + 10 * 3_600_000).toISOString(), xp: 250 });
  await h.call('PUT', '/api/reminders', { enabled: false, intervalHours: 3, quietStart: '23:00', quietEnd: '07:00', nudgeMinutes: 30 });
  await h.call('POST', '/api/push/subscribe', FAKE_SUB);
  assert.deepEqual(await runReminders(h.ctx(), h.sender), [], 'disabled');
  await h.call('PUT', '/api/reminders', { enabled: true, intervalHours: 3, quietStart: '23:00', quietEnd: '07:00', nudgeMinutes: 30 });
  const msgs = await runReminders(h.ctx(), h.sender);
  assert.deepEqual(msgs.map((m) => m.tag).sort(), ['goal-1', 'quest-1']);
  const s = await h.call('GET', '/api/state');
  assert.equal(s.reminders.devices, 0, 'gone subscription removed');
  await assert.rejects(h.call('POST', '/api/push/test'), { status: 400 });
});

test('backup → reset → restore round trip; bad files rejected', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'Read', categoryId: s.categories[3].id, difficulty: 'normal' });
  s = await h.call('POST', `/api/habits/${s.habits[0].id}/complete`);
  s = await h.call('PUT', '/api/profile', { weightKg: 74.5 });
  const backup = await h.call('GET', '/api/backup');
  assert.equal(backup.app, 'arise');
  assert.ok(!('sessions' in backup.tables) && !JSON.stringify(backup).includes('password_hash'), 'no credentials in backups');

  await assert.rejects(h.call('POST', '/api/reset', { phrase: 'i accept the reset' }), { status: 400 });
  s = await h.call('POST', '/api/reset', { phrase: 'I ACCEPT THE RESET' });
  assert.equal(s.profile.onboarded, false);
  assert.equal(s.progress.totalXp, 0);
  assert.equal(s.habits.length, 0);
  assert.deepEqual(s.categories.map((c: any) => c.name), ['Mind', 'Body', 'Soul', 'Intellect']);
  assert.equal(s.storeItems.length, 6);
  await h.call('GET', '/api/state'); // still logged in after reset

  await assert.rejects(h.call('POST', '/api/restore', { hello: 'world' }), { status: 400 });
  await assert.rejects(h.call('POST', '/api/restore', { ...backup, schemaVersion: 999 }), { status: 400 });
  s = await h.call('POST', '/api/restore', backup);
  assert.equal(s.profile.onboarded, true);
  assert.equal(s.profile.name, 'Jinwoo');
  assert.equal(s.profile.weightKg, 74.5);
  assert.equal(s.progress.totalXp, 25);
  assert.equal(s.habits[0].log.status, 'done');
  assert.equal(s.categories.find((c: any) => c.name === 'Intellect').xp, 25);
});
