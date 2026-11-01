import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Browser smoke test: the production build on a throwaway database, never your real data.
// Run with `npm run test:e2e` (builds the frontend first).
const PORT = 8790;
const dataDir = mkdtempSync(join(tmpdir(), 'arise-e2e-'));
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
