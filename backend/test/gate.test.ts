import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';
import { e1rm } from '../../shared/engine.ts';

// Harness clock starts Monday 2026-11-02 09:30 IST.

/** Booted app with a Monday "Push" day: Bench 3×8 @ 60 kg. */
async function withPlan() {
  const h = harness();
  let s = await h.boot();
  const body = s.categories.find((c: any) => c.name === 'Body').id;
  let r = await h.call('POST', '/api/gate/exercises', { name: 'Bench press', kind: 'strength', muscle: 'Chest' });
  const bench = r.id;
  r = await h.call('POST', '/api/gate/exercises', { name: 'Run', kind: 'cardio' });
  const run = r.id;
  await h.call('PUT', '/api/gate/days/1', { name: 'Push', isRest: false });
  r = await h.call('POST', '/api/gate/days/1/items', { exerciseId: bench, targetSets: 3, targetReps: 8, targetKg: 60 });
  return { h, r, body, bench, run };
}

/** Start today's session, tick every set, finish. */
async function doWorkout(h: any) {
  let r = await h.call('POST', '/api/gate/session/start');
  for (const ex of r.gate.session.exercises) for (const st of ex.sets) {
    r = await h.call('PUT', `/api/gate/sets/${st.id}`, { reps: st.reps, kg: st.kg, seconds: st.seconds, km: st.km, done: true });
  }
  return h.call('POST', '/api/gate/session/finish', {});
}

test('plan: Monday becomes a workout day; it shows on Today and counts in the daily clear', async () => {
  const { r } = await withPlan();
  const mon = r.gate.plan.find((p: any) => p.weekday === 1);
  assert.equal(mon.scheduled, true);
  assert.equal(mon.items[0].name, 'Bench press');
  assert.equal(r.gate.plan.find((p: any) => p.weekday === 2).scheduled, false, 'other days rest');
  assert.equal(r.gate.todayPlan.weekday, 1);
  assert.deepEqual(r.state.workoutToday, { name: 'Push', done: false, total: 1, completed: 0 });
  assert.deepEqual([r.state.streak.today.done, r.state.streak.today.total], [0, 1]);
});

test('session: pre-filled sets, finish needs a ticked set, +50 Body XP, undo, Gatekeeper title', async () => {
  const { h, body } = await withPlan();
  let r = await h.call('POST', '/api/gate/session/start');
  const sets = r.gate.session.exercises[0].sets;
  assert.deepEqual(sets.map((x: any) => [x.setNo, x.reps, x.kg, x.done]), [[1, 8, 60, false], [2, 8, 60, false], [3, 8, 60, false]]);
  await assert.rejects(h.call('POST', '/api/gate/session/start'), { status: 409 });
  await assert.rejects(h.call('POST', '/api/gate/session/finish', {}), { status: 400 });
  await h.call('PUT', `/api/gate/sets/${sets[0].id}`, { reps: 8, kg: 60, done: true });
  r = await h.call('POST', '/api/gate/session/finish', {});
  assert.equal(r.state.progress.totalXp, 50);
  assert.equal(r.state.categories.find((c: any) => c.id === body).xp, 50);
  assert.equal(r.state.wallet.credits, 10);
  assert.equal(r.state.workoutToday.done, true);
  assert.equal(r.state.streak.today.cleared, true);
  assert.ok(r.state.titles.find((t: any) => t.key === 'gatekeeper').unlocked);
  r = await h.call('POST', '/api/gate/session/undo');
  assert.equal(r.state.progress.totalXp, 0);
  assert.equal(r.gate.session.status, 'active');
});

test('next week pre-fills from last time; an extra session on a rest day pays the same XP', async () => {
  const { h } = await withPlan();
  let r = await h.call('POST', '/api/gate/session/start');
  for (const st of r.gate.session.exercises[0].sets) r = await h.call('PUT', `/api/gate/sets/${st.id}`, { reps: 6, kg: 65, done: true });
  await h.call('POST', '/api/gate/session/finish', {});
  h.advance(24); // Tuesday: rest day
  r = await h.call('POST', '/api/gate/session/start');
  assert.equal(r.gate.session.scheduled, false);
  assert.equal(r.gate.session.title, 'Extra session');
  const bench = r.gate.exercises.find((e: any) => e.name === 'Bench press').id;
  r = await h.call('POST', '/api/gate/session/exercise', { exerciseId: bench });
  const set = r.gate.session.exercises[0].sets[0];
  assert.deepEqual([set.reps, set.kg], [6, 65], 'pre-filled from last time');
  await h.call('PUT', `/api/gate/sets/${set.id}`, { reps: 6, kg: 65, done: true });
  r = await h.call('POST', '/api/gate/session/finish', {});
  assert.equal(r.state.progress.totalXp, 100, 'extra session paid +50 too');
  assert.equal(r.state.wallet.credits, 20);
  h.advance(24 * 6); // next Monday
  r = await h.call('POST', '/api/gate/session/start');
  assert.deepEqual(r.gate.session.exercises[0].sets.map((x: any) => [x.reps, x.kg]), [[6, 65], [6, 65], [6, 65]]);
});

