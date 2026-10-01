#!/usr/bin/env bash
#
# Deploys what is on origin/main to this machine. Run it on the Pi, from the
# production checkout:
#
#   ./scripts/deploy.sh
#
# or from somewhere else in one line:
#
#   ssh <pi> 'cd ~/repos/puent && ./scripts/deploy.sh'
#
# Bash rather than a Bun script like its neighbours: the Pi has Docker and Git
# and deliberately no Bun outside the container.
#
# It checks the configuration before it changes anything, dumps the database,
# and migrates with the new image *before* switching over -- so a migration
# that fails leaves the old version running instead of new code on a
# half-migrated database.

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/puent-backups}"
KEEP_BACKUPS=10
HEALTH_URL="http://localhost:3000/"

step() { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }

fail() {
  printf '\nDeploy stopped: %s\n' "$*" >&2
  exit 1
}

compose() { docker compose --env-file "$ENV_FILE" "$@"; }

# The value of KEY in the env file, without surrounding quotes. Never printed:
# the checks below only ask whether it is there.
env_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" |
    tail -n 1 |
    sed -e "s/^[\"']//" -e "s/[\"'][[:space:]]*$//"
}

is_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]
}

preflight() {
  step "Checking the configuration"

  command -v docker >/dev/null || fail "docker is not installed on this machine."
  [ -f "$ENV_FILE" ] || fail "$ENV_FILE is missing in $(pwd)."

  # The server refuses to start without the two CF_ACCESS_* values, and
  # cloudflared without its token. Better to find out here than after the old
  # container is gone.
  local key
  for key in DATABASE_URL CF_ACCESS_TEAM_DOMAIN CF_ACCESS_AUD TUNNEL_TOKEN; do
    [ -n "$(env_value "$key")" ] || fail "$key is missing or empty in $ENV_FILE."
  done

  if grep -Eq '^[[:space:]]*AUTH_DEV_BYPASS[[:space:]]*=' "$ENV_FILE"; then
    fail "AUTH_DEV_BYPASS is set in $ENV_FILE. It is for local development only; remove the line."
  fi

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  [ "$branch" = "main" ] || fail "this checkout is on '$branch', not on main."

  if ! git diff --quiet || ! git diff --cached --quiet; then
    git status --short >&2
    fail "tracked files were changed in this checkout. Commit or discard them first."
  fi

  note "ok"
}

pull() {
  step "Pulling main"

  local before after
  before="$(git rev-parse HEAD)"
  git pull --ff-only --quiet
  after="$(git rev-parse HEAD)"

  if [ "$before" = "$after" ]; then
    note "already at $(git rev-parse --short HEAD) -- rebuilding anyway"
    return
  fi

  note "$(git rev-parse --short "$before") -> $(git rev-parse --short "$after")"
  git log --format='    %h %s' "$before..$after"

  # This file may be one of the things that just changed. Start over with the
  # new version rather than finishing the deploy with the old steps.
  if ! git diff --quiet "$before" "$after" -- scripts/deploy.sh; then
    note "deploy.sh itself changed -- restarting with the new version"
    DEPLOY_PULLED=1 exec bash scripts/deploy.sh "$@"
  fi
}

backup_database() {
  step "Dumping the database"

  if ! is_running puent-mysql; then
    note "puent-mysql is not running, nothing to dump (first deploy?)"
    return
  fi

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  # Left behind by a run that died halfway through its dump.
  rm -f "$BACKUP_DIR"/*.partial

  local file
  file="$BACKUP_DIR/puent-$(date +%Y%m%d-%H%M%S).sql.gz"

  # The credentials come from the container's own environment. MYSQL_PWD
  # rather than -p, so nothing lands in a process list or a warning.
  docker exec puent-mysql sh -c \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --no-tablespaces "$MYSQL_DATABASE"' |
    gzip >"$file.partial"

  # An empty dump gzips to a few bytes and would otherwise pass for a backup.
  [ "$(gzip -dc "$file.partial" | wc -c)" -gt 1000 ] ||
    fail "the database dump came out empty. Nothing has been changed yet."

  mv "$file.partial" "$file"
  chmod 600 "$file"
  note "$file ($(du -h "$file" | cut -f1))"

  # Newest first; everything past the first KEEP_BACKUPS goes.
  local old
  find "$BACKUP_DIR" -name 'puent-*.sql.gz' -type f | sort -r | tail -n +"$((KEEP_BACKUPS + 1))" |
    while IFS= read -r old; do
      rm -f -- "$old"
    done
}

build() {
  step "Building the app image"
  compose build app
}

migrate() {
  step "Running migrations with the new image"
  # `run` starts a one-off container from the image that was just built, next
  # to the one still serving. -T: no terminal, so this also works over ssh.
  compose run --rm -T app bunx drizzle-kit migrate
}

switch_over() {
  step "Switching over"
  # The whole stack, not only `app`: this is what picks up a change to
  # docker-compose.yml. Services that did not change are left alone.
  compose up -d --remove-orphans
}

show_state() {
  compose ps >&2 || true
  printf '\n--- last lines of puent-app ---\n' >&2
  docker logs puent-app --tail 40 >&2 || true
}

health_check() {
  step "Checking the result"

  # 403 is the healthy answer: the server is up and refuses a request that
  # carries no Access token. There is no 200 to be had from this machine.
  local code="" attempt
  for attempt in $(seq 1 30); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" || true)"
    [ "$code" = "403" ] && break
    if [ "$code" = "200" ]; then
      show_state
      fail "the app answered 200 without an Access token. It is serving everyone; check CF_ACCESS_* in $ENV_FILE."
    fi
    sleep 1
  done

  if [ "$code" != "403" ]; then
    show_state
    fail "the app did not come up (last answer: ${code:-none}). The log above says why."
  fi
  note "app: up, and refusing requests without an Access token (403)"

  # A wrong token makes cloudflared exit and restart in a loop, so "running"
  # has to hold for a moment before it means anything.
  sleep 3
  if ! is_running puent-cloudflared ||
    [ "$(docker inspect -f '{{.State.Restarting}}' puent-cloudflared 2>/dev/null)" = "true" ]; then
    docker logs puent-cloudflared --tail 20 >&2 || true
    fail "cloudflared is not running, so the app cannot be reached from outside. Check TUNNEL_TOKEN."
  fi
  note "cloudflared: running"
}

clean_up() {
  step "Removing superseded images"
  # Every build leaves the previous image behind untagged. On an SD card that
  # adds up.
  docker image prune -f >/dev/null
  note "done"
}

# Everything runs from inside this function, so bash has read the whole file
# before the first command executes -- `git pull` may rewrite it underneath.
main() {
  cd "$(dirname "$0")/.."

  preflight
  if [ -z "${DEPLOY_PULLED:-}" ]; then
    pull "$@"
  fi
  backup_database
  build
  migrate
  switch_over
  health_check
  clean_up

  step "Deployed $(git log -1 --format='%h %s')"
  note "Open the public hostname in a browser to see it from outside."
}

main "$@"
