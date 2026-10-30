import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { settle } from './game.ts';
import { runReminders, webPushSender } from './reminders.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const dataDir = process.env.DATA_DIR ?? join(root, 'data');
const port = Number(process.env.PORT ?? 8787);

const db = openDb(join(dataDir, 'sololeveling.db'));
const app = createApp(db);

// In production the backend also serves the built PWA.
const dist = join(root, 'frontend/dist');
if (existsSync(dist)) {
  const rel = relative(process.cwd(), dist);
  app.use('/*', serveStatic({ root: rel }));
  const index = readFileSync(join(dist, 'index.html'), 'utf8');
  app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.html(index)));
}

// Every minute: settle deadlines and send any due reminders, even when nobody has the app open.
const sender = webPushSender(db);
let ticking = false;
setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    const ctx = { db, at: new Date() };
    settle(ctx);
    await runReminders(ctx, sender);
  } catch (e) {
    console.error('minute tick failed', e);
  } finally {
    ticking = false;
  }
}, 60_000);

serve({ fetch: app.fetch, port }, () => console.log(`SoloLeveling API on http://localhost:${port}`));
