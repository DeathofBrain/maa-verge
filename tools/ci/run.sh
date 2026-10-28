#!/usr/bin/env bash
set -euo pipefail

mode=${1:-app}
case "$mode" in
  app|native|release) ;;
  *) printf 'Unknown CI task: %s\n' "$mode" >&2; exit 2 ;;
esac

if [ "$mode" = release ]; then
  node -e 'if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) throw new Error("TAURI_SIGNING_PRIVATE_KEY secret is required")'
fi

mkdir -p .tools/bun
if [ ! -f .tools/bun/bun ]; then
  cp /opt/maaverge-ci/.tools/bun/bun .tools/bun/bun
fi
node tools/setup-bun.mjs --check
pnpm install --frozen-lockfile --store-dir /workspace/.cache/ci/pnpm

case "$mode" in
  app)
    uv sync --frozen
    node tools/check.mjs --app
    pnpm -r build
    pnpm test:e2e --workers=2
    ;;
  native)
    uv sync --frozen
    node tools/check.mjs --native
    ;;
  release)
    # Extract AppImage payloads without requiring FUSE in the build container.
    APPIMAGE_EXTRACT_AND_RUN=1 pnpm build
    ;;
esac
