import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { settle } from './game.ts';

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

// Settle deadlines even when nobody has the app open (push reminders will rely on this).
setInterval(() => {
  try {
    settle({ db, at: new Date() });
  } catch (e) {
    console.error('settle failed', e);
  }
}, 60_000);

serve({ fetch: app.fetch, port }, () => console.log(`SoloLeveling API on http://localhost:${port}`));
