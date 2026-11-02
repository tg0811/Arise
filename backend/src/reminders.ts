import webpush from 'web-push';
import { getSetting, setSetting, type DB } from './db.ts';
import { HttpError, getProfile, habitDue, type Ctx, type Task } from './game.ts';
import { todayWorkout } from './workout.ts';
import {
  DEFAULT_REMINDERS, inQuietHours, localDate, localMinute, minuteOfDay, type ReminderPrefs,
} from '../../shared/engine.ts';

// Web Push reminders. The server decides what to send every minute (server.ts), so reminders
// arrive even when the app is closed. Rules:
//  - Interval reminder: "N of M tasks still undone", every `intervalHours`, never in quiet hours,
//    never when nothing is left. Only counts what's scheduled TODAY (rest days never notify).
//  - Deadline nudges: `nudgeMinutes` before a habit's "by HH:MM" / a quest's deadline, and 24h
//    before a Major Goal's deadline. Each fires once. Quiet hours don't apply: you set that deadline.

export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  url: string;
}

/** Delivers one message to one subscription. Resolves `gone: true` if the subscription is dead. */
export type Sender = (subscription: webpush.PushSubscription, message: PushMessage) => Promise<{ gone: boolean }>;

const FLAVORS = [
  'The System is watching.',
  'Claim the day.',
  'The forge does not wait.',
  'Discipline now, or regret later.',
  'No one is coming. Good: that power is yours.',
  'Rank up the habits and the title follows.',
  'Arise.',
];

// ---------------------------------------------------------------- prefs & keys

export function getPrefs(db: DB): ReminderPrefs {
  const raw = getSetting(db, 'reminders');
  return raw ? { ...DEFAULT_REMINDERS, ...JSON.parse(raw) } : DEFAULT_REMINDERS;
}

export function setPrefs(db: DB, prefs: ReminderPrefs) {
  setSetting(db, 'reminders', JSON.stringify(prefs));
}

/** VAPID keys identify this server to browser push services; generated once and kept. */
export function vapidKeys(db: DB): { publicKey: string; privateKey: string } {
  const pub = getSetting(db, 'vapid_public');
  const priv = getSetting(db, 'vapid_private');
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  const keys = webpush.generateVAPIDKeys();
  setSetting(db, 'vapid_public', keys.publicKey);
  setSetting(db, 'vapid_private', keys.privateKey);
  return keys;
}

export function webPushSender(db: DB): Sender {
  const { publicKey, privateKey } = vapidKeys(db);
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:arise@localhost';
  return async (subscription, message) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(message), { vapidDetails: { subject, publicKey, privateKey }, TTL: 3600 });
      return { gone: false };
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) return { gone: true };
      console.error('push failed', e?.statusCode ?? e);
      return { gone: false };
    }
  };
}

// ---------------------------------------------------------------- subscriptions

export function subscribe(ctx: Ctx, sub: webpush.PushSubscription) {
  ctx.db.prepare('INSERT INTO push_subscriptions (endpoint, json, created_at) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET json = excluded.json')
    .run(sub.endpoint, JSON.stringify(sub), ctx.at.toISOString());
  // Start the interval clock now so enabling doesn't trigger an instant reminder.
  if (!getSetting(ctx.db, 'last_reminder_at')) setSetting(ctx.db, 'last_reminder_at', ctx.at.toISOString());
}

