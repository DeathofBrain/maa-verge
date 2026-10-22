#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
tool_root="$project_root/.tools"
mkdir -p "$tool_root"
node_version="$(tr -d '\r\n' < "$project_root/.node-version")"
skip_reference=false
native=false
for argument in "$@"; do
  case "$argument" in
    --skip-reference) skip_reference=true ;;
    --native) native=true ;;
    *) printf 'Unknown option: %s\n' "$argument" >&2; exit 1 ;;
  esac
done
if [[ -x "$tool_root/node/bin/node" ]]; then
  export PATH="$tool_root/node/bin:$PATH"
elif ! command -v node >/dev/null || [[ "$(node --version)" != "v$node_version" ]]; then
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
  archive="node-v$node_version-$node_os-$node_arch.tar.gz"
  source_url="https://nodejs.org/dist/v$node_version"
  curl --fail --location "$source_url/$archive" --output "$tool_root/$archive"
  curl --fail --location "$source_url/SHASUMS256.txt" --output "$tool_root/node-shasums.txt"
  expected="$(awk -v file="$archive" '$2 == file { print $1 }' "$tool_root/node-shasums.txt")"
  if command -v sha256sum >/dev/null; then
    actual="$(sha256sum "$tool_root/$archive" | awk '{ print $1 }')"
  else
    actual="$(shasum -a 256 "$tool_root/$archive" | awk '{ print $1 }')"
  fi
  [[ -n "$expected" && "$actual" == "$expected" ]] || { printf 'Node checksum mismatch\n' >&2; exit 1; }
  tar -xzf "$tool_root/$archive" -C "$tool_root"
  mv "$tool_root/node-v$node_version-$node_os-$node_arch" "$tool_root/node"
  rm -- "$tool_root/$archive"
  export PATH="$tool_root/node/bin:$PATH"
fi
pnpm_entry="$tool_root/pnpm/node_modules/pnpm/bin/pnpm.cjs"
if [[ ! -f "$pnpm_entry" ]]; then
  package_manager="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).packageManager" "$project_root/package.json")"
  [[ "$package_manager" =~ ^pnpm@10\.[0-9]+\.[0-9]+$ ]] || { printf 'Pin packageManager to pnpm 10\n' >&2; exit 1; }
  npm install --prefix "$tool_root/pnpm" "$package_manager" --no-audit --no-fund
fi
cd "$project_root"
node "$pnpm_entry" install --frozen-lockfile
if ! "$skip_reference"; then
  if [[ -x "$tool_root/uv/uv" ]]; then export PATH="$tool_root/uv:$PATH"; fi
  if ! command -v uv >/dev/null; then
    curl --fail --location https://astral.sh/uv/install.sh --output "$tool_root/uv-install.sh"
    UV_INSTALL_DIR="$tool_root/uv" UV_NO_MODIFY_PATH=1 sh "$tool_root/uv-install.sh"
    export PATH="$tool_root/uv:$PATH"
  fi
  uv python install 3.12
  uv sync --frozen
fi
if "$native"; then node tools/doctor.mjs --native; fi
printf 'Ready. Run: bash tools/pnpm.sh dev\n'
