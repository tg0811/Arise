#!/bin/sh
# Ship the current working tree to the server and rebuild. Usage: ./deploy.sh
set -eu
HOST=tghf-prod
DIR=/opt/tghf/solo-leveling
cd "$(dirname "$0")"

# Nothing ships unless the typecheck, the backend tests and the browser smoke test all pass.
# SKIP_CHECKS=1 ./deploy.sh skips them: emergencies only (e.g. a hotfix while a test is flaky).
if [ "${SKIP_CHECKS:-}" = "1" ]; then
  echo "!! SKIP_CHECKS=1: deploying WITHOUT running the tests"
else
  echo "Running checks (typecheck, backend tests, browser smoke test)..."
  npm run check || { echo; echo "Checks failed: nothing was deployed. Fix the failure above, then run ./deploy.sh again."; exit 1; }
fi

# One SSH connection for every step below, so the key's passphrase is asked once, not four times.
# (Not a script argument: that would land in shell history and the process list.)
SOCK=$(mktemp -u "${TMPDIR:-/tmp}/arise-deploy.XXXXXX")
SSH="ssh -o ControlPath=$SOCK"
echo "Connecting to $HOST..."
ssh -o ControlMaster=yes -o ControlPath="$SOCK" -o ControlPersist=yes -fN "$HOST"
# Always close it at the end: on success, on a failed step, or on Ctrl+C.
close() { ssh -o ControlPath="$SOCK" -O exit "$HOST" 2>/dev/null && echo "SSH connection closed."; }
trap close EXIT
trap 'exit 130' INT TERM

rsync -az --delete -e "$SSH" \
  --exclude node_modules --exclude dist --exclude dev-dist --exclude .git --exclude test-results --exclude playwright-report \
  --exclude /data --exclude /deploy/data --exclude /deploy/.env \
  ./ "$HOST:$DIR/"
$SSH "$HOST" "cd $DIR/deploy && docker compose up -d --build && docker image prune -f >/dev/null"
sleep 3
# The app itself, on the server's localhost
$SSH "$HOST" "curl -fsS http://127.0.0.1:8787/api/auth/status" && echo "  <- app is up"
# And through nginx + HTTPS (fails until certbot has run once)
DOMAIN=$($SSH "$HOST" "grep ^DOMAIN= $DIR/deploy/.env | cut -d= -f2")
curl -fsS "https://$DOMAIN/api/auth/status" >/dev/null && echo "Live at https://$DOMAIN" || echo "HTTPS not answering yet (nginx site / certbot?)"
