#!/usr/bin/env bash
set -Eeuo pipefail

: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${VERSION:?VERSION is required}"
: "${IMAGE_PREFIX:?IMAGE_PREFIX is required}"

current_deployment_stage='initialization'
incoming_compose=".deska-compose-${VERSION}.yml"
incoming_script=".deska-server-deploy-${VERSION}.sh"
incoming_checksum=".deska-deploy-${VERSION}.sha256"
candidate_env=".env.candidate-${VERSION}"
backup_dir=''
rollback_ready=0
release_switched=0

deploy_error() {
  printf 'DESKA_DEPLOY_ERROR: %s\n' "$*" >&2
}

fix_stale_postgres_support_mounts() {
  local path nested
  for path in deploy/postgres/pg_hba.conf deploy/postgres/replica-entrypoint.sh; do
    nested="${path}/$(basename "$path")"
    if [ -f "$nested" ]; then
      printf 'DESKA_DEPLOY_STAGE: relocating nested upload at %s\n' "$nested"
      mv "$nested" "${path}.deska-fix"
      rm -rf -- "$path"
      mv "${path}.deska-fix" "$path"
    elif [ -d "$path" ] && [ ! -f "$path" ]; then
      printf 'DESKA_DEPLOY_STAGE: removing mistaken directory at %s\n' "$path"
      rm -rf -- "$path"
    fi
  done
  mkdir -p deploy/postgres
}

run_deployment_stage() {
  local label="$1"
  local maximum_seconds="$2"
  local stage_exit_code=0
  shift 2
  current_deployment_stage="$label"
  printf 'DESKA_DEPLOY_STAGE: %s (maximum %ss)\n' "$label" "$maximum_seconds"
  if command -v timeout >/dev/null 2>&1; then
    timeout --foreground --kill-after=30s "${maximum_seconds}s" "$@" || stage_exit_code=$?
  else
    "$@" || stage_exit_code=$?
  fi
  if [ "$stage_exit_code" -ne 0 ]; then
    if [ "$stage_exit_code" -eq 124 ]; then
      deploy_error "${label} exceeded its ${maximum_seconds}-second time limit."
    else
      deploy_error "${label} exited with code ${stage_exit_code}."
    fi
    return "$stage_exit_code"
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"
  sed -n "s/^${key}=//p" "$file" | tail -n 1 | tr -d '\r'
}

replace_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local temp_file
  local found=0
  temp_file="$(mktemp "${file}.deska.XXXXXX")"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$key"=*) printf '%s=%s\n' "$key" "$value"; found=1 ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$file" > "$temp_file"
  if [ "$found" -eq 0 ]; then
    printf '%s=%s\n' "$key" "$value" >> "$temp_file"
  fi
  chmod 600 "$temp_file"
  mv "$temp_file" "$file"
}

rollback_release() {
  if [ "$rollback_ready" -ne 1 ] || [ "$release_switched" -ne 1 ]; then
    return 0
  fi
  printf 'DESKA_DEPLOY_STAGE: automatic rollback started\n' >&2
  if [ -f "$backup_dir/docker-compose.yml" ]; then
    cp -p "$backup_dir/docker-compose.yml" docker-compose.yml
  fi
  cp -p "$backup_dir/environment.env" .env
  chmod 600 .env
  docker compose --env-file .env up -d --no-build --remove-orphans || return 1
  for attempt in $(seq 1 45); do
    if curl -fsS http://127.0.0.1:3001/api/health/ready >/dev/null 2>&1; then
      if [ -f "$backup_dir/installed-version" ]; then cp -p "$backup_dir/installed-version" .deska-installed-version; fi
      printf 'DESKA_DEPLOY_STAGE: automatic rollback completed; database and file backups are in %s\n' "$backup_dir" >&2
      return 0
    fi
    sleep 2
  done
  deploy_error "automatic rollback did not become healthy; use the backup in ${backup_dir}."
  return 1
}

on_deploy_error() {
  local code=$?
  trap - ERR
  set +e
  deploy_error "stage '${current_deployment_stage}' failed with exit code ${code}."
  if [ -f .env ] && [ -f docker-compose.yml ]; then
    docker compose --env-file .env ps || true
    docker compose --env-file .env logs --tail=60 postgres api web || true
  fi
  rollback_release || true
  rm -f -- "$candidate_env"
  exit "$code"
}

if [ ! -d "$DEPLOY_PATH" ]; then
  deploy_error 'DEPLOY_PATH does not exist on the server.'
  exit 1
fi
DEPLOY_PATH="$(cd "$DEPLOY_PATH" && pwd -P)"
if [ -z "$DEPLOY_PATH" ] || [ "$DEPLOY_PATH" = '/' ]; then
  deploy_error 'DEPLOY_PATH resolved to an unsafe directory.'
  exit 1
fi
cd "$DEPLOY_PATH"

for command_name in docker curl openssl sha256sum timeout tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    deploy_error "${command_name} is required on the server."
    exit 1
  fi
