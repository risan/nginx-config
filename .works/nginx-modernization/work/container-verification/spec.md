# Container distribution and integrated verification

Status: ready
Scout: ../../scout-nginx-config.md

## Goal
A local user can run the generator in a stock container, and CI provides reproducible evidence that configurations and images work before an explicitly triggered GHCR release.

## In scope
- Multi-stage production image, local Compose service, optional mounted TLS mode.
- Stable NGINX version source and update check/process.
- CI validation plus gated multi-architecture GHCR publication.
- Syntax and representative runtime checks over the profile/options matrix.

## Out of scope
- Live publication, deployment, certificate issuance, vulnerability-remediation SLAs, or load-test claims.

## Requirements
- R1 — Reproducible base: the runtime uses the one documented pinned official stable free NGINX 1.30.5 image/version and fails visibly when generated directives do not match it; the official download, news, and security pages are checked again at release time because “latest” changes.
- R2 — Ready image: a multi-stage build creates the Vue production assets and serves them over unprivileged local HTTP using the canonical generated default configuration, with a working health check and graceful signals.
- R3 — Local use: Compose builds/starts the same image, exposes a documented local port, persists no required state, and supports an explicit optional read-only TLS configuration/certificate mount path.
- R4 — CI separation: pull requests and `main` run generation-drift, unit/web/build, NGINX syntax/runtime, and container checks without registry write permission or publication steps.
- R5 — Controlled release: only a `v*` tag or `workflow_dispatch` may log in and push GHCR images; the workflow uses minimal job permissions, immutable revision tags plus useful version/latest policy, OCI labels, and multi-architecture output.
- R6 — Runtime evidence: all five standard fixtures pass `nginx -t` in the pinned image, including TLS fixtures with temporary certificates; representative services prove static delivery, SPA fallback, PHP/proxy wiring where feasible, forwarding/upgrade/streaming behavior, security headers, and caching/privacy rules.
- R7 — Maintenance: one concise documented procedure updates the stable NGINX version, regenerates examples, runs the same matrix, and records the primary release/security reference without silent floating upgrades.

## Interfaces and data
- `lib/version.js` is authoritative for `NGINX_VERSION`. Docker scripts extract it for build arguments and version assertions; any `.nginx-version` mirror is generated and checked for drift.
- Container listens on the documented unprivileged HTTP port by default.
- Image source is GHCR under the repository owner/name; release tags derive from Git refs rather than user input.
- TLS mode uses explicit read-only mounted paths matching generated certificate options; it is not silently enabled.

## Edge cases and failures
- Missing/invalid optional TLS files → NGINX startup fails clearly; default HTTP mode remains independent.
- A pull request from a fork → validation runs without secrets and cannot publish.
- A `main` push → full test/build runs but no GHCR login or push occurs.
- Non-`v*` tag → no publish job.
- Generated syntax or runtime mismatch → image publication is blocked.
- Unsupported architecture → build fails rather than publishing a partial tag set.

## Must not change
- Image content uses child 1's generated config and child 2's production build, with no duplicated templates — parent roadmap.

## Acceptance criteria
- [ ] AC1 [R1, R6] — CI/local scripts run `nginx -t` for the full fixture matrix in the pinned image and exercise HTTP behavior with temporary upstreams/certificates.
- [ ] AC2 [R2, R3] — image and Compose smoke tests reach the generator and health endpoint on the documented port; optional TLS mount behavior is validated separately.
- [ ] AC3 [R4] — workflow inspection/test proves PR and `main` paths have read-only permissions and no registry login/push step.
- [ ] AC4 [R5] — dry workflow inspection proves only `v*`/manual events can reach authenticated multi-architecture publish, with revision/version tags and OCI metadata.
- [ ] AC5 [R7] — the documented update procedure identifies the single version source and complete verification command set.
