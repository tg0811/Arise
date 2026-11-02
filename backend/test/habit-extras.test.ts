import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';
import { runReminders } from '../src/reminders.ts';

// Habit order and per-habit reminder times.

test('habits keep the order you set; new ones go to the end', async () => {
  const h = harness();
  let s = await h.boot();
  for (const t of ['A', 'B', 'C']) s = await h.call('POST', '/api/habits', { title: t, difficulty: 'easy' });
  const ids = Object.fromEntries(s.habits.map((x: any) => [x.title, x.id]));
  s = await h.call('POST', '/api/habits/reorder', { ids: [ids.C, ids.A, ids.B] });
  assert.deepEqual(s.habits.map((x: any) => x.title), ['C', 'A', 'B']);
  s = await h.call('POST', '/api/habits', { title: 'D', difficulty: 'easy' });
  assert.deepEqual(s.habits.map((x: any) => x.title), ['C', 'A', 'B', 'D']);
});

test('reminder: at its time on its days only, only while undone, once, even in quiet hours; private stays private', async () => {
  const h = harness('2026-11-02T01:00:00Z'); // Monday 06:30 IST
  await h.boot();
  await h.call('POST', '/api/push/subscribe', { endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } });
  await h.call('PUT', '/api/reminders', { enabled: true, intervalHours: 8, quietStart: '22:00', quietEnd: '08:00', nudgeMinutes: 0 });
  let s = await h.call('POST', '/api/habits', { title: 'Wake up drill', difficulty: 'easy', reminderTime: '07:00', days: '1' }); // Mondays
  await h.call('POST', '/api/habits', { title: 'Secret', difficulty: 'easy', reminderTime: '07:00', private: true });
  assert.equal(s.habits[0].reminderTime, '07:00');
  const tags = async () => (await runReminders(h.ctx(), h.sender)).map((m) => m.tag + '|' + m.title);

  assert.deepEqual((await tags()).filter((t) => t.startsWith('remind')), [], 'not before 07:00');
  h.advance(0.5); // 07:00, inside quiet hours
  const at7 = (await tags()).filter((t) => t.startsWith('remind'));
  assert.equal(at7.length, 2);
  assert.ok(at7.some((t) => t.endsWith('🔔 Wake up drill')));
  assert.ok(at7.some((t) => t.endsWith('🔒 Private habit')), 'private name never on the lock screen');
  h.advance(5 / 60);
  assert.deepEqual((await tags()).filter((t) => t.startsWith('remind')), [], 'once a day');

  h.advance(24); // Tuesday 07:05: not a Wake-up-drill day; Secret (daily) is due again
  const tue = (await tags()).filter((t) => t.startsWith('remind'));
  assert.deepEqual(tue.map((t) => t.split('|')[1]), ['🔒 Private habit']);

  // Done before its time → no reminder.
  h.advance(24 - 1); // Wednesday 06:05
  s = await h.call('GET', '/api/state');
  await h.call('POST', `/api/habits/${s.habits.find((x: any) => x.private).id}/complete`);
  h.advance(1);
  assert.deepEqual((await tags()).filter((t) => t.startsWith('remind')), []);
});

test('pushes go out with high urgency (Android otherwise holds them while the phone dozes)', async () => {
  const webpush = (await import('web-push')).default;
  const { pushOptions } = await import('../src/reminders.ts');
  const h = harness();
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
  const req = webpush.generateRequestDetails(sub, 'x', pushOptions(h.db));
  assert.equal(req.headers.Urgency, 'high');
  assert.equal(req.headers.TTL, 3600);
});
