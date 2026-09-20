# Modernize the NGINX configuration toolkit

Status: ready
Type: feature
Route: initiative — this combines a configuration engine, browser application, container distribution, validation, documentation, and repository migration.
Next: decompose

## Request
Modernize this old optimized NGINX configuration repository for the latest stable free NGINX. Cover proven performance and security practices, concise teaching comments, static/SPA/PHP/Go/reverse-proxy use cases, a Vue + Vite browser generator, a ready-to-use Docker image, GHCR publishing, an approachable README, and rename `master` to `main`.

## Goal
Provide a maintained, verifiable toolkit that generates complete runnable NGINX configurations from safe choices. A user can learn from checked-in examples, generate and download a configuration in a browser, or run the generator from a published container.

## Target
- `nginx-config` — replace the dated single-purpose configuration collection with one canonical generator and generated profile examples.
- `web/` — Vue + Vite browser application for selecting supported options and exporting a complete configuration.
- `Dockerfile`, `compose.yaml`, `.github/workflows/` — local container use, integrated checks, and opt-in GHCR release publishing.
- Repository branch refs — migrate the default development branch from `master` to `main`.

## Acceptance criteria
- [ ] 1. One pure ESM renderer produces deterministic, complete `nginx.conf` output for static, SPA, PHP-FPM, Go, and generic reverse-proxy profiles; every checked-in example is generated from it.
- [ ] 2. Generated output targets the documented latest stable free NGINX release and uses only directives/modules available in the selected official free NGINX image.
- [ ] 3. Performance defaults are conservative and supported by official documentation or reproducible tests; comments explain when a user should tune workers, connections, timeouts, compression, buffering, caching, WebSockets, or streaming.
- [ ] 4. Security defaults cover safe TLS behavior, request limits, hidden-file protection, version hiding, headers that are broadly safe, and strict untrusted input validation without accepting raw directives.
- [ ] 5. Dynamic proxy caching, rate limiting, HSTS, WebSockets, streaming, TLS, compression, and asset caching are explicit choices; privacy-sensitive or deployment-sensitive behavior is off by default.
- [ ] 6. A responsive Vue + Vite application lets a user select a profile and supported options, see validation errors and generated output, copy it, and download one complete `nginx.conf` without a backend.
- [ ] 7. A ready-to-build container serves the generator over local HTTP with an optional mounted TLS configuration; Compose provides a straightforward local start.
- [ ] 8. CI validates the renderer, committed example freshness, web build/tests, NGINX syntax and representative runtime behavior against the pinned stable image, and container build.
- [ ] 9. A least-privilege GitHub Actions workflow publishes multi-architecture GHCR images only for `v*` tags or an explicit manual dispatch; PR and `main` runs build and test without publishing.
- [ ] 10. The README explains quick starts, the five profiles, each option and its tradeoff, container/GHCR use, validation, version maintenance, and limits in concise language.
- [ ] 11. The local and remote default branch are named `main`, with no remaining authoritative workflow or documentation references to `master`.

## Out of scope
- NGINX Plus features or third-party modules such as Brotli.
- A hosted deployment of the generator.
- Automatic publication during this implementation run.
- Arbitrary user-provided NGINX directives, snippets, or executable configuration text.
- Production-specific certificate issuance, origin trust policy, authentication, application CSP, or capacity targets.

## Assumptions
- “Latest” means the latest stable free NGINX release, tracked in one version source and updated through a documented maintenance step.
- The container image serves the built generator by default; generated configurations remain downloadable artifacts for a user's own deployment.
- Existing useful examples may be replaced or regenerated when the canonical renderer covers their behavior.
