import { openDb } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import type { PushMessage, Sender } from '../src/reminders.ts';

// Drives the real HTTP app against an in-memory DB with a controllable clock.
export function harness(startIso = '2026-11-02T04:00:00Z', rolls: number[] = [], gone = false) { // 09:30 IST, a Monday
  const db = openDb(':memory:');
  let now = new Date(startIso);
  // Lootbox rolls come from `rolls` (cycled) so tests can pin outcomes.
  let r = 0;
  // Push messages are captured instead of sent.
  const pushed: PushMessage[] = [];
  const sender: Sender = async (_sub, m) => { pushed.push(m); return { gone }; };
  const app = createApp(db, () => now, rolls.length ? () => rolls[r++ % rolls.length] : undefined, sender);
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
    db,
    sender,
    pushed,
    ctx: () => ({ db, at: now }),
    call,
    advance: (hours: number) => { now = new Date(now.getTime() + hours * 3600_000); },
    async boot() {
      await call('POST', '/api/auth/setup', { password: 'arise123' });
      return call('PUT', '/api/profile', { name: 'Jinwoo', timezone: 'Asia/Kolkata', onboarded: true });
    },
  };
}
