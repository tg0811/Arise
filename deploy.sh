#!/bin/sh
# Ship the current working tree to the server and rebuild. Usage: ./deploy.sh
set -eu
HOST=tghf-prod
DIR=/opt/tghf/solo-leveling
cd "$(dirname "$0")"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude dev-dist --exclude .git \
  --exclude /data --exclude /deploy/data --exclude /deploy/.env \
  ./ "$HOST:$DIR/"
ssh "$HOST" "cd $DIR/deploy && docker compose up -d --build && docker image prune -f >/dev/null"
sleep 3
# The app itself, on the server's localhost
ssh "$HOST" "curl -fsS http://127.0.0.1:8787/api/auth/status" && echo "  <- app is up"
# And through nginx + HTTPS (fails until certbot has run once)
DOMAIN=$(ssh "$HOST" "grep ^DOMAIN= $DIR/deploy/.env | cut -d= -f2")
curl -fsS "https://$DOMAIN/api/auth/status" >/dev/null && echo "Live at https://$DOMAIN" || echo "HTTPS not answering yet (nginx site / certbot?)"