done
if ! docker info >/dev/null 2>&1; then
  deploy_error 'Docker Engine is not running or SERVER_USER lacks Docker permission.'
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  deploy_error 'Docker Compose plugin is unavailable to SERVER_USER.'
  exit 1
fi
if [ ! -f .env ]; then
  deploy_error 'server .env is missing at DEPLOY_PATH. Run the installer once first.'
  exit 1
fi
for incoming_file in "$incoming_compose" "$incoming_script" "$incoming_checksum"; do
  if [ ! -f "$incoming_file" ]; then
    deploy_error "deployment manifest is incomplete; ${incoming_file} was not received."
    exit 1
  fi
done
fix_stale_postgres_support_mounts
for postgres_support_file in deploy/postgres/pg_hba.conf deploy/postgres/replica-entrypoint.sh; do
  if [ ! -f "$postgres_support_file" ] || [ ! -s "$postgres_support_file" ]; then
    deploy_error "missing required postgres support file ${postgres_support_file}; the deploy workflow uploads these before running this script."
    exit 1
  fi
done

available_kb="$(df -Pk "$DEPLOY_PATH" | awk 'NR == 2 { print $4 }')"
if ! printf '%s' "$available_kb" | grep -Eq '^[0-9]+$' || [ "$available_kb" -lt 786432 ]; then
  deploy_error 'less than 768 MB of free disk space is available for a safe image update and backup.'
  exit 1
fi

for key in POSTGRES_PASSWORD JWT_SECRET SETTINGS_ENCRYPTION_KEY CORS_ORIGIN; do
  if ! grep -Eq "^${key}=[^[:space:]]+" .env; then
    deploy_error "server .env is missing required setting ${key}. Add it securely and retry."
    exit 1
  fi
done

run_deployment_stage 'Verify deployment manifest' 30 sha256sum -c "$incoming_checksum"
cp -p .env "$candidate_env"
chmod 600 "$candidate_env"
replace_env_value "$candidate_env" APP_VERSION "$VERSION"
replace_env_value "$candidate_env" IMAGE_PREFIX "$IMAGE_PREFIX"
replace_env_value "$candidate_env" COMPOSE_PROJECT_NAME "deska-news"

jwt_secret_value="$(read_env_value "$candidate_env" JWT_SECRET)"
settings_key_value="$(read_env_value "$candidate_env" SETTINGS_ENCRYPTION_KEY)"
if [ "${#jwt_secret_value}" -lt 32 ]; then
  deploy_error 'JWT_SECRET must contain at least 32 characters.'
  exit 1
fi
case "$settings_key_value" in
  dev-secret|deska-development-secret|change-this-in-production|change-this-to-a-long-random-secret-in-production) invalid_settings_key=1 ;;
  *) invalid_settings_key=0 ;;
esac
if [ "${#settings_key_value}" -lt 32 ] || [ "$jwt_secret_value" = "$settings_key_value" ] || [ "$invalid_settings_key" -eq 1 ]; then
  previous_key_value="$settings_key_value"
  new_key_value="$(openssl rand -hex 32)"
  replace_env_value "$candidate_env" SETTINGS_ENCRYPTION_KEY "$new_key_value"
  if [ -n "$previous_key_value" ]; then replace_env_value "$candidate_env" SETTINGS_ENCRYPTION_KEY_PREVIOUS "$previous_key_value"; fi
  printf 'DESKA_DEPLOY_STAGE: replaced an unsafe settings encryption key while preserving the previous key for decryption\n'
fi
unset jwt_secret_value settings_key_value previous_key_value new_key_value invalid_settings_key

# Exported values must not override the validated candidate environment.
unset POSTGRES_PASSWORD JWT_SECRET SETTINGS_ENCRYPTION_KEY CORS_ORIGIN APP_VERSION
if ! docker compose --env-file "$candidate_env" -f "$incoming_compose" config -q; then
  deploy_error 'the received docker-compose.yml is invalid with the server environment.'
  exit 1
fi

trap on_deploy_error ERR

current_deployment_stage='Create pre-deployment backup'
printf 'DESKA_DEPLOY_STAGE: Create pre-deployment backup (maximum 300s)\n'
backup_root="$DEPLOY_PATH/backups/deployments"
mkdir -p "$backup_root"
chmod 700 "$DEPLOY_PATH/backups" "$backup_root" 2>/dev/null || true
backup_dir="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-before-${VERSION}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
cp -p .env "$backup_dir/environment.env"
if [ -f docker-compose.yml ]; then cp -p docker-compose.yml "$backup_dir/docker-compose.yml"; fi
if [ -f .deska-installed-version ]; then cp -p .deska-installed-version "$backup_dir/installed-version"; fi
printf 'target_version=%s\ncreated_at=%s\n' "$VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$backup_dir/metadata.env"

