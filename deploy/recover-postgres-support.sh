#!/usr/bin/env bash
# Run once on the server (SSH) when deploy failed after docker-compose started
# bind-mounting deploy/postgres/* that were missing or empty directories.
#
#   cd /www/wwwroot/deska.ir/app
#   bash recover-postgres-support.sh
#
# Copy deploy/postgres/pg_hba.conf and replica-entrypoint.sh from the repo first,
# or re-run GitHub Actions deploy after the workflow uploads those files.
set -Eeuo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/www/wwwroot/deska.ir/app}"
cd "$DEPLOY_PATH"

if [ ! -f .env ]; then
  echo 'DESKA_RECOVER_ERROR: .env is missing.' >&2
  exit 1
fi

fix_mount_path() {
  local path="$1"
  if [ -d "$path" ] && [ ! -f "$path" ]; then
    echo "Removing mistaken directory at ${path} (Docker created it when the file was missing)."
    rm -rf -- "$path"
  fi
}

fix_mount_path deploy/postgres/pg_hba.conf
fix_mount_path deploy/postgres/replica-entrypoint.sh

for required in deploy/postgres/pg_hba.conf deploy/postgres/replica-entrypoint.sh; do
  if [ ! -s "$required" ]; then
    echo "DESKA_RECOVER_ERROR: ${required} is missing. Upload from deskanews/deploy/postgres/ then rerun this script." >&2
    exit 1
  fi
done

echo 'DESKA_RECOVER_STAGE: restarting PostgreSQL with valid pg_hba mount'
docker compose --env-file .env up -d postgres
for attempt in $(seq 1 30); do
  if docker compose --env-file .env exec -T postgres pg_isready -U deska -d deska_news >/dev/null 2>&1; then
    echo 'DESKA_RECOVER_STAGE: PostgreSQL is accepting connections'
    break
  fi
  if [ "$attempt" = 30 ]; then
    echo 'DESKA_RECOVER_ERROR: PostgreSQL did not become ready.' >&2
    docker compose --env-file .env logs --tail=40 postgres || true
    exit 1
  fi
  sleep 2
done

echo 'DESKA_RECOVER_STAGE: restarting API stack'
docker compose --env-file .env up -d --no-build api api-worker web
for attempt in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:3001/api/health/ready >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:3001/api/health/ready
    echo
    echo 'DESKA_RECOVER_STAGE: recovery completed'
    exit 0
  fi
  sleep 2
done

echo 'DESKA_RECOVER_ERROR: API /health/ready still failing; check failed migrations:' >&2
echo '  docker compose --env-file .env run --rm --no-deps api /app/node_modules/.bin/prisma migrate status --schema=./prisma/schema.prisma' >&2
exit 1
