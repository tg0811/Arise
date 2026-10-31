#!/bin/sh
# Nightly snapshot of the live database (cron: 15 3 * * * /opt/tghf/solo-leveling/deploy/backup.sh).
# VACUUM INTO gives a consistent copy while the app keeps running. Keeps the newest 14.
set -eu
cd "$(dirname "$0")"
mkdir -p data/backups
docker compose exec -T app node -e "
  const { DatabaseSync } = require('node:sqlite');
  new DatabaseSync('/data/sololeveling.db').exec(\"VACUUM INTO '/data/backups/arise-$(date +%F).db'\");
"
ls -1t data/backups/arise-*.db | tail -n +15 | xargs -r rm --
