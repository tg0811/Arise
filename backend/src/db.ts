import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type DB = DatabaseSync;

// Each entry runs once, in order; the applied count lives in PRAGMA user_version.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    avatar TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    onboarded INTEGER NOT NULL DEFAULT 0,
    my_state TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0
  );

  -- Habits (recurring) and quests (one-off) share one table; kind decides which columns matter.
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('habit', 'quest')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id),
    difficulty TEXT NOT NULL,
    -- habit
    days TEXT NOT NULL DEFAULT '0123456',
    deadline_time TEXT,
    -- quest
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'done', 'failed', 'cancelled')),
    deadline_at TEXT,
    completed_at TEXT,
    chain_id TEXT,
    chain_index INTEGER,
    chain_total INTEGER,
    duration_hours REAL,
    boss TEXT NOT NULL DEFAULT 'none' CHECK (boss IN ('none', 'boss', 'weekly')),
    xp_value INTEGER,
    -- common
    archived INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    created_date TEXT NOT NULL
  );
  CREATE INDEX tasks_kind ON tasks(kind, archived, status);
  CREATE INDEX tasks_chain ON tasks(chain_id, chain_index);

  CREATE TABLE habit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('done', 'failed')),
    xp INTEGER NOT NULL,
    auto INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE (task_id, date)
  );

  -- Ledgers: level, rank, attributes and wallet are all derived from these.
  CREATE TABLE xp_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category_id INTEGER,
    source TEXT NOT NULL,
    source_id INTEGER,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX xp_events_source ON xp_events(source, source_id);

  CREATE TABLE currency_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    date TEXT NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('credits', 'gems')),
    amount INTEGER NOT NULL,
    source TEXT NOT NULL,
    source_id INTEGER,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX currency_events_source ON currency_events(source, source_id);
  `,
  `
  ALTER TABLE profile ADD COLUMN height_cm REAL;

  -- One weigh-in per day; the latest is the current weight.
  CREATE TABLE weight_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    kg REAL NOT NULL,
    at TEXT NOT NULL
  );
  `,
  `
  -- Social Media and Finance dropped from the defaults (2026-10-30): delete if unused, archive if they hold history.
  UPDATE categories SET archived = 1 WHERE name IN ('Social Media', 'Finance')
    AND (id IN (SELECT category_id FROM tasks WHERE category_id IS NOT NULL) OR id IN (SELECT category_id FROM xp_events WHERE category_id IS NOT NULL));
  DELETE FROM categories WHERE name IN ('Social Media', 'Finance') AND archived = 0;
  `,
  `
  -- Phase 2: goals, store, inventory, lootbox, journal
  CREATE TABLE goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL CHECK (type IN ('siege', 'forge', 'gauntlet')),
    category_id INTEGER REFERENCES categories(id),
    deadline_at TEXT NOT NULL,
    xp INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done')),
    past_due INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE store_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'gift',
    cost INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'credits' CHECK (currency IN ('credits', 'gems')),
    lootable INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- One row per owned unit, so the history of every redemption is kept.
  CREATE TABLE inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES store_items(id),
    source TEXT NOT NULL CHECK (source IN ('store', 'lootbox')),
    acquired_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE lootbox_claims (
    date TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    item_id INTEGER,
    at TEXT NOT NULL
  );

  CREATE TABLE journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('note', 'aar')),
    goal_id INTEGER REFERENCES goals(id),
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    planned TEXT NOT NULL DEFAULT '',
    happened TEXT NOT NULL DEFAULT '',
    why TEXT NOT NULL DEFAULT '',
    next TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Starter rewards are inserted by seedRewards() right after this step.
  `,
  `
  -- Phase 3: earned titles. Once unlocked, a title is kept forever (even if the streak behind it breaks).
  CREATE TABLE title_unlocks (
    key TEXT PRIMARY KEY,
    unlocked_at TEXT NOT NULL
  );
  ALTER TABLE profile ADD COLUMN equipped_title TEXT;
  `,
  `
  -- Phase 4: push reminders and focus sessions
  CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- One row per reminder already sent (e.g. 'habit:12:2026-10-31'), so each nudge fires once.
  CREATE TABLE reminders_sent (
    key TEXT PRIMARY KEY,
    at TEXT NOT NULL
  );

  CREATE TABLE focus_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    planned_min INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'abandoned')),
    xp INTEGER NOT NULL DEFAULT 0
  );
  `,
  `
  -- Private habits: hidden until unlocked with the password, per login session, for a few minutes.
  ALTER TABLE tasks ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sessions ADD COLUMN private_until TEXT;
  `,
  `
  -- Phase 5: The Gate (workouts)
  CREATE TABLE exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'strength' CHECK (kind IN ('strength', 'bodyweight', 'cardio')),
    muscle TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- One row per weekday (0 = Sunday … 6 = Saturday). A day is scheduled when it isn't rest and has exercises.
  CREATE TABLE workout_days (
    weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
    name TEXT NOT NULL DEFAULT '',
    is_rest INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE workout_plan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weekday INTEGER NOT NULL REFERENCES workout_days(weekday),
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    sort INTEGER NOT NULL DEFAULT 0,
    target_sets INTEGER NOT NULL DEFAULT 3,
    target_reps INTEGER,
    target_kg REAL,
    target_min REAL
  );

  -- One session per date. scheduled = it was a planned workout day (only those move XP and streaks).
  CREATE TABLE workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    scheduled INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    finished_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'done', 'missed')),
    note TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE workout_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES workout_sessions(id),
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    sort INTEGER NOT NULL DEFAULT 0,
    set_no INTEGER NOT NULL,
    reps INTEGER,
    kg REAL,
    seconds INTEGER,
    km REAL,
    done INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX workout_sets_session ON workout_sets(session_id);
  CREATE INDEX workout_sets_exercise ON workout_sets(exercise_id, done);
  `,
];

const DEFAULT_CATEGORIES: [string, string, string][] = [
  ['Mind', '#60a5fa', 'brain'],
  ['Body', '#f87171', 'dumbbell'],
  ['Soul', '#c084fc', 'sparkles'],
  ['Intellect', '#facc15', 'book-open'],
];

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      if (v === 0) seed(db);
      if (v === 1) db.prepare('UPDATE profile SET height_cm = 167 WHERE id = 1').run();
      if (v === 3) seedRewards(db);
      if (v === 7) seedWorkoutDays(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Fresh profile row + default categories (first run, and after a reset). */
export function seed(db: DB) {
  db.prepare('INSERT INTO profile (id, created_at) VALUES (1, ?)').run(new Date().toISOString());
  const ins = db.prepare('INSERT INTO categories (name, color, icon, sort) VALUES (?, ?, ?, ?)');
  DEFAULT_CATEGORIES.forEach(([name, color, icon], i) => ins.run(name, color, icon, i));
}

const STARTER_REWARDS: [string, string, string, number, 'credits' | 'gems'][] = [
  ['Fancy coffee', 'One coffee from your favourite café.', 'coffee', 100, 'credits'],
  ['One episode', 'One episode of a series, guilt-free.', 'tv', 150, 'credits'],
  ['Gaming hour', 'One hour of games, no guilt.', 'gamepad', 200, 'credits'],
  ['Movie night', 'A full movie, snacks included.', 'film', 300, 'credits'],
  ['Cheat meal', 'One meal off the plan.', 'pizza', 400, 'credits'],
  ['Something you wanted', 'Buy that thing you have been eyeing.', 'gift', 10, 'gems'],
];

/** The seven weekday rows of the workout plan (all rest until planned). Safe to call repeatedly. */
export function seedWorkoutDays(db: DB) {
  const ins = db.prepare('INSERT OR IGNORE INTO workout_days (weekday) VALUES (?)');
  for (let d = 0; d < 7; d++) ins.run(d);
}

/** Starter store rewards; the owner edits or deletes them freely. */
export function seedRewards(db: DB) {
  const ins = db.prepare('INSERT INTO store_items (name, description, icon, cost, currency, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  STARTER_REWARDS.forEach(([name, desc, icon, cost, currency], i) => ins.run(name, desc, icon, cost, currency, i, new Date().toISOString()));
}

export function getSetting(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: DB, key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

/** Run `fn` inside a transaction. */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
