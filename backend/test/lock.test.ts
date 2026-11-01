import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';
import { createApp } from '../src/app.ts';

// App lock: enforced by the API, so a locked device gets no data at all.

test('lock off (default): nothing changes', async () => {
  const h = harness();
  await h.boot();
  h.advance(48);
  const s = await h.call('GET', '/api/state');
  assert.equal(s.lock.enabled, false);
  assert.equal((await h.call('GET', '/api/auth/status')).locked, false);
});

test('lock on: data is refused after 5 minutes away; the password unlocks; activity keeps it open', async () => {
  const h = harness();
  await h.boot();
  let s = await h.call('PUT', '/api/app-lock', { enabled: true });
  assert.equal(s.lock.enabled, true);

  h.advance(4 / 60);
  await h.call('GET', '/api/state'); // used within 5 min: still open, and the clock restarts
  h.advance(4 / 60);
  await h.call('GET', '/api/state');

  h.advance(6 / 60);
  await assert.rejects(h.call('GET', '/api/state'), { status: 423 });
  await assert.rejects(h.call('POST', '/api/habits', { title: 'x', difficulty: 'easy' }), { status: 423 }, 'writes too');
  await assert.rejects(h.call('GET', '/api/archive'), { status: 423 });
  await assert.rejects(h.call('GET', '/api/backup'), { status: 423 });
  const st = await h.call('GET', '/api/auth/status');
  assert.deepEqual([st.authed, st.locked], [true, true]);

  await assert.rejects(h.call('POST', '/api/lock/password', { password: 'nope' }), { status: 401 });
  await h.call('POST', '/api/lock/password', { password: 'arise123' });
  s = await h.call('GET', '/api/state');
  assert.equal(s.profile.name, 'Jinwoo');
});

test('lock now, per device; a fresh login starts unlocked; turning the lock off opens every device', async () => {
  const h = harness();
  await h.boot();
  await h.call('PUT', '/api/app-lock', { enabled: true });
  await h.call('POST', '/api/lock/now');
  await assert.rejects(h.call('GET', '/api/state'), { status: 423 });

  // Another device logs in with the password: it is unlocked, this one stays locked.
  const phone = createApp(h.db, () => new Date('2026-11-02T04:00:00Z'));
  const login = await phone.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'arise123' }) });
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await phone.request('/api/state', { headers: { cookie } })).status, 200);
  await assert.rejects(h.call('GET', '/api/state'), { status: 423 });

  await phone.request('/api/app-lock', { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
  assert.equal((await h.call('GET', '/api/state')).lock.enabled, false, 'lock off: the first device opens again');
});

test('passkey endpoints: only for this site, challenge needed, garbage rejected', async () => {
  const h = harness();
  await h.boot();
  // No Origin header (not a browser request for this site): refused.
  await assert.rejects(h.call('POST', '/api/passkeys/options'), { status: 400 });
  // Verify without a pending challenge: refused, and the device stays locked.
  await h.call('PUT', '/api/app-lock', { enabled: true });
  await h.call('POST', '/api/lock/now');
  await assert.rejects(h.call('POST', '/api/lock/passkey/verify', { response: { id: 'x' } }), { status: 400 });
  await assert.rejects(h.call('GET', '/api/state'), { status: 423 });
});