postgres_id="$(docker compose --env-file .env ps -q postgres 2>/dev/null || true)"
if [ -n "$postgres_id" ]; then
  timeout --foreground --kill-after=20s 180s docker compose --env-file .env exec -T postgres pg_dump -U deska -d deska_news --format=custom > "$backup_dir/database.dump"
  test -s "$backup_dir/database.dump"
else
  printf 'PostgreSQL was not running before this deployment.\n' > "$backup_dir/database-not-running.txt"
fi
api_id="$(docker compose --env-file .env ps -q api 2>/dev/null || true)"
if [ -n "$api_id" ]; then
  timeout --foreground --kill-after=20s 300s docker exec "$api_id" tar -czf - -C /app/uploads . > "$backup_dir/uploads.tar.gz"
  test -s "$backup_dir/uploads.tar.gz"
else
  printf 'API storage was not mounted before this deployment.\n' > "$backup_dir/uploads-not-running.txt"
fi
if [ -f "$backup_dir/docker-compose.yml" ]; then rollback_ready=1; fi

current_deployment_stage='Verify pre-deployment backup'
printf 'DESKA_DEPLOY_STAGE: Verify pre-deployment backup (maximum 120s)\n'
if [ -f "$backup_dir/database.dump" ]; then
  timeout --foreground --kill-after=20s 120s docker compose --env-file .env exec -T postgres pg_restore --list < "$backup_dir/database.dump" >/dev/null
fi
if [ -f "$backup_dir/uploads.tar.gz" ]; then
  timeout --foreground --kill-after=20s 120s tar -tzf "$backup_dir/uploads.tar.gz" >/dev/null
fi

# Retain the ten most recent deployment backups. Every deletion is constrained
# to the verified backup root under DEPLOY_PATH.
while IFS= read -r old_backup; do
  case "$old_backup" in
    "$backup_root"/*) rm -rf -- "$old_backup" ;;
    *) deploy_error "refusing to remove unexpected backup path: ${old_backup}"; exit 1 ;;
  esac
done < <(ls -1dt -- "$backup_root"/* 2>/dev/null | tail -n +11 || true)

run_deployment_stage 'Pull versioned images' 600 docker compose --env-file "$candidate_env" -f "$incoming_compose" pull api web
run_deployment_stage 'Verify API image' 30 docker image inspect --format '{{.Id}}' "${IMAGE_PREFIX}/api:${VERSION}"
run_deployment_stage 'Verify Web image' 30 docker image inspect --format '{{.Id}}' "${IMAGE_PREFIX}/web:${VERSION}"
run_deployment_stage 'Start database' 120 docker compose --env-file "$candidate_env" -f "$incoming_compose" up -d postgres
run_deployment_stage 'Apply database migrations' 300 docker compose --env-file "$candidate_env" -f "$incoming_compose" run --rm --no-deps api /app/node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma

mv "$incoming_compose" docker-compose.yml
mv "$candidate_env" .env
chmod 600 .env
release_switched=1

run_deployment_stage 'Start updated services' 300 docker compose --env-file .env up -d --no-build --remove-orphans
if [ -f "$backup_dir/installed-version" ]; then
  printf 'DESKA_DEPLOY_STAGE: skipping seed on upgrade; preserving existing server data\n'
else
  run_deployment_stage 'Seed system data' 180 docker compose --env-file .env run --rm api node prisma/seed.cjs
fi

current_deployment_stage='Verify API readiness'
printf 'DESKA_DEPLOY_STAGE: Verify API readiness (maximum 120s)\n'
health_payload=''
for attempt in $(seq 1 60); do
  if health_payload="$(curl -fsS http://127.0.0.1:3001/api/health/ready 2>/dev/null)"; then
    if printf '%s' "$health_payload" | grep -Fq "\"version\":\"${VERSION}\""; then break; fi
  fi
  if [ "$attempt" = 60 ]; then
    deploy_error 'API did not report the expected version as ready.'
    false
  fi
  sleep 2
done

current_deployment_stage='Verify Web readiness'
printf 'DESKA_DEPLOY_STAGE: Verify Web readiness (maximum 90s)\n'
web_port="$(read_env_value .env WEB_PORT)"
base_path="$(read_env_value .env BASE_PATH)"
web_port="${web_port:-3000}"
base_path="/${base_path#/}"
if [ "$base_path" = '/' ]; then base_path=''; fi
for attempt in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${web_port}${base_path}/login" >/dev/null 2>&1; then break; fi
  if [ "$attempt" = 45 ]; then
    deploy_error 'Web did not become reachable after the API was ready.'
    false
  fi
  sleep 2
done

if [ -f .deska-installed-version ]; then cp -p .deska-installed-version .deska-previous-version; fi
printf '%s' "$VERSION" > .deska-installed-version
rm -f -- "$incoming_script" "$incoming_checksum"
docker image prune -f >/dev/null || true
printf 'DESKA_DEPLOY_STAGE: deployment completed successfully; safety backup: %s\n' "$backup_dir"
