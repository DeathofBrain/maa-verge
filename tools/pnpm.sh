#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node_executable="$project_root/.tools/node/bin/node"
if [[ ! -x "$node_executable" ]]; then node_executable="$(command -v node)"; fi
export PATH="$(dirname -- "$node_executable"):$PATH"
if [[ -x "$project_root/.tools/uv/uv" ]]; then export PATH="$project_root/.tools/uv:$PATH"; fi
pnpm_entry="$project_root/.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs"
if [[ ! -f "$pnpm_entry" ]]; then printf 'Run tools/bootstrap.sh first, or use your installed pinned pnpm.\n' >&2; exit 1; fi
cd "$project_root"
exec "$node_executable" "$pnpm_entry" "$@"
