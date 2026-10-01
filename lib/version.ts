// Keep the tested and documented NGINX Open Source baseline in one place.
// Update the version and the digest together, then run scripts/check-nginx-version.mjs.
export const NGINX_VERSION = '1.30.5';

// Index digest of nginx:1.30.5-alpine, read with `docker buildx imagetools inspect`
// on 2026-10-01. The image runs OpenSSL 3.5.8 and ships the ACME module.
export const NGINX_IMAGE_DIGEST = 'sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94';

export const NGINX_IMAGE = `nginx:${NGINX_VERSION}-alpine@${NGINX_IMAGE_DIGEST}`;
