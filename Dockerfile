# Build the browser generator separately so the runtime has no Node toolchain
# or source files. The Node digest is pinned for repeatable builds; refresh it
# with the documented maintenance check when the builder is updated.
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
ARG NGINX_VERSION=1.30.5
FROM ${NODE_IMAGE} AS web-build

WORKDIR /workspace

COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci --ignore-scripts

# lib/ is the single source of truth for generated configuration and version.
COPY lib ./lib
COPY web ./web
COPY scripts/generate-runtime-config.mjs ./scripts/generate-runtime-config.mjs

RUN npm --prefix web run build
RUN node scripts/generate-runtime-config.mjs /tmp/nginx.conf

# Docker Official Image, free NGINX Open Source stable release.
# The explicit digest keeps this image tied to the reviewed multi-arch image.
FROM nginx:${NGINX_VERSION}-alpine@sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c AS runtime

ARG NGINX_VERSION=1.30.5
ARG VCS_REF=unknown
ARG BUILD_VERSION=dev

LABEL org.opencontainers.image.title="nginx-config generator" \
      org.opencontainers.image.description="Vue configuration generator served by unprivileged NGINX" \
      org.opencontainers.image.source="https://github.com/risan/nginx-config" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.vendor="risan" \
      org.opencontainers.image.licenses="MIT"

# The generated config listens on 8080, writes its PID and temporary files to
# /tmp, and logs to the container's stdout/stderr. UID 101 is the nginx user
# already shipped in the official image, so no root process is needed.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=web-build /workspace/web/dist/ /usr/share/nginx/html/
COPY --from=web-build /tmp/nginx.conf /etc/nginx/nginx.conf

USER 101:101
EXPOSE 8080

# wget is included by the official Alpine image. This checks the HTTP service,
# not just that an nginx process exists.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --header=Host:localhost --output-document=/dev/null http://127.0.0.1:8080/healthz || exit 1

STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
