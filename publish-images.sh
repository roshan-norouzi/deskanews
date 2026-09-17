#!/usr/bin/env bash
set -Eeuo pipefail
VERSION="${1:-$(tr -d '[:space:]' < VERSION)}"
PREFIX="${2:-${IMAGE_PREFIX:-}}"
PLATFORMS="${PLATFORMS:-linux/amd64}"
BASE_PATH="${BASE_PATH:-}"
[[ -n "$PREFIX" ]] || { echo 'Usage: IMAGE_PREFIX=ghcr.io/user/deska ./publish-images.sh [version]'; exit 1; }
docker buildx build --platform "$PLATFORMS" -f apps/api/Dockerfile -t "$PREFIX/api:$VERSION" --push .
if [[ $? -ne 0 ]]; then echo 'انتشار image API ناموفق بود.' >&2; exit 1; fi
docker buildx build --platform "$PLATFORMS" -f apps/web/Dockerfile -t "$PREFIX/web:$VERSION" --build-arg NEXT_PUBLIC_APP_VERSION="$VERSION" --build-arg API_URL=http://api:3001 --build-arg NEXT_PUBLIC_BASE_PATH="$BASE_PATH" --push .
if [[ $? -ne 0 ]]; then echo 'انتشار image Web ناموفق بود.' >&2; exit 1; fi
echo "Published $PREFIX/api:$VERSION and $PREFIX/web:$VERSION"
