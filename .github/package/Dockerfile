FROM scratch

ARG SOURCE
ARG VERSION
ARG REVISION
LABEL org.opencontainers.image.source="${SOURCE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.description="Maa Verge desktop installers and SHA-256 checksums in /packages. Extract and install the package for your OS; this image does not run a desktop application."

COPY packages/ /packages/
