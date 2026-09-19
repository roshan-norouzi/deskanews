#!/usr/bin/env bash
# یک‌بار روی سرور اجرا کنید (SSH یا ترمینال پنل):
#   bash bootstrap-server.sh
set -Eeuo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/www/wwwroot/deska.ir/app}"
PUBLIC_URL="${PUBLIC_URL:-https://app.deska.ir}"

mkdir -p "$DEPLOY_PATH/backups"
cd "$DEPLOY_PATH"

if [[ -f .env ]]; then
  echo "[deska-news] .env already exists — bootstrap skipped."
  exit 0
fi

if [[ ! -f production.env.example && -f deploy/production.env.example ]]; then
  cp deploy/production.env.example .env
elif [[ -f production.env.example ]]; then
  cp production.env.example .env
else
  echo "[deska-news] production.env.example not found; clone deskanews repo into $DEPLOY_PATH first."
  exit 1
fi

echo "[deska-news] Created $DEPLOY_PATH/.env from template."
echo "[deska-news] Edit secrets in .env, then run: bash install.sh"
echo "[deska-news] Public URL: $PUBLIC_URL"
