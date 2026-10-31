import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DB } from './db.ts';
import { getSetting, setSetting } from './db.ts';

// Single-player app: one password, many sessions (phone, laptop…).

const SESSION_DAYS = 365;
export const COOKIE = 'sl_session';

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

export const isConfigured = (db: DB) => getSetting(db, 'password_hash') !== null;

export function setPassword(db: DB, password: string) {
  setSetting(db, 'password_hash', hashPassword(password));
}

export function checkPassword(db: DB, password: string): boolean {
  const stored = getSetting(db, 'password_hash');
  return stored !== null && verifyPassword(password, stored);
}

export function createSession(db: DB): { token: string; maxAge: number } {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  db.prepare('INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)').run(token, now.toISOString(), expires.toISOString());
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export function isValidSession(db: DB, token: string | undefined): boolean {
  if (!token) return false;
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token = ?').get(token) as { expires_at: string } | undefined;
  return !!row && row.expires_at > new Date().toISOString();
}

/** Sign out every device except the one making the request (after a password change). */
export function deleteOtherSessions(db: DB, keep: string) {
  db.prepare('DELETE FROM sessions WHERE token != ?').run(keep);
}

export function deleteSession(db: DB, token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ---------------------------------------------------------------- private habits

export const PRIVATE_UNLOCK_MINUTES = 5;

/** Is this session currently allowed to see private habits? */
export function privateUnlockedUntil(db: DB, token: string | undefined, now: Date): string | null {
  if (!token) return null;
  const row = db.prepare('SELECT private_until FROM sessions WHERE token = ?').get(token) as { private_until: string | null } | undefined;
  return row?.private_until && row.private_until > now.toISOString() ? row.private_until : null;
}

export function setPrivateUnlock(db: DB, token: string, until: Date | null) {
  db.prepare('UPDATE sessions SET private_until = ? WHERE token = ?').run(until ? until.toISOString() : null, token);
}
