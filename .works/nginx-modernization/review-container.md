# Final container and publication review

Review date: 2026-09-20. Repository base:
`9a2acdc327f6c2cea42540653768043b4cde99c6`. The reviewed working-tree
candidate contained 66 product files. The sorted per-file SHA-256 manifest,
excluding `.works/` and ignored build output, hashed to
`f36ec005020cf2f997f6b1ae7b1191f0c3c3e9dbb1416ddc17da811721a76ed4`.

## Verdict

**Pass. No container or publication blocker remains.**

The production image runs NGINX 1.30.5 as UID/GID 101 on a read-only root
filesystem. The HTTP and TLS Compose services have working application-level
health probes. Release publication is gated by the full validation job, accepts
only stable `vMAJOR.MINOR.PATCH` Git tags without leading zeroes, and gives
manual runs SHA-derived tags only. The publish job has only the token
permissions it uses.

Registry publication itself was not triggered during review. That is the only
unexercised external boundary; the local build, runtime matrix, Compose startup,
and tag calculations were exercised without registry credentials.

## Candidate identity

- Review image ID:
  `sha256:e81ba5d55f64fcc1061618abe364bdc2f0ba26cc98626ab235ff02aa38808ed2`.
- Image metadata: `USER 101:101`, revision `review-bb41fa1fd9e3`, version
  `review-final`.
- Runtime command: `nginx -v` returned exactly `nginx/1.30.5`.
- Runtime base: `nginx:1.30.5-alpine` at multi-platform digest
  `sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c`.
- Builder base: `node:24-alpine` at multi-platform digest
  `sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`.
- PHP fixture: `php:8.4-fpm-alpine` at multi-platform digest
  `sha256:c68b19eac3042f36ed7dc7b1240712ad83d421f59e79c73357a645b520f7f68d`.

The NGINX, Node, and PHP digests match the Docker Hub tag API responses checked on
2026-09-20:

- <https://hub.docker.com/v2/repositories/library/nginx/tags/1.30.5-alpine>
- <https://hub.docker.com/v2/repositories/library/node/tags/24-alpine>
- <https://hub.docker.com/v2/repositories/library/php/tags/8.4-fpm-alpine>

NGINX's official download and security pages reported 1.30.5 as the current
stable release and as the fixed stable release for CVE-2026-90439:

- <https://nginx.org/en/download.html>
- <https://nginx.org/en/security_advisories.html>

## Prior finding resolution

1. **Manual publication cannot move release aliases.** A manual dispatch
   produces only `manual-<12-char SHA>` and `sha-<12-char SHA>` tags
   (`.github/workflows/publish-image.yml:91-105`).
2. **Release tags are strict and stable-only.** The gate accepts
   `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$` before registry
   login (`.github/workflows/publish-image.yml:73-86`). Local boundary checks
   accepted `v0.0.0` and `v1.2.3`, and rejected leading-zero, prerelease,
   malformed, and incomplete tags.
3. **Both Compose health paths are real requests.** The default service probes
   HTTP `/healthz`. The TLS profile uses the configured server name for Host
   and TLS SNI, then requests HTTPS `/healthz` (`compose.yaml:23-28,50-70`). An
   actual Compose startup with the generated `example.com` TLS config and a
   temporary certificate reached `running/healthy`, as UID 101 with a read-only
   root filesystem.
4. **Browser behavior gates CI and publication.** CI and release validation run
   unit tests, a production build, Chromium installation, and the Playwright
   interaction suite (`.github/workflows/ci.yml:34-55` and
   `.github/workflows/publish-image.yml:32-38`). The independent run passed both
   profile/download and narrow-screen/dependency tests.
5. **The claimed version is tied to the running image.** The version-source
   check covers the canonical source, Docker build argument, and Compose. The
   image smoke also executes `nginx -v` and compares it with 1.30.5
   (`scripts/smoke-image.sh:98-102`).
6. **Representative behavior is runtime-tested.** The matrix proves forwarding
   header normalization; public cache hits and privacy/method bypasses; PHP-FPM
   execution and missing-script denial; TLS startup, redirect, HTTP/2 config,
   and scoped HSTS. The cache and TLS harnesses wait for their endpoints and
   use UUID-scoped Docker resources, so startup races and cross-run name
   collisions do not create false failures.
7. **Publication permissions are minimal for the implemented job.** The
   workflow default is `contents: read`; the publish job adds only
   `packages: write` (`.github/workflows/publish-image.yml:8-16,51-57`). Every
   third-party action is pinned to a full commit SHA.

## Independent checks

The following checks passed against the final files or the exact review image:

- `node scripts/check-nginx-version.mjs`
- `node --test tests/config.test.mjs` — 14/14 passed
- `node scripts/generate-examples.mjs --check` — 12 generated files current
- `npm --prefix web run test:unit` — 11/11 passed
- `npm --prefix web run build`
- `npm --prefix web run test:browser` — 2/2 passed
- `node scripts/verify-nginx-configs.mjs` — static, SPA, PHP, Go, and reverse
  proxy configurations passed with and without TLS
- `docker build --pull ...` — produced the image ID recorded above
- `sh scripts/smoke-image.sh nginx-config-generator:review-final`
- `node scripts/smoke-proxy.mjs nginx-config-generator:review-final`
- `node scripts/smoke-cache.mjs nginx-config-generator:review-final`
- `node scripts/smoke-php.mjs nginx-config-generator:review-final`
- `node scripts/smoke-tls.mjs nginx-config-generator:review-final`
- `docker compose config`
- `docker compose --profile tls config`
- TLS-profile `docker compose up` with generated config and temporary
  certificate — `running`, `healthy`, UID 101, read-only root filesystem
- `git diff --check -- Dockerfile compose.yaml .github scripts lib tests web`

All temporary smoke and Compose containers, networks, certificates, and
directories were removed. A final Docker container/network inventory found no
matching fixture resources.
