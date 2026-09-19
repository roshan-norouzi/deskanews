#!/usr/bin/env bash
set -Eeuo pipefail

# Keep Persian installer messages readable on Linux terminals when a UTF-8
# locale is available; do not fail on minimal images without locale data.
UTF8_LOCALE="$(locale -a 2>/dev/null | grep -Ei '^(C|en_US)\.utf[-]?8$' | head -n 1 || true)"
if [[ -n "$UTF8_LOCALE" ]]; then
  export LANG="$UTF8_LOCALE"
  export LC_ALL="$UTF8_LOCALE"
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

fail() { echo "[DESKA] خطا: $*" >&2; exit 1; }
generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif [[ -r /dev/urandom ]] && command -v od >/dev/null 2>&1; then
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  else
    fail "ابزار امن تولید کلید در سیستم موجود نیست؛ openssl را نصب کنید."
  fi
}
read_env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r'
}
command -v docker >/dev/null 2>&1 || fail "Docker نصب نیست."
docker info >/dev/null 2>&1 || fail "Docker در دسترس نیست؛ سرویس Docker را اجرا کنید."
if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  fail "Docker Compose نصب نیست. Docker Compose Plugin یا docker-compose را نصب کنید."
fi
PACKAGE_VERSION="$(tr -d '[:space:]' < VERSION)"
CURRENT_VERSION="$(cat .deska-installed-version 2>/dev/null || echo 0.0.0)"

if [[ -f .env && -f .deska-installed-version ]]; then
  if [[ "$(printf '%s\n' "$CURRENT_VERSION" "$PACKAGE_VERSION" | sort -V | tail -1)" != "$PACKAGE_VERSION" ]]; then
    fail "نسخه بسته قدیمی‌تر از نسخه نصب‌شده است (فعلی $CURRENT_VERSION، بسته $PACKAGE_VERSION)."
  fi
  if [[ "$CURRENT_VERSION" != "$PACKAGE_VERSION" ]]; then
    mkdir -p backups
    STAMP="$(date +%Y%m%d-%H%M%S)"
    compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "backups/db-$STAMP.sql" || fail "پشتیبان دیتابیس گرفته نشد."
    echo "[DESKA] تشخیص آپدیت از $CURRENT_VERSION به $PACKAGE_VERSION؛ داده‌ها حفظ می‌شوند."
  else
    echo "[DESKA] همین نسخه قبلاً نصب شده است؛ سرویس‌ها بررسی و در صورت نیاز تعمیر می‌شوند."
  fi
  if grep -q '^APP_VERSION=' .env; then sed -i "s/^APP_VERSION=.*/APP_VERSION=$PACKAGE_VERSION/" .env; else printf '\nAPP_VERSION=%s\n' "$PACKAGE_VERSION" >> .env; fi
elif [[ -f .env ]]; then
  echo "[DESKA] نصب نیمه‌کاره یا بدون نشانگر نسخه شناسایی شد؛ تنظیمات موجود حفظ و نصب تکمیل می‌شود."
  if grep -q '^APP_VERSION=' .env; then sed -i "s/^APP_VERSION=.*/APP_VERSION=$PACKAGE_VERSION/" .env; else printf '\nAPP_VERSION=%s\n' "$PACKAGE_VERSION" >> .env; fi
fi

if [[ -f .env ]]; then
  echo "[DESKA] فایل تنظیمات موجود است؛ مقادیر فعلی حفظ می‌شوند."
