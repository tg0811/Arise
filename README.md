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

Environment: `PORT` (8787), `DATA_DIR` (`./data`), `INITIAL_PASSWORD` (first start only), `COOKIE_SECURE` (defaults to true in production; it must run behind HTTPS).

## Deploy (Hetzner, Docker + Caddy)

Step-by-step runbook: [`docs/DEPLOY.md`](docs/DEPLOY.md). Runs on `tghf-prod` in `/opt/tghf/solo-leveling`: the app container plus Caddy, which gets the Let's Encrypt certificate and terminates HTTPS. Live at `https://89-167-82-104.sslip.io`.

```bash
./deploy.sh                     # rsync this folder to the server, rebuild, health-check
```

- The server holds the **live database** in `deploy/data/` (never synced by `deploy.sh`); local `data/` is only a dev copy.
- `deploy/.env` on the server sets `DOMAIN` and `INITIAL_PASSWORD` (see `deploy/.env.example`). The initial password is applied only when the database has none yet; change it in Settings → Change password (this signs out every other device). It lives only in the server's `.env`, never in git.
- Nightly backups: cron runs `deploy/backup.sh` at 03:15 and keeps 14 snapshots in `deploy/data/backups/`.
- **Changing the domain:** point its DNS at the server, edit `DOMAIN` in `deploy/.env`, then `docker compose up -d`. A new domain is a new browser origin: reinstall the PWA, log in again and re-enable notifications. No data is lost.
