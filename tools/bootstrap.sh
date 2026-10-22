#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
tool_root="$project_root/.tools"
mkdir -p "$tool_root"
node_version="$(tr -d '\r\n' < "$project_root/.node-version")"
mock_only=false
native=false
for argument in "$@"; do
  case "$argument" in
    --mock-only) mock_only=true ;;
    --native) native=true ;;
    *) printf 'Unknown option: %s\n' "$argument" >&2; exit 1 ;;
  esac
done
node_executable="$tool_root/node/bin/node"
if [[ -x "$node_executable" && "$("$node_executable" --version 2>/dev/null)" == "v$node_version" ]]; then
  :
elif [[ ! -e "$tool_root/node" ]] && command -v node >/dev/null && [[ "$(node --version)" == "v$node_version" ]]; then
  node_executable="$(command -v node)"
else
  case "$(uname -s)" in
    Darwin) node_os=darwin ;;
    Linux) node_os=linux ;;
    *) printf 'Use tools/bootstrap.ps1 on Windows.\n' >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64) node_arch=x64 ;;
    arm64|aarch64) node_arch=arm64 ;;
    *) printf 'Unsupported Node architecture\n' >&2; exit 1 ;;
  esac
  node_staging="$(mktemp -d "$tool_root/node-install.XXXXXX")"
  trap 'rm -rf -- "$node_staging"' EXIT
  archive="node-v$node_version-$node_os-$node_arch.tar.gz"
  source_url="https://nodejs.org/dist/v$node_version"
  curl --fail --location "$source_url/$archive" --output "$node_staging/$archive"
  curl --fail --location "$source_url/SHASUMS256.txt" --output "$node_staging/node-shasums.txt"
  expected="$(awk -v file="$archive" '$2 == file { print $1 }' "$node_staging/node-shasums.txt")"
  if command -v sha256sum >/dev/null; then
    actual="$(sha256sum "$node_staging/$archive" | awk '{ print $1 }')"
  else
    actual="$(shasum -a 256 "$node_staging/$archive" | awk '{ print $1 }')"
  fi
  [[ -n "$expected" && "$actual" == "$expected" ]] || { printf 'Node checksum mismatch\n' >&2; exit 1; }
  tar -xzf "$node_staging/$archive" -C "$node_staging"
  [[ "$("$node_staging/node-v$node_version-$node_os-$node_arch/bin/node" --version)" == "v$node_version" ]] || { printf 'Node version validation failed\n' >&2; exit 1; }
  rm -rf -- "$tool_root/node"
  mv "$node_staging/node-v$node_version-$node_os-$node_arch" "$tool_root/node"
fi
export PATH="$(dirname -- "$node_executable"):$PATH"
package_manager="$("$node_executable" -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).packageManager" "$project_root/package.json")"
[[ "$package_manager" =~ ^pnpm@10\.[0-9]+\.[0-9]+$ ]] || { printf 'Pin packageManager to pnpm 10\n' >&2; exit 1; }
pnpm_version="${package_manager#pnpm@}"
pnpm_entry="$tool_root/pnpm/node_modules/pnpm/bin/pnpm.cjs"
if [[ ! -f "$pnpm_entry" ]] || [[ "$("$node_executable" "$pnpm_entry" --version 2>/dev/null)" != "$pnpm_version" ]]; then
  npm install --prefix "$tool_root/pnpm" "$package_manager" --no-audit --no-fund
fi
[[ "$("$node_executable" "$pnpm_entry" --version)" == "$pnpm_version" ]] || { printf 'pnpm version validation failed\n' >&2; exit 1; }
cd "$project_root"
"$node_executable" "$pnpm_entry" install --frozen-lockfile
if ! "$mock_only" || "$native"; then "$node_executable" tools/setup-bun.mjs; fi
if ! "$mock_only"; then
  if [[ -x "$tool_root/uv/uv" ]]; then export PATH="$tool_root/uv:$PATH"; fi
  if ! command -v uv >/dev/null; then
    curl --fail --location https://astral.sh/uv/install.sh --output "$tool_root/uv-install.sh"
    UV_INSTALL_DIR="$tool_root/uv" UV_NO_MODIFY_PATH=1 sh "$tool_root/uv-install.sh"
    export PATH="$tool_root/uv:$PATH"
  fi
  uv python install 3.12
  uv sync --frozen
fi
if "$native"; then "$node_executable" tools/doctor.mjs --native; fi
printf 'Ready. Run: bash tools/pnpm.sh dev:mock\n'
