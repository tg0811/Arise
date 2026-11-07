import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';

// Harness clock starts Monday 2026-11-02 09:30 IST.

test('to-dos: add, tick, untick, delete; no XP; ticked ones vanish at midnight, open ones stay', async () => {
  const h = harness();
  await h.boot();
  let s = await h.call('POST', '/api/todos', { text: 'Buy train tickets' });
  s = await h.call('POST', '/api/todos', { text: 'Pack the bag' });
  s = await h.call('POST', '/api/todos', { text: 'Call home' });
  assert.deepEqual(s.todos.map((t: any) => t.text), ['Buy train tickets', 'Pack the bag', 'Call home']);
  const [tickets, bag, call] = s.todos.map((t: any) => t.id);

  s = await h.call('PUT', `/api/todos/${tickets}`, { done: true });
  assert.equal(s.progress.totalXp, 0, 'no XP');
  assert.equal(s.streak.today.total, 0, 'not part of the daily clear');
  assert.deepEqual(s.todos.map((t: any) => [t.text, t.done]), [['Pack the bag', false], ['Call home', false], ['Buy train tickets', true]], 'open first, ticked last');
  s = await h.call('PUT', `/api/todos/${bag}`, { done: true });
  s = await h.call('PUT', `/api/todos/${bag}`, { done: false }); // mis-tap
  s = await h.call('DELETE', `/api/todos/${call}`);
  assert.equal(s.todos.length, 2);

  h.advance(15); // 00:30 IST Tuesday
  s = await h.call('GET', '/api/state');
  assert.deepEqual(s.todos.map((t: any) => t.text), ['Pack the bag'], 'yesterday\'s ticked to-do is gone; the open one carried over');
  await assert.rejects(h.call('POST', '/api/todos', { text: '   ' }), { status: 400 });
});
