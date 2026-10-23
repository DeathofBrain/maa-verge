# syntax=docker/dockerfile:1
FROM ghcr.io/astral-sh/uv:0.13.5 AS uv
FROM ubuntu:22.04

ARG TARGETARCH
ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/opt/cargo \
    UV_PYTHON_INSTALL_DIR=/opt/python \
    UV_TOOL_DIR=/opt/uv-tools \
    UV_TOOL_BIN_DIR=/usr/local/bin \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
ENV PATH="/opt/cargo/bin:${PATH}"

# Keep the release glibc baseline on Ubuntu 22.04. Its CMake 3.22 is too old.
RUN test "$TARGETARCH" = amd64 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential ca-certificates curl file git libayatana-appindicator3-dev \
       libfuse2 librsvg2-dev libssl-dev libwebkit2gtk-4.1-dev libxdo-dev \
       patchelf perl pkg-config unzip wget xz-utils \
    && rm -rf /var/lib/apt/lists/*
COPY --from=uv /uv /uvx /usr/local/bin/
WORKDIR /opt/maaverge-ci
COPY .node-version .python-version .bun-version rust-toolchain.toml package.json pnpm-lock.yaml ./
COPY tools/setup-bun.mjs tools/setup-bun.mjs
COPY tools/ci/install.sh ./install.sh
RUN bash install.sh

# Toolchains and browser binaries are shared read-only; project caches live in
# the mounted checkout. Never copy application data or signing keys here.
RUN useradd --create-home --uid 1001 ci \
    && mkdir /workspace \
    && chown ci:ci /workspace
ENV CARGO_HOME=/workspace/.cache/ci/cargo \
    UV_CACHE_DIR=/workspace/.cache/ci/uv \
    npm_config_cache=/workspace/.cache/ci/npm
WORKDIR /workspace
USER ci
CMD ["bash"]
