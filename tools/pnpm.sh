#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node_executable="$project_root/.tools/node/bin/node"
if [[ ! -x "$node_executable" ]]; then node_executable="$(command -v node || true)"; fi
node_version="$(tr -d '\r\n' < "$project_root/.node-version")"
if [[ -z "$node_executable" ]] || [[ "$("$node_executable" --version 2>/dev/null)" != "v$node_version" ]]; then
  printf 'Node %s is required. Run bash tools/bootstrap.sh to repair the checkout tools.\n' "$node_version" >&2
  exit 1
fi
export PATH="$(dirname -- "$node_executable"):$PATH"
if [[ -d "$project_root/.tools/rustup" ]]; then
  export CARGO_HOME="$project_root/.tools/cargo" RUSTUP_HOME="$project_root/.tools/rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
pnpm_entry="$project_root/.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs"
package_manager="$("$node_executable" -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).packageManager" "$project_root/package.json")"
if [[ ! -f "$pnpm_entry" ]] || [[ "$("$node_executable" "$pnpm_entry" --version 2>/dev/null)" != "${package_manager#pnpm@}" ]]; then
  printf '%s is required. Run bash tools/bootstrap.sh to repair the checkout tools.\n' "$package_manager" >&2
  exit 1
fi
cd "$project_root"
exec "$node_executable" "$pnpm_entry" "$@"
