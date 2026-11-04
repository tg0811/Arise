import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';

// Harness clock starts Monday 2026-11-02 09:30 IST.

async function withHabit() {
  const h = harness();
  await h.boot();
  const s = await h.call('POST', '/api/habits', { title: 'Japa', categoryId: null, difficulty: 'normal' });
  return { h, hid: s.habits[0].id };
}

test('a paused habit is not due: no XP lost, streak kept, resumes after the end date', async () => {
  const { h, hid } = await withHabit();
  h.advance(1.5); // past the free first hour
  let s = await h.call('POST', `/api/habits/${hid}/complete`);
  assert.equal(s.progress.totalXp, 25);
  s = await h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-03', to: '2026-11-05' });
  assert.deepEqual(s.habits[0].pause, { from: '2026-11-03', to: '2026-11-05' });
  assert.equal(s.habits[0].pausedToday, false, 'today still counts');

  h.advance(24); // Tue 03: paused
  s = await h.call('GET', '/api/state');
  assert.equal(s.habits[0].pausedToday, true);
  assert.equal(s.habits[0].scheduledToday, false);
  await assert.rejects(h.call('POST', `/api/habits/${hid}/complete`), { status: 400 });

  h.advance(72); // Fri 06: back
  s = await h.call('GET', '/api/state');
  assert.equal(s.progress.totalXp, 25, 'paused days cost nothing');
  assert.equal(s.habits[0].scheduledToday, true);
  assert.equal(s.habits[0].pause, null);
  s = await h.call('POST', `/api/habits/${hid}/complete`);
  assert.equal(s.habits[0].streak, 2, 'the streak skipped the pause instead of breaking');
});

test('pause rules: not today, no extending, cooldown; upcoming can be cancelled', async () => {
  const { h, hid } = await withHabit();
  await assert.rejects(h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-02', to: '2026-11-04' }), { status: 400 }, 'today always counts');
  await assert.rejects(h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-03', to: '2026-11-17' }), { status: 400 }, '15 days is too long');
  await assert.rejects(h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-03' }), { status: 400 }, 'an end date is required');
  let ok = await h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-03', to: '2026-11-16' }); // exactly 14
  assert.deepEqual(ok.habits[0].pause, { from: '2026-11-03', to: '2026-11-16' });
  await h.call('DELETE', `/api/habits/${hid}/pause`);
  let s = await h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-04', to: '2026-11-06' });
  s = await h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-05', to: '2026-11-07' }); // upcoming: replaced
  assert.deepEqual(s.habits[0].pause, { from: '2026-11-05', to: '2026-11-07' });
  s = await h.call('DELETE', `/api/habits/${hid}/pause`);
  assert.equal(s.habits[0].pause, null, 'cancelled before it started');

  s = await h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-03', to: '2026-11-10' });
  h.advance(48); // Wed 04: paused
  await assert.rejects(h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-05', to: '2026-11-30' }), { status: 400 }, 'no stacking or extending');
  s = await h.call('DELETE', `/api/habits/${hid}/pause`); // resume: due again today
  assert.equal(s.habits[0].scheduledToday, true);
  assert.equal(s.habits[0].pause, null);
  await assert.rejects(h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-24', to: '2026-11-26' }), { status: 400 }, '21-day cooldown');
  s = await h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-25', to: '2026-11-27' });
  assert.deepEqual(s.habits[0].pause, { from: '2026-11-25', to: '2026-11-27' });
});

test('dungeon pause: planned days inside it are neither due nor missed', async () => {
  const h = harness();
  await h.boot();
  let r = await h.call('POST', '/api/gate/exercises', { name: 'Bench press', kind: 'strength' });
  for (const wd of [2, 3]) { // Tue, Wed
    await h.call('PUT', `/api/gate/days/${wd}`, { name: 'Push', isRest: false });
    await h.call('POST', `/api/gate/days/${wd}/items`, { exerciseId: r.id, targetSets: 3 });
  }
  await assert.rejects(h.call('PUT', '/api/gate/pause', { from: '2026-11-02', to: '2026-11-03' }), { status: 400 });
  r = await h.call('PUT', '/api/gate/pause', { from: '2026-11-03', to: '2026-11-04' });
  assert.deepEqual(r.gate.pause, { from: '2026-11-03', to: '2026-11-04' });
  assert.equal(r.gate.week.find((d: any) => d.date === '2026-11-03').status, 'paused');
  h.advance(24 * 3); // Thu 05
  r = await h.call('GET', '/api/gate');
  assert.equal(r.state.progress.totalXp, 0);
  assert.ok(!r.gate.history.some((x: any) => x.status === 'missed'), 'no missed workouts');
});

test('pauses travel with a backup', async () => {
  const { h, hid } = await withHabit();
  await h.call('PUT', `/api/habits/${hid}/pause`, { from: '2026-11-10', to: '2026-11-12' });
  await h.call('PUT', '/api/gate/pause', { from: '2026-11-10', to: '2026-11-12' });
  const backup = await h.call('GET', '/api/backup');
  await h.call('POST', '/api/reset', { phrase: 'I ACCEPT THE RESET' });
  await h.call('POST', '/api/restore', backup);
  const r = await h.call('GET', '/api/gate');
  assert.deepEqual(r.state.habits[0].pause, { from: '2026-11-10', to: '2026-11-12' });
  assert.deepEqual(r.gate.pause, { from: '2026-11-10', to: '2026-11-12' });
});
