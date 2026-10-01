ARG NGINX_VERSION=1.30.5
# Docker Official Image, free NGINX Open Source stable release.
# The explicit digest keeps this image tied to the reviewed multi-arch image.
FROM nginx:${NGINX_VERSION}-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94 AS runtime

ARG NGINX_VERSION=1.30.5
ARG VCS_REF=unknown
ARG BUILD_VERSION=dev

LABEL org.opencontainers.image.title="NGINX runtime" \
      org.opencontainers.image.description="Hardened NGINX Open Source runtime with a mountable static default" \
      org.opencontainers.image.source="https://github.com/risan/nginx-config" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.vendor="risan" \
      org.opencontainers.image.licenses="MIT"

# The generated default config (container target) listens on 8080, writes its PID and temporary
# files to /tmp, and logs to the container's stdout/stderr. Users can replace
# the complete config and document root with read-only mounts at runtime.
# UID 101 is the nginx user already shipped in the official image, so no root
# process is needed.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/default/ /usr/share/nginx/html/

USER 101:101
EXPOSE 8080

# wget is included by the official Alpine image. This checks the HTTP service,
# not just that an nginx process exists.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --header=Host:localhost --output-document=/dev/null http://127.0.0.1:8080/healthz || exit 1

STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
