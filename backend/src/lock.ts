import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { DB } from './db.ts';
import { getSetting, setSetting } from './db.ts';
import { HttpError } from './game.ts';
import { LOCK_AFTER_MINUTES } from '../../shared/engine.ts';

// App lock. With it on, a login session must be *unlocked* to get any data, and it relocks after
// LOCK_AFTER_MINUTES without a request. Unlock with a passkey (fingerprint/face/screen lock, via WebAuthn)
// or the password. Enforced in the API middleware, not just drawn on screen: a locked device gets no data.

const CHALLENGE_MINUTES = 5;

export const lockEnabled = (db: DB) => getSetting(db, 'app_lock') === '1';
export const setLockEnabled = (db: DB, on: boolean) => setSetting(db, 'app_lock', on ? '1' : '0');

export function isUnlocked(db: DB, token: string, now: Date): boolean {
  if (!lockEnabled(db)) return true;
  const row = db.prepare('SELECT unlocked_until FROM sessions WHERE token = ?').get(token) as { unlocked_until: string | null } | undefined;
  return !!row?.unlocked_until && row.unlocked_until > now.toISOString();
}

/** Unlock this session, or keep it unlocked: each request pushes the relock time out again. */
export function touchUnlock(db: DB, token: string, now: Date) {
  db.prepare('UPDATE sessions SET unlocked_until = ? WHERE token = ?').run(new Date(now.getTime() + LOCK_AFTER_MINUTES * 60_000).toISOString(), token);
}

export function lockNow(db: DB, token: string) {
  db.prepare('UPDATE sessions SET unlocked_until = NULL, private_until = NULL WHERE token = ?').run(token);
}

// ---------------------------------------------------------------- passkeys (WebAuthn)

interface PasskeyRow { id: string; public_key: string; counter: number; transports: string; name: string; created_at: string; last_used_at: string | null }

/** Which site this is, from the browser's Origin header (must match the Host the request came to). */
export function relyingParty(origin: string | undefined, host: string | undefined) {
  if (!origin || !host) throw new HttpError(400, 'Missing origin');
  const url = new URL(origin);
  if (url.host !== host) throw new HttpError(400, 'Origin does not match this site');
  return { rpID: url.hostname, origin: url.origin };
}

function saveChallenge(db: DB, token: string, challenge: string, now: Date) {
  db.prepare('UPDATE sessions SET challenge = ? WHERE token = ?').run(JSON.stringify({ challenge, at: now.toISOString() }), token);
}

/** The session's pending challenge, consumed (single use) and only if it's fresh. */
function takeChallenge(db: DB, token: string, now: Date): string {
  const row = db.prepare('SELECT challenge FROM sessions WHERE token = ?').get(token) as { challenge: string | null } | undefined;
  db.prepare('UPDATE sessions SET challenge = NULL WHERE token = ?').run(token);
  if (!row?.challenge) throw new HttpError(400, 'No passkey request in progress');
  const { challenge, at } = JSON.parse(row.challenge) as { challenge: string; at: string };
  if (now.getTime() - Date.parse(at) > CHALLENGE_MINUTES * 60_000) throw new HttpError(400, 'Passkey request expired, try again');
  return challenge;
}

const allPasskeys = (db: DB) => db.prepare('SELECT * FROM passkeys ORDER BY created_at').all() as unknown as PasskeyRow[];

export const passkeyList = (db: DB) =>
  allPasskeys(db).map((p) => ({ id: p.id, name: p.name, createdAt: p.created_at, lastUsedAt: p.last_used_at }));

export async function registrationOptions(db: DB, token: string, rp: { rpID: string }, displayName: string, now: Date) {
  const options = await generateRegistrationOptions({
    rpName: 'Arise',
    rpID: rp.rpID,
    userName: 'arise',
    userDisplayName: displayName,
    userID: new TextEncoder().encode('arise-owner'), // one player: every passkey belongs to the same user
    attestationType: 'none',
    excludeCredentials: allPasskeys(db).map((p) => ({ id: p.id, transports: JSON.parse(p.transports) })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    preferredAuthenticatorType: 'localDevice',
  });
  saveChallenge(db, token, options.challenge, now);
  return options;
}

export async function registerPasskey(db: DB, token: string, rp: { rpID: string; origin: string }, response: RegistrationResponseJSON, name: string, now: Date) {
  const expectedChallenge = takeChallenge(db, token, now);
  const result = await verifyRegistrationResponse({
    response, expectedChallenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true,
  }).catch((e: Error) => { throw new HttpError(400, `Passkey not accepted: ${e.message}`); });
  if (!result.verified) throw new HttpError(400, 'Passkey not accepted');
  const { credential } = result.registrationInfo;
  db.prepare('INSERT INTO passkeys (id, public_key, counter, transports, name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(credential.id, Buffer.from(credential.publicKey).toString('base64url'), credential.counter, JSON.stringify(credential.transports ?? []), name, now.toISOString());
}

export async function authenticationOptions(db: DB, token: string, rp: { rpID: string }, now: Date) {
  const keys = allPasskeys(db);
  if (!keys.length) throw new HttpError(400, 'No passkey set up yet');
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: keys.map((p) => ({ id: p.id, transports: JSON.parse(p.transports) })),
    userVerification: 'required',
  });
  saveChallenge(db, token, options.challenge, now);
  return options;
}

/** Check a passkey assertion; throws unless it's one of ours, fresh, and the user was verified (fingerprint etc.). */
export async function verifyPasskey(db: DB, token: string, rp: { rpID: string; origin: string }, response: AuthenticationResponseJSON, now: Date) {
  const expectedChallenge = takeChallenge(db, token, now);
  const key = db.prepare('SELECT * FROM passkeys WHERE id = ?').get(response.id) as unknown as PasskeyRow | undefined;
  if (!key) throw new HttpError(400, 'Unknown passkey: set it up again in Settings');
  const result = await verifyAuthenticationResponse({
    response, expectedChallenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true,
    credential: { id: key.id, publicKey: Buffer.from(key.public_key, 'base64url'), counter: key.counter, transports: JSON.parse(key.transports) },
  }).catch((e: Error) => { throw new HttpError(400, `Passkey not accepted: ${e.message}`); });
  if (!result.verified) throw new HttpError(400, 'Passkey not accepted');
  db.prepare('UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?').run(result.authenticationInfo.newCounter, now.toISOString(), key.id);
}

export function deletePasskey(db: DB, id: string) {
  db.prepare('DELETE FROM passkeys WHERE id = ?').run(id);
}
