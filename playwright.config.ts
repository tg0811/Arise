import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Browser smoke test: the production build on a throwaway database, never your real data.
// Run with `npm run test:e2e` (builds the frontend first).
const PORT = 8790;
// One fixed folder (git-ignored, never deployed), emptied at the start of each run so nothing piles up in /tmp.
// Workers load this file too: only the main process may wipe it, or it would vanish under the running server.
const dataDir = join(import.meta.dirname, 'test-results', 'e2e-db');
if (!process.env.TEST_WORKER_INDEX) {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
}
import { E2E_PASSWORD } from './e2e/env';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  workers: 1, // one shared database: the specs run in order
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'], // phone-sized, like the real use
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node backend/src/server.ts',
    url: `http://localhost:${PORT}/api/auth/status`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), DATA_DIR: dataDir, NODE_ENV: 'production', COOKIE_SECURE: 'false', INITIAL_PASSWORD: E2E_PASSWORD },
  },
});
