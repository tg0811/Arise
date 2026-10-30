import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { levelFromXp, rankForLevel, totalXpForLevel, xpToNext } from '../../shared/engine.ts';

// Drives the real HTTP app against an in-memory DB with a controllable clock.
function harness(startIso = '2026-11-02T04:00:00Z') { // 09:30 IST, a Monday
  const db = openDb(':memory:');
  let now = new Date(startIso);
  const app = createApp(db, () => now);
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const json = await res.json();
    if (!res.ok) throw Object.assign(new Error(json.error), { status: res.status });
    return json;
  };
  return {
    call,
    advance: (hours: number) => { now = new Date(now.getTime() + hours * 3600_000); },
    async boot() {
      await call('POST', '/api/auth/setup', { password: 'arise123' });
      return call('PUT', '/api/profile', { name: 'Jinwoo', timezone: 'Asia/Kolkata', onboarded: true });
    },
  };
}

test('xp curve and rank bands', () => {
  assert.equal(xpToNext(1), 110);
  assert.equal(xpToNext(100), 0);
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(109).level, 1);
  assert.equal(levelFromXp(110).level, 2);
  assert.equal(levelFromXp(10_000_000).level, 100);
  assert.ok(totalXpForLevel(100) > 250_000 && totalXpForLevel(100) < 400_000);
  assert.equal(rankForLevel(16).rank, 'E');
  assert.equal(rankForLevel(17).rank, 'D');
  assert.equal(rankForLevel(84).rank, 'A');
  assert.equal(rankForLevel(85).rank, 'S');
});

test('auth gate', async () => {
  const h = harness();
  await assert.rejects(h.call('GET', '/api/state'), { status: 401 });
  await h.boot();
  const s = await h.call('GET', '/api/state');
  assert.equal(s.categories.length, 4);
  assert.deepEqual(s.categories.map((c: any) => c.name), ['Mind', 'Body', 'Soul', 'Intellect']);
});

test('habit complete / fail / undo with gain = loss', async () => {
  const h = harness();
  let s = await h.boot();
  const body = s.categories.find((c: any) => c.name === 'Body').id;
  s = await h.call('POST', '/api/habits', { title: 'Sleep by 22:30', categoryId: body, difficulty: 'hard', deadlineTime: '22:30' });
  const hid = s.habits[0].id;
  s = await h.call('POST', `/api/habits/${hid}/complete`);
  assert.equal(s.progress.totalXp, 50);
  assert.equal(s.wallet.credits, 10);
  assert.equal(s.categories.find((c: any) => c.id === body).xp, 50);
  await assert.rejects(h.call('POST', `/api/habits/${hid}/fail`), { status: 409 });
  s = await h.call('POST', `/api/habits/${hid}/undo`);
  assert.equal(s.progress.totalXp, 0);
  s = await h.call('POST', `/api/habits/${hid}/fail`);
  assert.equal(s.progress.totalXp, 0, 'floored at zero');
  assert.equal(s.habits[0].log.status, 'failed');
});

test('streak multiplier kicks in on day 7 and missed days auto-fail', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'Meditate', categoryId: null, difficulty: 'normal' });
  const hid = s.habits[0].id;
  for (let day = 1; day <= 7; day++) {
    s = await h.call('POST', `/api/habits/${hid}/complete`);
    if (day < 7) h.advance(24);
  }
  // 6 days × 25 + day 7 at ×1.25
  assert.equal(s.progress.totalXp, 6 * 25 + 31);
  assert.equal(s.habits[0].streak, 7);
  assert.equal(s.streak.current, 7);
  // Skip two days entirely: both auto-fail on the next visit.
  h.advance(72);
  s = await h.call('GET', '/api/state');
  assert.equal(s.progress.totalXp, 6 * 25 + 31 - 50);
  assert.equal(s.habits[0].streak, 0);
  assert.equal(s.streak.current, 0);
});

