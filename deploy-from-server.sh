#!/bin/sh
# Deploy what is on GitHub (main) without a laptop, e.g. from a phone over SSH:
#   ssh tghf-prod /opt/tghf/solo-leveling/deploy-from-server.sh
# Runs ON the server. Fetches origin/main, runs the typecheck + backend tests in Docker,
# then rebuilds and restarts the app. Never touches deploy/data (the live database) or deploy/.env.
# The repo is public, so no key is needed; the first run turns this folder into a git checkout.
# SKIP_CHECKS=1 skips the tests: emergencies only.

# Everything is inside main() so the shell has read the whole script before
# `git reset` below replaces this file with the new version.
main() {
  set -eu
  DIR=$(cd "$(dirname "$0")" && pwd)
  REPO=${ARISE_REPO:-https://github.com/tg0811/Arise.git}
  BRANCH=main
  cd "$DIR"

  # A second run (a double tap on the phone) waits for nothing and just stops.
  exec 9>"$DIR/.deploy.lock"
  flock -n 9 || { echo "Another deploy is already running."; exit 1; }

  if [ ! -d .git ]; then
    echo "First run: turning $DIR into a git checkout of $REPO"
    git init -q -b "$BRANCH"
    git remote add origin "$REPO"
  fi

  OLD=$(git rev-parse --short HEAD 2>/dev/null || echo none)
  echo "Fetching $BRANCH from GitHub..."
  git fetch -q origin "$BRANCH"
  NEW=$(git rev-parse --short "origin/$BRANCH")

  # Files copied by ./deploy.sh (rsync) that aren't on GitHub get replaced by the GitHub version.
  # Untracked + ignored files (deploy/data, deploy/.env) are never touched: no `git clean`.
  if [ "$OLD" != none ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Note: the server had code that isn't on GitHub (an earlier ./deploy.sh of uncommitted work). Replacing it with $NEW."
  fi
  git reset -q --hard "origin/$BRANCH"
  echo "Code: $OLD -> $NEW  $(git log -1 --format=%s)"

  if [ "${SKIP_CHECKS:-}" = "1" ]; then
    echo "!! SKIP_CHECKS=1: deploying WITHOUT running the tests"
  else
    echo "Running checks (typecheck, backend tests) in Docker..."
    docker build -q --target check -t arise-check . >/dev/null \
      || { echo; echo "Checks failed: the running app was NOT changed. Re-run without -q to see why: docker build --target check ."; exit 1; }
    docker image rm arise-check >/dev/null 2>&1 || true
  fi

  echo "Rebuilding and restarting the app..."
  cd deploy
  docker compose up -d --build
  docker image prune -f >/dev/null
  sleep 3
  curl -fsS http://127.0.0.1:8787/api/auth/status && echo "  <- app is up"
  DOMAIN=$(grep ^DOMAIN= .env | cut -d= -f2)
  curl -fsS "https://$DOMAIN/api/auth/status" >/dev/null && echo "Live at https://$DOMAIN ($NEW)" || echo "HTTPS not answering (nginx / certbot?)"
}
main "$@"; exit
