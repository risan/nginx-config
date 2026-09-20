# Modernize the NGINX configuration toolkit — implementation plan

Status: ready
Inputs: `brief.md`, `roadmap.md`, `scout-nginx-config.md`, and child specs under `work/`

## Delivery contract
- Keep one pure ESM renderer in `lib/config.js`; generated examples, the Vue app, and runtime fixtures consume it.
- Keep each owner's paths disjoint as listed in `roadmap.md`. Coordinate contract changes through the roadmap before changing consumers.
- Treat 1.30.5 as the pinned stable free NGINX baseline for this delivery. `lib/version.js` exports the canonical `NGINX_VERSION`; re-check the official release/security pages before a tagged release.
- Do not publish a container during implementation. A `v*` tag or explicit manual workflow event is the only publishing trigger.

## 1. Canonical renderer and examples
Owner: config implementation agent

1. Write failing renderer tests for the public exports, five profiles, complete contexts, deterministic output, default option values, and generated fixture drift.
2. Add failure cases for unknown/inapplicable keys and injection through server name, filesystem paths, upstream, ports, and option types.
3. Implement normalization/validation and the smallest profile renderers that satisfy those tests.
4. Add focused cases for TLS/HTTP2, HSTS dependency, gzip, fingerprint-safe asset caching, rate limits, proxy cache privacy bypass, conditional WebSocket upgrade, streaming buffering, forwarding headers, PHP script handling, and SPA fallback.
5. Generate the root/default and five committed profile examples; migrate useful legacy snippets to generated equivalents or clearly label compatibility material.

Evidence: renderer tests fail before implementation, pass after it, and the check-mode generator detects a deliberately stale fixture.

## 2. Browser generator
Owner: Vue implementation agent

1. Write component tests against the locked shared exports for profile-specific fields, dependencies, invalid state, and exact preview/export payloads.
2. Build the accessible responsive form and output view without a second template or backend.
3. Test clipboard success/failure, download filename/content, keyboard use, and narrow viewport overflow.
4. Produce the Vite build and smoke it from static files with no external runtime requests.

Evidence: unit/interaction tests cover all five profiles; copied and downloaded bytes equal `generateConfig`; production build completes.

## 3. Container, runtime matrix, and automation
Owner: Docker/verification agent

1. Derive the Docker build version from `lib/version.js` and test it against the actual runtime `nginx -v` output and image reference. If the build needs `.nginx-version`, generate and drift-check it as a mirror.
2. Build the Vue assets in a pinned builder stage and serve them from the pinned official stable free NGINX base on an unprivileged local HTTP port.
3. Add Compose default HTTP use and an explicit read-only optional TLS mount path.
4. Build a disposable validation matrix: render every profile, create temporary certificates, run `nginx -t`, start representative upstream/FastCGI/static fixtures, and assert response/routing/header/compression/cache/privacy behavior.
5. Add PR/`main` CI for all tests and image build. Add a separate least-privilege publish job reachable only from `v*` tags or manual dispatch, producing multi-architecture GHCR tags and OCI metadata.

Evidence: exact version read-back, five-profile syntax results, representative runtime assertions, Compose/image health, workflow trigger/permission inspection, and container build.

## 4. Documentation and reconciliation
Owner: documentation agent

1. Replace the dated long README with short task-based paths: browser, Docker/Compose, generated examples, local validation, and manual installation.
2. Explain profile intent, every exposed option, safe defaults, measurement-dependent tuning, proxy trust, cache privacy, TLS/HSTS risks, and stock free NGINX limits.
3. Link current primary NGINX references and document the version update/regeneration/verification sequence.
4. Reconcile final filenames, ports, commands, and UI labels after the three implementations settle; do not copy directive logic into prose.

Evidence: every documented command/path exists and works in the integrated candidate; links and Markdown are checked.

## 5. Integrated acceptance
Owner: independent QA after all edits settle

1. Freeze one candidate SHA or working-tree digest and inspect the complete diff for ownership leaks, duplicate templates, stale `master` references, secrets, and unrequested publication.
2. Run renderer/example tests, web tests/build, all generated `nginx -t` cases, representative runtime checks, Compose/image smoke, workflow inspection, and `git diff --check` on that exact candidate.
3. Verify parent AC1–AC11 from evidence, including local/remote/default `main` read-back and the absence of an actual GHCR push.
4. Re-check the official stable download/news/security pages. If stable moved beyond 1.30.5, update the single version source and rerun all dependent evidence before handoff.