else
  echo "[DESKA] تنظیمات اولیه نصب"
  read -r -p "دامنه یا آدرس عمومی (پیش‌فرض http://localhost): " PUBLIC_URL
  PUBLIC_URL="${PUBLIC_URL:-http://localhost}"
  # Accept a complete URL such as https://example.com/deska and split it into
  # origin + base path automatically for a WordPress-like install experience.
  if [[ "$PUBLIC_URL" =~ ^(https?://[^/]+)(/.*)?$ ]]; then
    DETECTED_BASE_PATH="${BASH_REMATCH[2]:-}"
    PUBLIC_URL="${BASH_REMATCH[1]}"
  else
    DETECTED_BASE_PATH=""
  fi
  read -r -p "پورت وب (پیش‌فرض 3000): " WEB_PORT
  WEB_PORT="${WEB_PORT:-3000}"
  read -r -p "مسیر نصب داخل دامنه (مثلاً /deska، پیش‌فرض ${DETECTED_BASE_PATH:-خالی}): " BASE_PATH
  BASE_PATH="${BASE_PATH:-$DETECTED_BASE_PATH}"
  BASE_PATH="${BASE_PATH#/}"
  [[ -z "$BASE_PATH" ]] || BASE_PATH="/$BASE_PATH"
  read -r -p "ایمیل مدیر (پیش‌فرض admin@deska.local): " ADMIN_EMAIL
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@deska.local}"
  read -r -s -p "رمز مدیر (حداقل ۱۲ کاراکتر): " ADMIN_PASSWORD
  echo
  [[ "${#ADMIN_PASSWORD}" -ge 12 ]] || fail "رمز مدیر باید حداقل ۱۲ کاراکتر باشد."
  JWT_SECRET="$(generate_secret)"
  SETTINGS_ENCRYPTION_KEY="$(generate_secret)"
  cat > .env <<EOF
POSTGRES_PASSWORD=deska123
POSTGRES_PORT=5433
API_PORT=3001
WEB_PORT=$WEB_PORT
WEB_BIND_ADDRESS=127.0.0.1
BASE_PATH=$BASE_PATH
PUBLIC_URL=$PUBLIC_URL
CORS_ORIGIN=$PUBLIC_URL
JWT_SECRET=$JWT_SECRET
SETTINGS_ENCRYPTION_KEY=$SETTINGS_ENCRYPTION_KEY
APP_VERSION=$PACKAGE_VERSION
IMAGE_PREFIX=${IMAGE_PREFIX:-}
SEED_ADMIN_EMAIL=$ADMIN_EMAIL
SEED_ADMIN_PASSWORD=$ADMIN_PASSWORD
SEED_ADMIN_NAME=مدیر سیستم
EOF
fi

jwt_secret_value="$(read_env_value JWT_SECRET)"
settings_key_value="$(read_env_value SETTINGS_ENCRYPTION_KEY)"
[[ "${#jwt_secret_value}" -ge 32 ]] || fail "JWT_SECRET در .env باید حداقل ۳۲ کاراکتر باشد."
[[ "${#settings_key_value}" -ge 32 ]] || fail "SETTINGS_ENCRYPTION_KEY در .env باید حداقل ۳۲ کاراکتر باشد."
[[ "$jwt_secret_value" != "$settings_key_value" ]] || fail "SETTINGS_ENCRYPTION_KEY باید با JWT_SECRET متفاوت باشد."

# Docker Compose prioritizes exported shell variables over .env. Remove stale
# values so the validated installation file is always the source of truth.
unset POSTGRES_PASSWORD JWT_SECRET SETTINGS_ENCRYPTION_KEY CORS_ORIGIN
unset jwt_secret_value settings_key_value

# Reuse the registry choice stored by a previous installation/update.
if [[ -z "${IMAGE_PREFIX:-}" && -f .env ]]; then
  IMAGE_PREFIX="$(sed -n 's/^IMAGE_PREFIX=//p' .env | head -n 1)"
fi

if [[ -n "${IMAGE_PREFIX:-}" ]]; then
  echo "[DESKA] دریافت imageهای آماده از ${IMAGE_PREFIX}..."
  compose pull api web || fail "دریافت imageهای آماده ناموفق بود؛ IMAGE_PREFIX و دسترسی Registry را بررسی کنید."
  compose up -d --no-build --remove-orphans
else
  echo "[DESKA] ساخت و اجرای هسته..."
  compose up -d --build --remove-orphans
fi

for attempt in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${API_PORT:-3001}/api/health" >/dev/null 2>&1; then
    echo "[DESKA] نصب با موفقیت انجام شد."
    LOGIN_URL="${PUBLIC_URL:-http://localhost}:${WEB_PORT:-3000}/login"
    [[ "${WEB_PORT:-3000}" == "80" ]] && LOGIN_URL="${PUBLIC_URL:-http://localhost}/login"
    echo "[DESKA] ورود: $LOGIN_URL"
    printf '%s' "$PACKAGE_VERSION" > .deska-installed-version
    exit 0
  fi
  sleep 2
done

compose logs --tail=80 api web || true
if compose logs api 2>&1 | grep -q 'P1000'; then
  fail "اتصال API به PostgreSQL با خطای احراز هویت مواجه شد. فایل .env و volume دیتابیس باید یک رمز یکسان داشته باشند؛ داده‌های موجود را حذف نکنید."
fi
fail "سرویس‌ها در زمان مقرر آماده نشدند."
