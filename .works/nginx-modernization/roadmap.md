# Modernize the NGINX configuration toolkit — roadmap

Status: ready

| # | Child | Route | After | Conflicts | Covers | Status |
|---|---|---|---|---|---|---|
| 1 | `work/canonical-config/` — canonical renderer, profiles, generated examples, and learning documentation | bounded-change | — | — | 1, 2, 3, 4, 5, 10 | planned |
| 2 | `work/web-generator/` — Vue + Vite browser generator | bounded-change | 1: the locked renderer API contract below | — | 6 | planned |
| 3 | `work/container-verification/` — runtime image, Compose, CI/runtime verification, and release workflow | bounded-change | 1: generated default config; 2: production web build | — | 2, 7, 8, 9 | planned |
| 4 | `work/main-branch/` — rename local and remote default branch | quick-change | — | — | 11 | done |

## Shared contract and ownership
- Child 1's config owner owns `lib/`, including the canonical `lib/version.js` `NGINX_VERSION` export, `examples/`, the root `nginx.conf`, `mime.types`, existing configuration directories, `scripts/generate-examples.mjs`, `tests/config.test.mjs`, and generated inline comments.
- Child 1's documentation owner owns `README.md` and user-facing files under `docs/` except `docs/research-nginx.md` and `docs/research-proxy.md`. Research owners own those two evidence files; the documentation owner reconciles them into user guidance.
- Child 2 owns all of `web/`, including its package manifest, lockfile, source, and browser/unit tests. It imports `../lib/config.js`; it does not reproduce directive logic.
- Child 3 owns `Dockerfile`, `compose.yaml`, `.dockerignore`, `.github/workflows/`, integration scripts other than `scripts/generate-examples.mjs`, and tests other than `tests/config.test.mjs`. It consumes `lib/version.js`; any `.nginx-version` file is only a generated, drift-checked Docker input mirror and never a second source. It does not edit README content.
- Child 4 changes branch refs and provider settings only. It does not edit source files.
- `lib/config.js` is framework-free ESM and exports `PRESETS`, `DEFAULT_OPTIONS`, `SCHEMA_VERSION`, `validateOptions(input)`, and `generateConfig(input)`.
- `PRESETS` is an array of `{ id, label, description }` entries. `validateOptions` returns `{ valid, errors, options }`, where `errors` maps field names to plain messages and `options` is normalized or `null`. `generateConfig` returns one complete deterministic configuration and throws a validation error for invalid input.
- Accepted flat option keys are `profile`, `serverName`, `listenPort`, `httpsPort`, `documentRoot`, `upstream`, `tls`, `certificatePath`, `certificateKeyPath`, `gzip`, `assetCache`, `websocket`, `streaming`, `proxyCache`, `rateLimit`, and `hsts`. Profiles are `static`, `spa`, `php`, `go`, and `proxy`.
- Unknown keys, raw directives, schemes/paths in `upstream`, control characters, directive punctuation, invalid paths, and invalid port values are rejected. Deployment-sensitive choices including TLS, HSTS, proxy caching, WebSockets, streaming, and rate limiting are opt-in; `assetCache` defaults to false.

## Delivery order
1. Freeze the shared contract and stable NGINX version source (`lib/version.js`, owned by child 1).
2. Build child 1's renderer while child 2 builds against the contract and child 3 prepares independent container/CI structure.
3. Feed the generated default config and production web build into child 3, then run the complete integrated matrix.
4. Keep GHCR publishing configured but untriggered. Source remains uncommitted unless publication is separately requested.