test('missed workout day: −50 once, recorded, breaks the week; days before the plan are never charged', async () => {
  const { h } = await withPlan();
  h.advance(24 * 7 + 24); // skip Monday entirely; it's now Tuesday next week
  let r = await h.call('GET', '/api/gate');
  assert.equal(r.state.progress.totalXp, 0, 'floored at 0');
  const missed = r.gate.history.filter((x: any) => x.status === 'missed');
  assert.deepEqual(missed.map((x: any) => x.date), ['2026-11-09', '2026-11-02'], 'both Mondays missed (plan existed from day one)');
  assert.equal(r.gate.streak.current, 0);
  r = await h.call('GET', '/api/gate');
  assert.equal(r.gate.history.filter((x: any) => x.status === 'missed').length, 2, 'not charged twice');
});

test('weekly streak counts complete weeks and is broken by any miss', async () => {
  const { h } = await withPlan();
  for (let w = 0; w < 3; w++) {
    await doWorkout(h);
    h.advance(24 * 7);
  }
  let r = await h.call('GET', '/api/gate'); // 4th Monday, not done yet: the week is still open
  assert.deepEqual([r.gate.streak.current, r.gate.streak.best], [3, 3]);
  await doWorkout(h);
  r = await h.call('GET', '/api/gate');
  assert.equal(r.gate.streak.current, 4);
  assert.ok(r.state.titles.find((t: any) => t.key === 'iron_disciple').unlocked);
  h.advance(24 * 8); // miss the 5th Monday
  r = await h.call('GET', '/api/gate');
  assert.deepEqual([r.gate.streak.current, r.gate.streak.best], [0, 4]);
  assert.deepEqual(r.gate.streak.weeks.slice(-2).map((w: any) => w.status), ['complete', 'broken'], 'week 4 complete, week 5 (this week) broken by the miss');
});

test('PRs, e1RM, volume and progress series', async () => {
  assert.equal(e1rm(100, 5), 116.7);
  const { h, bench } = await withPlan();
  let r = await h.call('POST', '/api/gate/session/start');
  const [a, b] = r.gate.session.exercises[0].sets;
  await h.call('PUT', `/api/gate/sets/${a.id}`, { reps: 8, kg: 60, done: true });
  await h.call('PUT', `/api/gate/sets/${b.id}`, { reps: 5, kg: 70, done: true });
  r = await h.call('POST', '/api/gate/session/finish', {});
  const ex = r.gate.exercises.find((e: any) => e.id === bench);
  assert.equal(ex.prs.kg, 70);
  assert.equal(ex.prs.e1rm, e1rm(70, 5));
  assert.equal(ex.series.length, 1);
  assert.equal(r.gate.history[0].volume, 8 * 60 + 5 * 70);
  assert.equal(r.gate.history[0].sets, 2);
});

test('archiving an exercise removes it from the plan; backup round-trip keeps the Gate', async () => {
  const { h, bench } = await withPlan();
  await doWorkout(h);
  const backup = await h.call('GET', '/api/backup');
  assert.ok(backup.tables.workout_sessions.length === 1 && backup.tables.exercises.length === 2);
  let r = await h.call('DELETE', `/api/gate/exercises/${bench}`);
  assert.equal(r.gate.plan.find((p: any) => p.weekday === 1).items.length, 0);
  await h.call('POST', '/api/reset', { phrase: 'I ACCEPT THE RESET' });
  r = await h.call('GET', '/api/gate');
  assert.equal(r.gate.plan.length, 7, 'weekday rows re-seeded after reset');
  assert.equal(r.gate.exercises.length, 0);
  await h.call('POST', '/api/restore', backup);
  r = await h.call('GET', '/api/gate');
  assert.equal(r.gate.plan.find((p: any) => p.weekday === 1).items[0].name, 'Bench press');
  assert.equal(r.gate.workoutsDone, 1);
});

