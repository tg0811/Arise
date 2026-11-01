import { backfillCategoryIds, getSetting, seed, seedRewards, seedWorkoutDays, setSetting, type DB } from './db.ts';
import { HttpError } from './game.ts';

// Backup, restore and reset. Auth (password, sessions), push keys and subscriptions are never
// part of a backup: restoring onto a new server keeps that server's login and devices.

/** Data tables in dependency order (parents first). */
const TABLES = [
  'profile', 'categories', 'tasks', 'habit_logs', 'xp_events', 'currency_events', 'goals', 'store_items',
  'inventory', 'lootbox_claims', 'journal', 'title_unlocks', 'weight_logs', 'focus_sessions', 'reminders_sent',
  'exercises', 'workout_days', 'workout_plan_items', 'workout_sessions', 'workout_sets',
] as const;

/** Settings that are game data (not credentials) and travel with a backup. */
const DATA_SETTINGS = ['last_settled_date', 'reminders', 'last_reminder_at', 'workout_schedule_since'];

export const RESET_PHRASE = 'I ACCEPT THE RESET';

const schemaVersion = (db: DB) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

export function exportData(db: DB) {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  const settings: Record<string, string> = {};
  for (const k of DATA_SETTINGS) {
    const v = getSetting(db, k);
    if (v !== null) settings[k] = v;
  }
  return { app: 'arise', schemaVersion: schemaVersion(db), exportedAt: new Date().toISOString(), tables, settings };
}

/** Check a parsed backup before anything is touched. */
export function validateBackup(db: DB, data: any): string | null {
  if (!data || typeof data !== 'object' || data.app !== 'arise') return 'Not an Arise backup file';
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) return 'Backup has no schema version';
  if (data.schemaVersion > schemaVersion(db)) return 'Backup is from a newer version of the app: update first';
  if (!data.tables || typeof data.tables !== 'object') return 'Backup has no data';
  for (const t of TABLES) if (data.tables[t] !== undefined && !Array.isArray(data.tables[t])) return `Table ${t} is malformed`;
  if (!Array.isArray(data.tables.profile) || data.tables.profile.length !== 1) return 'Backup has no profile';
  return null;
}

function wipe(db: DB) {
  for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN (" + TABLES.map(() => '?').join(',') + ')').run(...TABLES);
  for (const k of DATA_SETTINGS) db.prepare('DELETE FROM settings WHERE key = ?').run(k);
}

/** Replace all game data with a backup. Older backups load fine: missing columns take defaults. */
export function restoreData(db: DB, data: any) {
  const error = validateBackup(db, data);
  if (error) throw new HttpError(400, error);
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    try {
      wipe(db);
      for (const t of TABLES) {
        const rows = (data.tables[t] ?? []) as Record<string, unknown>[];
        if (!rows.length) continue;
        const known = new Set((db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name));
        for (const row of rows) {
          const cols = Object.keys(row).filter((c) => known.has(c));
          db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
            .run(...cols.map((c) => row[c] as any));
        }
      }
      for (const [k, v] of Object.entries(data.settings ?? {})) if (DATA_SETTINGS.includes(k)) setSetting(db, k, String(v));
      backfillCategoryIds(db); // backups from before multi-category only have category_id
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e instanceof HttpError ? e : new HttpError(400, `Restore failed: ${(e as Error).message}`);
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/** Wipe everything back to a fresh System (onboarding runs again). Login and devices stay. */
export function resetData(db: DB, phrase: string) {
  if (phrase !== RESET_PHRASE) throw new HttpError(400, `Type exactly: ${RESET_PHRASE}`);
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    try {
      wipe(db);
      seed(db);
      seedRewards(db);
      seedWorkoutDays(db);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
