import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';

// Harness clock starts Monday 2026-11-02 09:30 IST.

test('a run pays +70 Body XP and credits once a day; pace is per unit', async () => {
  const h = harness();
  await h.boot();
  let r = await h.call('POST', '/api/gate/runs', { distance: 5, unit: 'km', seconds: 1650 });
  assert.equal(r.state.progress.totalXp, 70);
  assert.equal(r.state.wallet.credits, 14);
  assert.equal(r.gate.runs.list[0].pace, 330, '5:30 per km');
  assert.equal(r.gate.runs.list[0].xp, 70);

  r = await h.call('POST', '/api/gate/runs', { distance: 3, unit: 'mi', seconds: 1800 });
  assert.equal(r.state.progress.totalXp, 70, 'second run the same day: history only');
  assert.equal(r.gate.runs.list[0].pace, 600, '10:00 per mile');
  assert.equal(r.gate.runs.list[0].xp, 0);
  assert.equal(r.gate.runs.unit, 'mi', 'last unit used is the default');

  h.advance(24);
  r = await h.call('POST', '/api/gate/runs', { distance: 4, unit: 'km', seconds: 1500 });
  assert.equal(r.state.progress.totalXp, 140, 'a new day pays again');
});

test('short runs pay nothing; impossible paces are rejected', async () => {
  const h = harness();
  await h.boot();
  let r = await h.call('POST', '/api/gate/runs', { distance: 0.5, unit: 'km', seconds: 180 });
  assert.equal(r.state.progress.totalXp, 0, 'under 1 km');
  await assert.rejects(h.call('POST', '/api/gate/runs', { distance: 10, unit: 'km', seconds: 600 }), { status: 400 });
  r = await h.call('POST', '/api/gate/runs', { distance: 2, unit: 'km', seconds: 600 });
  assert.equal(r.state.progress.totalXp, 70, 'the first run of at least 1 km pays');
});

test('removing today\'s paid run moves the XP to another run today; past runs stay', async () => {
  const h = harness();
  await h.boot();
  let r = await h.call('POST', '/api/gate/runs', { distance: 5, unit: 'km', seconds: 1650 });
  const first = r.id;
  r = await h.call('POST', '/api/gate/runs', { distance: 3, unit: 'km', seconds: 1000 });
  r = await h.call('DELETE', `/api/gate/runs/${first}`);
  assert.equal(r.state.progress.totalXp, 70, 'still one paid run today');
  assert.equal(r.gate.runs.list.length, 1);
  assert.equal(r.gate.runs.list[0].xp, 70);
  const second = r.gate.runs.list[0].id;
  r = await h.call('DELETE', `/api/gate/runs/${second}`);
  assert.equal(r.state.progress.totalXp, 0);

  r = await h.call('POST', '/api/gate/runs', { distance: 5, unit: 'km', seconds: 1650 });
  h.advance(24);
  await assert.rejects(h.call('DELETE', `/api/gate/runs/${r.id}`), { status: 409 });
});

test('runs travel with a backup', async () => {
  const h = harness();
  await h.boot();
  await h.call('POST', '/api/gate/runs', { distance: 5, unit: 'km', seconds: 1650 });
  const backup = await h.call('GET', '/api/backup');
  await h.call('POST', '/api/reset', { phrase: 'I ACCEPT THE RESET' });
  await h.call('POST', '/api/restore', backup);
  const r = await h.call('GET', '/api/gate');
  assert.equal(r.gate.runs.list.length, 1);
  assert.equal(r.state.progress.totalXp, 70);
});
