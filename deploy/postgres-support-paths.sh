#!/usr/bin/env bash
# Normalizes deploy/postgres bind-mount sources after Docker created directories
# instead of files (common when compose referenced missing paths).
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
