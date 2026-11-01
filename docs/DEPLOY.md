# Production deploy: Hetzner

How Arise gets onto the server. You only do this once; after that, every update is a single `./deploy.sh` (see "Every later update").

| | |
|---|---|
| Server | `tghf-prod` (89.167.82.104, user `tghfadm`) |
| App folder | `/opt/tghf/solo-leveling` |
| URL | `https://89-167-82-104.sslip.io` |
| How it runs | Docker container `app` on `127.0.0.1:8787` (server-only), behind the server's existing **nginx** |
| HTTPS | Let's Encrypt via `certbot --nginx` (renews itself) |
| Live database | `/opt/tghf/solo-leveling/deploy/data/sololeveling.db` |

The Arise site is its own nginx `server_name`, so your existing nginx sites and the trading bot (`trading-bot.service`, `/opt/tghf/trading-bot`) are not touched.

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

# certbot with the nginx plugin
sudo apt update && sudo apt install -y certbot python3-certbot-nginx

# App folder, owned by you (data/ must exist before the first start, or Docker creates it as root)
sudo mkdir -p /opt/tghf/solo-leveling/deploy/data
sudo chown -R tghfadm: /opt/tghf/solo-leveling

# Firewall (only if ufw is active): nginx needs 80 and 443. 8787 stays closed.
sudo ufw status
sudo ufw allow 80,443/tcp

exit
```

Log in again (`ssh tghf-prod`) and check that `docker ps` works without sudo. The group change only applies to new logins.

**Hetzner Cloud Firewall:** if the server has one (Cloud Console → Firewalls), allow inbound TCP 80 and TCP 443.

## 2. Create the server's `.env` (once)

```bash
ssh tghf-prod
cat > /opt/tghf/solo-leveling/deploy/.env <<'EOF'
DOMAIN=89-167-82-104.sslip.io
INITIAL_PASSWORD=<the default password>
EOF
chmod 600 /opt/tghf/solo-leveling/deploy/.env
exit
```

`INITIAL_PASSWORD` only applies when the database has no password yet. This file is never synced or committed.

## 3. Deploy the app (from your laptop)

```bash
cd ~/work/Arise/SoloLeveling
./deploy.sh
```

The first build takes a few minutes. It should end with:

```
{"configured":true,"authed":false}  <- app is up
HTTPS not answering yet (nginx site / certbot?)
```

The HTTPS line is expected for now: the next step sets it up.

## 4. nginx site + HTTPS (once)

```bash
ssh -t tghf-prod
cd /opt/tghf/solo-leveling/deploy

sudo cp nginx-arise.conf /etc/nginx/sites-available/arise
sudo ln -s /etc/nginx/sites-available/arise /etc/nginx/sites-enabled/arise
sudo nginx -t && sudo systemctl reload nginx

# Test over plain HTTP first. This should print {"configured":true,...}
curl -s http://89-167-82-104.sslip.io/api/auth/status

# Certificate: certbot adds the 443 block and the HTTP -> HTTPS redirect to the arise site
sudo certbot --nginx -d 89-167-82-104.sslip.io --redirect

exit
```

certbot asks for an email (used for expiry warnings) and to accept the terms. Renewal is automatic. Check it with `sudo certbot renew --dry-run`.

If `nginx -t` complains, or the plain-HTTP curl returns your default site instead of Arise, paste the output to Claude. Don't edit the default site.

## 5. First login

1. Open `https://89-167-82-104.sslip.io` and log in with the default password.
2. Go through the Awakening (name, timezone).
3. **Settings → Session → Change password.** Then optionally remove the `INITIAL_PASSWORD` line from the server's `.env`.

## 6. Nightly backups

```bash
ssh tghf-prod
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
ssh tghf-prod 'systemctl is-active trading-bot.service'                  # active
ssh tghf-prod 'cd /opt/tghf/solo-leveling/deploy && docker compose ps'   # app "Up"
curl -sI http://89-167-82-104.sslip.io | head -1                        # 301 redirect to https
curl -s -m 5 http://89.167.82.104:8787 || echo "8787 closed from outside (good)"
```

---

## Every later update

Commit your changes, then from `SoloLeveling/`:

```bash
./deploy.sh
```

It first runs every check (typecheck, backend tests, browser smoke test, about 30 s) and **deploys nothing if one fails**. Then it copies the code (never the database or `.env`), rebuilds, restarts and checks both the app and HTTPS. Downtime is a few seconds. nginx and the certificate don't need touching.

## Useful commands (on the server, in `/opt/tghf/solo-leveling/deploy`)

| What | Command |
|---|---|
| App logs | `docker compose logs app --tail 100 -f` |
| Restart | `docker compose restart app` |
| Stop | `docker compose down` (data stays in `data/`) |
| nginx errors | `sudo tail -50 /var/log/nginx/error.log` |
| Restore a snapshot | `docker compose stop app && cp data/backups/arise-YYYY-MM-DD.db data/sololeveling.db && rm -f data/sololeveling.db-wal data/sololeveling.db-shm && docker compose start app` |

## Moving to your own domain later

1. Add a DNS `A` record for `arise.<domain>.com` pointing to `89.167.82.104`.
2. On the server, edit `/etc/nginx/sites-available/arise`: put the new name in **both** `server_name` lines, or add it next to the old one.
3. Run `sudo nginx -t && sudo systemctl reload nginx`, then `sudo certbot --nginx -d arise.<domain>.com --redirect`.
4. Set `DOMAIN=arise.<domain>.com` in `deploy/.env`. Only `deploy.sh`'s check uses it.
5. A new domain is a new browser origin: open the new URL, log in, reinstall the app on the phone, turn notifications back on, and set up the fingerprint again (Settings → App lock; passkeys belong to one domain). Remove the old passkeys from the list there. All data stays, because it lives on the server.
