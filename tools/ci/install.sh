#!/usr/bin/env bash
set -euo pipefail

node_version=$(tr -d '\r\n' < .node-version)
node_archive="node-v${node_version}-linux-x64.tar.xz"
curl --fail --show-error --silent --location --retry 3 \
  "https://nodejs.org/dist/v${node_version}/${node_archive}" -o "/tmp/${node_archive}"
curl --fail --show-error --silent --location --retry 3 \
  "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" -o /tmp/node-shasums.txt
(cd /tmp && sha256sum --check <(awk -v archive="$node_archive" '$2 == archive' node-shasums.txt))
tar -xJf "/tmp/${node_archive}" --strip-components=1 -C /usr/local
rm "/tmp/${node_archive}" /tmp/node-shasums.txt
npm install --global "$(node -p 'require("./package.json").packageManager')"

uv python install "$(tr -d '\r\n' < .python-version)"
# The PyPI wheel supplies standalone CMake binaries, avoiding a moving apt repo.
uv tool install --python "$(tr -d '\r\n' < .python-version)" cmake==3.31.10

curl --fail --show-error --silent --location --retry 3 \
  https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-unknown-linux-gnu/rustup-init -o /tmp/rustup-init
curl --fail --show-error --silent --location --retry 3 \
  https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-unknown-linux-gnu/rustup-init.sha256 -o /tmp/rustup-init.sha256
(cd /tmp && sha256sum --check rustup-init.sha256)
chmod +x /tmp/rustup-init
rust_version=$(sed -n 's/^channel = "\([^"]*\)"/\1/p' rust-toolchain.toml)
/tmp/rustup-init -y --no-modify-path --profile minimal --default-toolchain "$rust_version" --component rustfmt,clippy
rm /tmp/rustup-init /tmp/rustup-init.sha256

# Warm the repository bootstrap (including its archive digest verification).
# CI copies this executable to the checkout and verifies it there again.
node tools/setup-bun.mjs

# Follow the frozen Playwright version, including its matching Chromium build.
playwright_version=$(sed -n "/'@playwright\/test':/{n;n;s/.*version: //p;q;}" pnpm-lock.yaml)
test -n "$playwright_version"
pnpm dlx "playwright@${playwright_version}" install --with-deps chromium
rm -rf /var/lib/apt/lists/* /root/.cache /root/.npm
node --version
pnpm --version
uv --version
cmake --version
rustc --version
cargo clippy --version
cargo fmt --version
