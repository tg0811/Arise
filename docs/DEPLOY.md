# Production deploy: Hetzner

How Arise gets onto the server. You only do this once; after that, every update is a single `./deploy.sh` (see the last section).

| | |
|---|---|
| Server | `tghf-prod` (89.167.82.104, user `tghfadm`) |
| App folder | `/opt/tghf/solo-leveling` |
| URL | `https://89-167-82-104.sslip.io` |
| Containers | `app` (Node, the API and the PWA) + `caddy` (HTTPS, Let's Encrypt) |
| Live database | `/opt/tghf/solo-leveling/deploy/data/sololeveling.db` |

The trading bot (`trading-bot.service`, `/opt/tghf/trading-bot`) runs on the same box. Nothing below touches it.

---

## 1. Prepare the server (once)

```bash
ssh -t tghf-prod
```

On the server:

```bash
# Docker + compose plugin (skip if `docker compose version` already works)
docker --version || curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker tghfadm

# App folder, owned by you (data/ must exist before the first start, or Docker creates it as root)
sudo mkdir -p /opt/tghf/solo-leveling/deploy/data
sudo chown -R tghfadm: /opt/tghf/solo-leveling

# Ports 80 and 443 must be free. This should print nothing:
sudo ss -tlnp | grep -E ':(80|443) '

# Firewall (only if ufw is active)
sudo ufw status
sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp

exit
```

Log in again (`ssh tghf-prod`) and check that `docker ps` works without sudo. The group change only applies to new logins.

**Hetzner Cloud Firewall:** if the server has one (Cloud Console → Firewalls), add inbound rules for TCP 80, TCP 443 and UDP 443. Caddy needs port 80 reachable to get the certificate.

## 2. Copy the code (from your laptop)

```bash
cd ~/work/Arise/SoloLeveling
./deploy.sh
```

The first run copies the code, then stops with `set DOMAIN in deploy/.env`. That's expected: the next step creates that file.

## 3. Create the server's `.env` (once)

```bash
ssh tghf-prod
cd /opt/tghf/solo-leveling/deploy
cat > .env <<'EOF'
DOMAIN=89-167-82-104.sslip.io
INITIAL_PASSWORD=<the default password>
EOF
chmod 600 .env
exit
```

`INITIAL_PASSWORD` only applies when the database has no password yet. This file is never synced or committed.

## 4. Start it

```bash
./deploy.sh
```

The first build takes a few minutes. It ends with:

```
{"configured":true,"authed":false}  <- live at https://89-167-82-104.sslip.io
```

If the HTTPS check fails, give Caddy a minute to get the certificate, then look at its logs:

```bash
ssh tghf-prod 'cd /opt/tghf/solo-leveling/deploy && docker compose logs caddy --tail 50'
```

## 5. First login

1. Open `https://89-167-82-104.sslip.io` and log in with the default password.
2. Go through the Awakening (name, timezone).
3. **Settings → Session → Change password.** Then optionally remove the `INITIAL_PASSWORD` line from the server's `.env`.

## 6. Nightly backups

```bash
ssh tghf-prod
chmod +x /opt/tghf/solo-leveling/deploy/backup.sh
/opt/tghf/solo-leveling/deploy/backup.sh && ls -l /opt/tghf/solo-leveling/deploy/data/backups/
crontab -e
```

Add this line (03:15 server time every night; keeps the newest 14 snapshots):

```
15 3 * * * /opt/tghf/solo-leveling/deploy/backup.sh >> /opt/tghf/solo-leveling/deploy/data/backups/cron.log 2>&1
```

To also keep a copy off the server, run this from the laptop now and then:

```bash
rsync -az tghf-prod:/opt/tghf/solo-leveling/deploy/data/backups/ ~/arise-backups/
```

The in-app **Settings → Data → Download backup** (a JSON file) works too.

## 7. Phone

1. Open the URL in Chrome on the phone, log in, then use the menu → **Add to Home screen / Install app**.
2. Open it from the home screen, then **Settings → Notifications → Turn on** and allow notifications.
3. Tap **Send test notification**. If it arrives, push works.

## 8. Sanity checks

```bash
ssh tghf-prod 'systemctl is-active trading-bot.service'                            # active
ssh tghf-prod 'cd /opt/tghf/solo-leveling/deploy && docker compose ps'             # app + caddy "Up"
curl -sI http://89-167-82-104.sslip.io | head -1                                  # 308 redirect to https
```

---

## Every later update

Commit your changes, then from `SoloLeveling/`:

```bash
./deploy.sh
```

It copies the code (never the database or `.env`), rebuilds, restarts and checks the site. Downtime is a few seconds.

## Useful commands (on the server, in `/opt/tghf/solo-leveling/deploy`)

| What | Command |
|---|---|
| App logs | `docker compose logs app --tail 100 -f` |
| Restart | `docker compose restart app` |
| Stop everything | `docker compose down` (data stays in `data/`) |
| Restore a snapshot | `docker compose stop app && cp data/backups/arise-YYYY-MM-DD.db data/sololeveling.db && rm -f data/sololeveling.db-wal data/sololeveling.db-shm && docker compose start app` |

## Moving to your own domain later

1. Add a DNS `A` record for `arise.<domain>.com` pointing to `89.167.82.104`.
2. On the server, set `DOMAIN=arise.<domain>.com` in `deploy/.env`.
3. Run `docker compose up -d`. Caddy gets the new certificate on its own.
4. A new domain is a new browser origin: open the new URL, log in, reinstall the app on the phone and turn notifications back on. All data stays, because it lives on the server.