test('editing a set\'s numbers never unticks it (no done field = keep)', async () => {
  const { h } = await withPlan();
  let r = await h.call('POST', '/api/gate/session/start');
  const st = r.gate.session.exercises[0].sets[0];
  await h.call('PUT', `/api/gate/sets/${st.id}`, { reps: 8, kg: 60, done: true });
  await h.call('PUT', `/api/gate/sets/${st.id}`, { reps: 8, kg: 62.5 });
  r = await h.call('GET', '/api/gate');
  const after = r.gate.session.exercises[0].sets[0];
  assert.deepEqual([after.kg, after.done], [62.5, true]);
});

test('re-creating a removed exercise by name brings it back instead of a duplicate', async () => {
  const { h, bench } = await withPlan();
  await h.call('DELETE', `/api/gate/exercises/${bench}`);
  const r = await h.call('POST', '/api/gate/exercises', { name: 'bench press', kind: 'strength', muscle: 'Upper chest' });
  assert.equal(r.id, bench, 'same exercise, history kept');
  const ex = r.gate.exercises.filter((e: any) => e.name.toLowerCase() === 'bench press');
  assert.equal(ex.length, 1);
  assert.equal(ex[0].archived, false);
  assert.equal(ex[0].muscle, 'Upper chest');
});

test('changing today\'s plan applies from next week: Rest at night can\'t dodge today, and it can\'t make today due', async () => {
  const { h, bench } = await withPlan(); // Monday "Push", plan saved today
  h.advance(24 * 7); // next Monday: the plan is a week old now
  let r = await h.call('PUT', '/api/gate/days/1', { name: 'Push', isRest: true });
  assert.equal(r.gate.todayPlan.scheduled, true, 'today keeps its workout');
  assert.equal(r.gate.planChangedToday, true);
  h.advance(24); // Tuesday: the frozen Monday was still due and is missed
  r = await h.call('GET', '/api/gate');
  assert.ok(r.gate.history.some((x: any) => x.date === '2026-11-09' && x.status === 'missed'), 'Rest marked on the day did not dodge it');
  // Tuesday is a rest day: adding exercises today does not make today due
  r = await h.call('POST', '/api/gate/days/2/items', { exerciseId: bench, targetSets: 3 });
  assert.equal(r.gate.todayPlan.scheduled, false);
  h.advance(24); // Wednesday
  r = await h.call('GET', '/api/gate');
  assert.ok(!r.gate.history.some((x: any) => x.date === '2026-11-10'), 'nothing charged for the Tuesday it was added');
});

test('the day you first build your plan, changes apply at once', async () => {
  const { h, r } = await withPlan();
  assert.equal(r.gate.todayPlan.scheduled, true);
  const after = await h.call('PUT', '/api/gate/days/1', { name: 'Push', isRest: true });
  assert.equal(after.gate.todayPlan.scheduled, false);
});

test('records are saved when a workout is finished, not while it runs; undo takes them back out', async () => {
  const { h, bench } = await withPlan();
  let r = await h.call('POST', '/api/gate/session/start');
  for (const st of r.gate.session.exercises[0].sets) await h.call('PUT', `/api/gate/sets/${st.id}`, { reps: 8, kg: 60, done: true });
  await h.call('POST', '/api/gate/session/finish', {});
  h.advance(24 * 7); // next Monday
  r = await h.call('POST', '/api/gate/session/start');
  const sets = r.gate.session.exercises[0].sets;
  await h.call('PUT', `/api/gate/sets/${sets[0].id}`, { reps: 8, kg: 80, done: true });
  r = await h.call('GET', '/api/gate');
  const lib = () => r.gate.exercises.find((e: any) => e.id === bench);
  assert.equal(lib().prs.kg, 60, 'mid-workout: the record is still last week\'s');
  r = await h.call('POST', '/api/gate/session/finish', {});
  assert.equal(lib().prs.kg, 80, 'saved on finish');
  assert.equal(r.gate.history[0].prs, 1, 'this session set a record');
  assert.equal(r.gate.history[1].prs, 0, 'the first session had nothing to beat');
  r = await h.call('POST', '/api/gate/session/undo');
  assert.equal(lib().prs.kg, 60, 'undo removed the new record');
  r = await h.call('POST', '/api/gate/session/finish', {});
  assert.equal(lib().prs.kg, 80);
});

test('history logged before records were stored is filled in once', async () => {
  const { h, bench } = await withPlan();
  await doWorkout(h);
  h.db.exec('DELETE FROM exercise_prs; UPDATE workout_sessions SET pr_count = 0');
  const r = await h.call('GET', '/api/gate');
  assert.equal(r.gate.exercises.find((e: any) => e.id === bench).prs.kg, 60);
});
