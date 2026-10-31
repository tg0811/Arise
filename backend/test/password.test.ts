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