export function unsubscribe(ctx: Ctx, endpoint: string) {
  ctx.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

const subscriptions = (db: DB) =>
  (db.prepare('SELECT endpoint, json FROM push_subscriptions').all() as { endpoint: string; json: string }[])
    .map((r) => ({ endpoint: r.endpoint, sub: JSON.parse(r.json) as webpush.PushSubscription }));

export const subscriptionCount = (db: DB) => (db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get() as { n: number }).n;

async function broadcast(db: DB, send: Sender, message: PushMessage): Promise<number> {
  let delivered = 0;
  for (const { endpoint, sub } of subscriptions(db)) {
    const { gone } = await send(sub, message);
    if (gone) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
    else delivered++;
  }
  return delivered;
}

export async function sendTest(ctx: Ctx, send: Sender) {
  if (!subscriptionCount(ctx.db)) throw new HttpError(400, 'No device is subscribed yet');
  await broadcast(ctx.db, send, { title: 'THE SYSTEM', body: 'Notifications are working. The System will call when it matters.', tag: 'test', url: '/' });
}

// ---------------------------------------------------------------- the minute tick

/** Pick a flavour line deterministically per hour so repeated runs don't reshuffle. */
const flavor = (at: Date) => FLAVORS[Math.floor(at.getTime() / 3_600_000) % FLAVORS.length];

/** Mark a reminder as sent; returns false if it had already been sent. */
function once(db: DB, key: string, at: Date): boolean {
  const res = db.prepare('INSERT OR IGNORE INTO reminders_sent (key, at) VALUES (?, ?)').run(key, at.toISOString());
  return res.changes > 0;
}

/** Work out which reminders are due right now (pure decision; also records the "once" keys). */
export function dueReminders(ctx: Ctx): PushMessage[] {
  const { db, at } = ctx;
  const profile = getProfile(db);
  const prefs = getPrefs(db);
  if (!profile.onboarded || !prefs.enabled) return [];
  const tz = profile.timezone;
  const today = localDate(tz, at);
  const nowMin = localMinute(tz, at);
  const out: PushMessage[] = [];

  const habits = (db.prepare("SELECT * FROM tasks WHERE kind = 'habit' AND archived = 0").all() as unknown as Task[])
    .filter((h) => habitDue(h, today) && h.created_date <= today);
  const logged = new Set((db.prepare('SELECT task_id FROM habit_logs WHERE date = ?').all(today) as { task_id: number }[]).map((r) => r.task_id));
  const openHabits = habits.filter((h) => !logged.has(h.id));
  const quests = db.prepare("SELECT * FROM tasks WHERE kind = 'quest' AND status = 'pending'").all() as unknown as Task[];
  const questsDueToday = quests.filter((q) => q.deadline_at && localDate(tz, new Date(q.deadline_at)) === today);
  const doneQuestsToday = (db.prepare("SELECT completed_at FROM tasks WHERE kind = 'quest' AND status = 'done' AND completed_at IS NOT NULL").all() as { completed_at: string }[])
    .filter((q) => localDate(tz, new Date(q.completed_at)) === today).length;

  // Interval reminder (today's scheduled workout counts as one task)
  const tw = todayWorkout(ctx);
  const open = openHabits.length + questsDueToday.length + (tw && !tw.done ? 1 : 0);
  const total = habits.length + questsDueToday.length + doneQuestsToday + (tw ? 1 : 0);
  const last = getSetting(db, 'last_reminder_at');
  const due = !last || at.getTime() - Date.parse(last) >= prefs.intervalHours * 3_600_000;
  if (open > 0 && due && !inQuietHours(nowMin, prefs.quietStart, prefs.quietEnd)) {
    out.push({ title: 'THE SYSTEM', body: `${open} of ${total} task${total === 1 ? '' : 's'} still undone. ${flavor(at)}`, tag: 'interval', url: '/' });
    setSetting(db, 'last_reminder_at', at.toISOString());
  }

  // Habit reminders at the time you chose: only on its days, only while it's undone, once a day.
  // Your own exact time, so quiet hours don't apply. Up to an hour late if the server missed the minute.
  for (const h of openHabits) {
    if (!h.reminder_time) continue;
    const late = nowMin - minuteOfDay(h.reminder_time);
    if (late >= 0 && late <= 60 && once(db, `remind:${h.id}:${today}`, at)) {
      const name = h.private ? '🔒 Private habit' : `🔔 ${h.title}`;
      out.push({ title: name, body: h.deadline_time ? `Reminder: due by ${h.deadline_time}.` : 'Reminder: still to do today.', tag: `remind-${h.id}`, url: '/' });
    }
  }

  if (prefs.nudgeMinutes > 0) {
    // Habit "by HH:MM" nudges
    for (const h of openHabits) {
      if (!h.deadline_time) continue;
      const left = minuteOfDay(h.deadline_time) - nowMin;
      if (left > 0 && left <= prefs.nudgeMinutes && once(db, `habit:${h.id}:${today}`, at)) {
        // Notifications show on the lock screen: never name a private habit there.
        const name = h.private ? '🔒 Private habit' : `⏳ ${h.title}`;
        out.push({ title: name, body: `Due by ${h.deadline_time}: ${left} min left.`, tag: `habit-${h.id}`, url: '/' });
      }
    }
    // Quest deadline nudges
    for (const q of quests) {
      if (!q.deadline_at) continue;
      const left = Math.round((Date.parse(q.deadline_at) - at.getTime()) / 60_000);
      if (left > 0 && left <= prefs.nudgeMinutes && once(db, `quest:${q.id}`, at)) {
        out.push({ title: q.private ? '🔒 Private quest' : `⚔️ ${q.title}`, body: `Quest expires in ${left} min. Clear it or lose the XP.`, tag: `quest-${q.id}`, url: '/' });
      }
    }
  }

  // Major goal: one heads-up a day before the deadline
  const goals = db.prepare("SELECT id, title, deadline_at FROM goals WHERE status = 'active' AND past_due = 0").all() as { id: number; title: string; deadline_at: string }[];
  for (const g of goals) {
    const left = Date.parse(g.deadline_at) - at.getTime();
    if (left > 0 && left <= 24 * 3_600_000 && once(db, `goal:${g.id}:24h`, at)) {
      out.push({ title: `🏰 ${g.title}`, body: 'Major goal deadline in under 24 hours.', tag: `goal-${g.id}`, url: '/goals' });
    }
  }

  // Forget sent-markers older than a week.
  db.prepare('DELETE FROM reminders_sent WHERE at < ?').run(new Date(at.getTime() - 7 * 86_400_000).toISOString());
  return out;
}

/** Called every minute: send whatever is due to every subscribed device. */
export async function runReminders(ctx: Ctx, send: Sender): Promise<PushMessage[]> {
  if (!subscriptionCount(ctx.db)) return [];
  const messages = dueReminders(ctx);
  for (const m of messages) await broadcast(ctx.db, send, m);
  return messages;
}
