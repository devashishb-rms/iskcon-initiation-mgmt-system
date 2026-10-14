#!/usr/bin/env bash
# Builds the release bundle for a plain Linux x86_64 server (no Docker): the API (compiled, production
# dependencies only) and the web app (Next.js standalone server). Run it on a development machine or CI,
# never on the small server (the Next.js build needs more memory than a t3.micro has).
#
#   deploy/aws-vm/build-bundle.sh            ->  deploy/aws-vm/out/iskcon-saas-<version>-linux-x64.tar.gz (+ .sha256)
#
# Everything in the bundle is pure JavaScript, so a bundle built on any x86_64 or arm64 machine runs on the server
# with the Node version the installer provides.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"
OUT="${OUT:-$ROOT/deploy/aws-vm/out}"
VERSION="${VERSION:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)}"
API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:4100}"   # where the web server reaches the API (same machine)

echo "==> installing and building ($VERSION)"
pnpm install --frozen-lockfile
export NEXT_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1 API_URL="$API_INTERNAL_URL"
pnpm --filter @iskcon/api... --filter @iskcon/web... build

STAGE="$OUT/stage"
rm -rf "$OUT"; mkdir -p "$STAGE/api" "$STAGE/web"

echo "==> assembling the API (production dependencies only)"
pnpm --filter @iskcon/api deploy --prod --legacy "$STAGE/api"

echo "==> assembling the web server"
cp -a apps/web/.next/standalone/. "$STAGE/web/"
mkdir -p "$STAGE/web/apps/web/.next"
cp -a apps/web/.next/static "$STAGE/web/apps/web/.next/static"
[ -d apps/web/public ] && cp -a apps/web/public "$STAGE/web/apps/web/public"

echo "$VERSION" > "$STAGE/VERSION"
FILE="$OUT/iskcon-saas-$VERSION-linux-x64.tar.gz"
tar -C "$STAGE" -czf "$FILE" .
( cd "$OUT" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )
rm -rf "$STAGE"
echo "==> $FILE ($(du -h "$FILE" | cut -f1))"
