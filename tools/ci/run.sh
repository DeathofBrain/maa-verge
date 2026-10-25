#!/usr/bin/env bash
set -euo pipefail

mode=${1:-application}
case "$mode" in
  application|native|release) ;;
  *) printf 'Unknown CI task: %s\n' "$mode" >&2; exit 2 ;;
esac

mkdir -p .tools/bun
if [ ! -f .tools/bun/bun ]; then
  cp /opt/maaverge-ci/.tools/bun/bun .tools/bun/bun
fi
node tools/setup-bun.mjs --check
pnpm install --frozen-lockfile --store-dir /workspace/.cache/ci/pnpm
uv sync --frozen

if [ "$mode" = application ]; then
  # Keep application checks separate from the native matrix's Rust/C++ gate.
  node --test tools/tests/environment.test.mjs tools/tests/vite-cache.test.mjs \
    tools/tests/process-tree.test.mjs tools/tests/dev-mode.test.mjs \
    tools/tests/release-assets.test.mjs tools/tests/app-updater-release.test.mjs \
    tools/tests/runtime-notices.test.mjs tools/tests/setup-aria2.test.mjs \
    tools/tests/windows-installer.test.mjs tools/tests/macos-bundle.test.mjs
  pnpm contracts:check
  pnpm -r check
  node --test packages/contracts/test/validators.test.mjs packages/contracts/test/copilot-search.test.mjs packages/contracts/test/copilot-categories.test.mjs packages/contracts/test/external-links.test.mjs
  pnpm test:runtime
  uv run --frozen ruff check services/runtime
  for platform in linux darwin win32; do
    uv run --frozen mypy --platform "$platform"
  done
  uv run --frozen pytest
  pnpm -r build
  pnpm test:e2e --workers=2
else
  node tools/probe-bun.mjs
  pnpm run doctor --native
  node tools/setup-aria2.mjs
  if [ "$mode" = release ]; then
    pnpm check
    node -e 'if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) throw new Error("TAURI_SIGNING_PRIVATE_KEY secret is required")'
  else
    node tools/build-core-worker.mjs
    pnpm test:runtime
    node tools/check-native.mjs --required
  fi
  # Extract AppImage payloads without requiring FUSE in the build container.
  APPIMAGE_EXTRACT_AND_RUN=1 pnpm build
fi
