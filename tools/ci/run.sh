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
    node tools/check.mjs --app ${MAAVERGE_CI_PLAN:+--ci}
    # check --app already typechecks all workspaces, including the desktop.
    pnpm --filter @maaverge/desktop exec vite build
    node tools/ci/test-ui.mjs
    ;;
  native)
    node tools/check.mjs --native ${MAAVERGE_CI_PLAN:+--ci}
    ;;
  release)
    # Build only AppImage; extract its payload without requiring FUSE in the container.
    APPIMAGE_EXTRACT_AND_RUN=1 pnpm build
    ;;
esac
