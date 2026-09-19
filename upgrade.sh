#!/usr/bin/env bash
set -Eeuo pipefail

UTF8_LOCALE="$(locale -a 2>/dev/null | grep -Ei '^(C|en_US)\.utf[-]?8$' | head -n 1 || true)"
if [[ -n "$UTF8_LOCALE" ]]; then
  export LANG="$UTF8_LOCALE"
  export LC_ALL="$UTF8_LOCALE"
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE="${1:-}"
fail() { echo "[DESKA] خطا: $*" >&2; exit 1; }
[[ -n "$ARCHIVE" ]] || fail "مسیر بسته نسخه جدید را وارد کنید."
[[ -f "$ARCHIVE" ]] || fail "فایل بسته پیدا نشد: $ARCHIVE"
command -v docker >/dev/null 2>&1 || fail "Docker نصب نیست."
command -v unzip >/dev/null 2>&1 || fail "unzip نصب نیست."
docker info >/dev/null 2>&1 || fail "Docker در دسترس نیست."
if docker compose version >/dev/null 2>&1; then compose() { docker compose "$@"; }; elif command -v docker-compose >/dev/null 2>&1; then compose() { docker-compose "$@"; }; else fail "Docker Compose نصب نیست."; fi

CURRENT="$(cat "$ROOT_DIR/VERSION" 2>/dev/null || echo 0.0.0)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
unzip -q "$ARCHIVE" -d "$TMP_DIR"
NEW="$(cat "$TMP_DIR/VERSION" 2>/dev/null || true)"
[[ -n "$NEW" ]] || fail "بسته نسخه‌دار نیست."
if [[ "$(printf '%s\n' "$CURRENT" "$NEW" | sort -V | tail -1)" != "$NEW" || "$CURRENT" == "$NEW" ]]; then
  fail "نسخه جدید باید بزرگ‌تر باشد (فعلی $CURRENT، بسته $NEW)."
fi

mkdir -p "$ROOT_DIR/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$ROOT_DIR/backups/db-$STAMP.sql" || fail "پشتیبان دیتابیس گرفته نشد."
ENV_BACKUP="$TMP_DIR/.env.backup"
[[ -f "$ROOT_DIR/.env" ]] && cp "$ROOT_DIR/.env" "$ENV_BACKUP"
cp -a "$TMP_DIR/." "$ROOT_DIR/"
[[ -f "$ENV_BACKUP" ]] && cp "$ENV_BACKUP" "$ROOT_DIR/.env"
if [[ -f "$ROOT_DIR/.env" ]]; then
  if grep -q '^APP_VERSION=' "$ROOT_DIR/.env"; then
    sed -i "s/^APP_VERSION=.*/APP_VERSION=$NEW/" "$ROOT_DIR/.env"
  else
    printf '\nAPP_VERSION=%s\n' "$NEW" >> "$ROOT_DIR/.env"
  fi
fi

echo "[DESKA] ارتقا از $CURRENT به $NEW؛ داده‌ها و volumeها حفظ می‌شوند."
compose up -d --build --remove-orphans
printf '%s' "$NEW" > "$ROOT_DIR/VERSION"
echo "[DESKA] ارتقا با موفقیت انجام شد."
