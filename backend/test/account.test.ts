import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.ts';
import { createApp } from '../src/app.ts';

test('change password: needs the current one, then only the new one works and other devices are signed out', async () => {
  const h = harness();
  await h.boot();
  // A second device (the phone) signed in to the same DB.
  const phone = createApp(h.db);
  const login = await phone.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'arise123' }) });
  const phoneCookie = login.headers.get('set-cookie')!.split(';')[0];

  await assert.rejects(h.call('POST', '/api/password', { current: 'nope', next: 'newpass1' }), { status: 400 });
  await assert.rejects(h.call('POST', '/api/password', { current: 'arise123', next: '123' }), { status: 400 });
  await h.call('POST', '/api/password', { current: 'arise123', next: 'newpass1' });

  assert.equal((await h.call('GET', '/api/auth/status')).authed, true, 'this device stays signed in');
  assert.equal((await phone.request('/api/state', { headers: { cookie: phoneCookie } })).status, 401, 'the other device is signed out');
  await assert.rejects(h.call('POST', '/api/auth/login', { password: 'arise123' }), { status: 401 });
  await h.call('POST', '/api/auth/login', { password: 'newpass1' });
});

test('username: separate from the full name, validated, and falls back to the name until set', async () => {
  const h = harness();
  let s = await h.boot();
  assert.deepEqual([s.profile.name, s.profile.username], ['Jinwoo', 'Jinwoo'], 'unset username shows the name');
  s = await h.call('PUT', '/api/profile', { name: 'Sung Jinwoo', username: 'shadow_monarch' });
  assert.deepEqual([s.profile.name, s.profile.username], ['Sung Jinwoo', 'shadow_monarch']);
  s = await h.call('PUT', '/api/profile', { name: 'Sung Jin-Woo' });
  assert.equal(s.profile.username, 'shadow_monarch', 'changing the name keeps the username');
  for (const bad of ['ab', 'has space', 'x'.repeat(21), 'emoji😀']) {
    await assert.rejects(h.call('PUT', '/api/profile', { username: bad }), { status: 400 }, bad);
  }
});