test('de-leveling: failures can drop you a level', async () => {
  const h = harness();
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'Gym', categoryId: null, difficulty: 'legendary' });
  const hid = s.habits[0].id;
  s = await h.call('POST', `/api/habits/${hid}/complete`);
  h.advance(24);
  s = await h.call('POST', `/api/habits/${hid}/complete`);
  assert.equal(s.progress.level, 2);
  h.advance(24);
  s = await h.call('POST', `/api/habits/${hid}/fail`);
  assert.equal(s.progress.totalXp, 100);
  assert.equal(s.progress.level, 1);
});

test('weekday schedule: unscheduled days neither count nor fail', async () => {
  const h = harness(); // Monday
  let s = await h.boot();
  s = await h.call('POST', '/api/habits', { title: 'Run', categoryId: null, difficulty: 'easy', days: '135' });
  const hid = s.habits[0].id;
  s = await h.call('POST', `/api/habits/${hid}/complete`);
  h.advance(24); // Tuesday
  s = await h.call('GET', '/api/state');
  assert.equal(s.habits[0].scheduledToday, false);
  await assert.rejects(h.call('POST', `/api/habits/${hid}/complete`), { status: 400 });
  h.advance(24); // Wednesday — Tuesday must not have failed
  s = await h.call('GET', '/api/state');
  assert.equal(s.progress.totalXp, 10);
  s = await h.call('POST', `/api/habits/${hid}/complete`);
  assert.equal(s.habits[0].streak, 2);
});

test('quest chain unlocks parts in order; expiry fails and cancels the rest', async () => {
  const h = harness();
  await h.boot();
  const deadline = new Date(Date.parse('2026-11-02T04:00:00Z') + 5 * 3600_000).toISOString();
  let s = await h.call('POST', '/api/quests', {
    title: 'Part 1', categoryId: null, difficulty: 'normal', deadlineAt: deadline,
    parts: [{ title: 'Part 2', durationHours: 2 }, { title: 'Part 3', durationHours: 2 }],
  });
  assert.equal(s.quests.length, 1);
  assert.deepEqual(s.quests[0].chain, { index: 1, total: 3 });
  s = await h.call('POST', `/api/quests/${s.quests[0].id}/complete`);
  const p2 = s.quests.find((q: any) => q.status === 'pending');
  assert.equal(p2.title, 'Part 2');
  assert.equal(s.progress.totalXp, 25);
  h.advance(3); // part 2 expires
  s = await h.call('GET', '/api/state');
  assert.equal(s.progress.totalXp, 0);
  assert.equal(s.quests.filter((q: any) => q.status === 'pending').length, 0);
});

test('boss ×3 and one weekly mega boss per week', async () => {
  const h = harness();
  await h.boot();
  const deadline = new Date(Date.parse('2026-11-02T04:00:00Z') + 48 * 3600_000).toISOString();
  let s = await h.call('POST', '/api/quests', { title: 'Boss', categoryId: null, difficulty: 'hard', deadlineAt: deadline, boss: 'boss' });
  assert.equal(s.quests[0].xp, 150);
  s = await h.call('POST', '/api/quests', { title: 'Mega', categoryId: null, difficulty: 'easy', deadlineAt: deadline, boss: 'weekly' });
  assert.equal(s.weeklyBossAvailable, false);
  await assert.rejects(h.call('POST', '/api/quests', { title: 'Mega 2', categoryId: null, difficulty: 'easy', deadlineAt: deadline, boss: 'weekly' }), { status: 409 });
  h.advance(24 * 7);
  s = await h.call('GET', '/api/state');
  assert.equal(s.weeklyBossAvailable, true);
});

test('height defaults to 167cm; weight is logged per day, latest wins', async () => {
  const h = harness();
  let s = await h.boot();
  assert.equal(s.profile.heightCm, 167);
  assert.equal(s.profile.weightKg, null);
  s = await h.call('PUT', '/api/profile', { weightKg: 75 });
  assert.equal(s.profile.weightKg, 75);
  s = await h.call('PUT', '/api/profile', { weightKg: 74.64 });
  assert.equal(s.profile.weightKg, 74.6, 'same day overwrites, rounded to 0.1');
  h.advance(24);
  s = await h.call('PUT', '/api/profile', { weightKg: 74.2 });
  assert.equal(s.profile.weightKg, 74.2);
});
