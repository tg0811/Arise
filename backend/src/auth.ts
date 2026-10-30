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

export function deleteSession(db: DB, token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
