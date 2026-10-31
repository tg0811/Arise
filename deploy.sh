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
DOMAIN=$(ssh "$HOST" "grep ^DOMAIN= $DIR/deploy/.env | cut -d= -f2")
sleep 3
curl -fsS "https://$DOMAIN/api/auth/status" && echo "  <- live at https://$DOMAIN"
