# Arise — SoloLeveling

A personal Solo Leveling–style RPG for real life, built as a self-hosted PWA.
Decisions and roadmap are in [`MEMORY.md`](MEMORY.md); the feature scope is in [`docs/feature-picks.md`](docs/feature-picks.md).

## Layout

```
shared/engine.ts   game rules (XP curve, ranks, tiers, streaks) used by both sides
backend/           Node 26 + Hono + node:sqlite — runs TypeScript directly, no build
frontend/          React + Vite + Tailwind PWA
data/              SQLite database (created on first run, git-ignored)
```

## Develop

Requires Node 26+.

```bash
npm install
npm run dev -w @sl/backend      # API on :8787
npm run dev -w @sl/frontend     # app on :5173 (proxies /api), also reachable from your phone on the LAN
```

Open http://localhost:5173. The first visit asks you to set a password.

## Test

```bash
npm test -w @sl/backend         # game rules, driven through the real API with a fake clock
npm run typecheck
```

## Production (single process)

```bash
npm run build                   # builds frontend/dist
npm start                       # backend serves the API and the built PWA on :8787
```

Environment: `PORT` (8787), `DATA_DIR` (`./data`), `COOKIE_SECURE` (defaults to true in production; it must run behind HTTPS).
