# Final validation receipt

Status: **PASS — frozen candidate validated**

Captured: 2026-09-20 (Asia/Jakarta). This receipt replaces the historical
baseline receipt and is bound to the frozen uncommitted candidate. No source
file was changed during this validation lane.

## Candidate identity

- Branch: `main`
- Local HEAD: `9a2acdc327f6c2cea42540653768043b4cde99c6`
- Upstream at start: `origin/main` at the same SHA
- Stable free NGINX: `1.30.5`
- Product source manifest before and after validation: **66 files**
- Product source manifest fingerprint before and after validation:
  `sha256:9bba2faac194b22bc83d98ae6caddaf2c569ab51105a31ec533bfaf880775d45`
- Manifest scope: sorted path/content SHA-256 lines for non-ignored tracked or
  untracked product files, excluding `.works/`, `.git/`, and ignored dependency,
  build, browser-report, and test-result artifacts. The receipt is therefore
  excluded from both fingerprints.
- Fresh image tag: `nginx-config-generator:validation-final`
- Fresh image ID:
  `sha256:92581a03f7a8a512c9f5eb68661bdf89c4f25573005eb057b476c82e522efedd`
- Image labels: revision `9a2acdc327f6c2cea42540653768043b4cde99c6`, version
  `validation-final`, source `https://github.com/risan/nginx-config`
- Runtime base: `nginx:1.30.5-alpine@sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c`
- Builder base: `node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`
- Local Docker: 29.5.0; Compose: v5.1.3; Node: v24.12.0; npm: 11.18.0

## Checks passed

### Dependencies, renderer, and web application

- `NPM_CONFIG_CACHE=$(mktemp -d /tmp/nginx-config-validation-npm.XXXXXX) npm --prefix web ci --cache "$NPM_CONFIG_CACHE"` — completed; npm reported `found 0 vulnerabilities`.
- `node scripts/check-nginx-version.mjs` — `NGINX_VERSION=1.30.5`.
- `node --test tests/config.test.mjs` — 14/14 passed.
- `node scripts/generate-examples.mjs --check` — 12 generated files current.
- `npm --prefix web audit --audit-level=moderate` — zero vulnerabilities.
- `npm --prefix web run test:unit` — Vitest 5.0.1, 2 files and 11/11 tests passed.
- `npm --prefix web run build` — Vite 7.3.6 production build passed.
- Chromium was installed under `/tmp/nginx-config-playwright-browsers` from the
  pinned Playwright package; with an explicit Vite server,
  `PLAYWRIGHT_BROWSERS_PATH=/tmp/nginx-config-playwright-browsers npm --prefix web run test:browser`
  — 2/2 Chromium tests passed.

### NGINX syntax and workflow validation

- `node scripts/verify-nginx-configs.mjs` — all ten checks passed in the exact
  pinned NGINX 1.30.5 image: static, SPA, PHP-FPM, Go, and reverse-proxy
  profiles, each with and without TLS.
- Official `actionlint` v1.7.7 release was downloaded to `/tmp` and its archive
  SHA-256 `023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757`
  was verified against the release checksums. `actionlint .github/workflows/*.yml`
  returned no diagnostics.
- `sh -n scripts/*.sh` — all shell scripts passed syntax validation.
- `git diff --check` — passed.
- The workflow action references are pinned to full commit SHAs; Compose YAML
  parsing is recorded below.

### Fresh image and runtime matrix

- A fresh `docker build --pull --no-cache` with the pinned Node and NGINX
  digests passed after setting task-scoped `DOCKER_CONFIG=/tmp/nginx-config-validation-docker-config`.
  The first attempt only exposed the environment's read-only default Docker
  Buildx activity directory and did not alter source or containers.
- Image inspection confirmed `USER 101:101`, the 1.30.5 runtime, the expected
  health check, and the revision/version labels.
- `DOCKER_CONFIG=/tmp/nginx-config-validation-docker-config sh scripts/smoke-image.sh nginx-config-generator:validation-final`
  — health, SPA fallback, assets, missing assets, sensitive paths, gzip,
  version, non-root, read-only startup, and readiness passed:
  `gzip=3863/11101 bytes health=healthy`.
- `node scripts/smoke-proxy.mjs nginx-config-generator:validation-final` —
  forwarding identity normalization passed.
- `node scripts/smoke-cache.mjs nginx-config-generator:validation-final` —
  public cache and authorization/cookie/Set-Cookie/no-store/method guards passed.
- `node scripts/smoke-php.mjs nginx-config-generator:validation-final` —
  PHP-FPM execution and missing-script denial passed.
- `node scripts/smoke-tls.mjs nginx-config-generator:validation-final` — TLS
  certificate and redirect, scoped HSTS, real HTTP/2 ALPN/204 exchange, TLS
  1.2 and 1.3 session resumption, early-data rejection, and unknown-SNI
  rejection passed.

### Compose startup and health

- `docker compose -f compose.yaml config` — passed.
- `docker compose --profile tls -f compose.yaml config` — passed.
- A unique Compose project started the default service with an ephemeral host
  port; `/healthz` returned HTTP 204 and the container reached `healthy`.
- The same unique project started the TLS profile with a generated
  `example.com` certificate/configuration and ephemeral host port; HTTPS
  `/healthz` returned HTTP 204 with SNI/Host resolution and the container
  reached `healthy`.

## Cleanup and limits

- The unique Compose containers/network, smoke containers/networks, temporary
  TLS files, and temporary Compose files were removed. The pre-existing
  `nginx-config-ci-2` container was observed and left untouched. The fresh
  image remains locally so its recorded ID can be inspected by the release
  operator.
- npm emitted an environment warning because this runner has Node 24.12.0 while
  two transitive packages request Node 24.15+; all checks passed on the
  available Node 24 runtime. CI's `node-version: 24` remains the authoritative
  hosted-runner environment.
- Local validation proves the candidate image and runtime behavior only. It does
  not prove GitHub-hosted CI, GHCR multi-architecture publication, registry
  digest resolution, package visibility, provenance/SBOM attestations, or
  post-merge release aliases. Those remain release-workflow gates.
- No commit, push, pull request, merge, tag, registry login, or GHCR
  publication was performed by this lane.

The independent final performance/security audit and documentation/publication
audit are both PASS for this same frozen candidate fingerprint. This receipt is
the final local validation gate; the release operator may now stage the
immutable source and continue with the separately authorized publication flow.
