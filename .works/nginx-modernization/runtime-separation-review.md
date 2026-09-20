# Independent runtime and generator separation review

Status: **PASS**

The runtime/generator boundary is implemented and the runtime behavior is
covered by fresh checks plus the worker's frozen receipts. The final Compose
profile example supplies `NGINX_SERVER_NAME=example.com` for
`sites-example/proxy.conf`, and the generic README/operations snippets state
that the variable must match the mounted configuration's `server_name`.

## Passed checks and evidence

- `Dockerfile` is an NGINX-only runtime stage. It copies only
  `docker/nginx.conf` and `docker/default/`, runs as `101:101`, exposes 8080,
  and has an HTTP `/healthz` health check. There is no Node/Vue build stage.
- The built `nginx-config:ci` image inspection reported user `101:101` and the
  expected health check. An ephemeral image check found no `node` executable or
  JavaScript/Vue files in the packaged site. `scripts/smoke-image.sh` passed
  its default page, mounted content/config hash, read-only root, health, gzip,
  and unknown-Host checks.
- `node scripts/check-nginx-version.mjs` passed with `NGINX_VERSION=1.30.5`.
  `node scripts/generate-examples.mjs --check` passed for all 13 generated
  files, including the canonical `docker/nginx.conf`.
- `docker compose -f compose.yaml config` and the `tls` profile config both
  passed. The profile comment now passes
  `NGINX_SERVER_NAME=example.com` for `sites-example/proxy.conf`, whose
  generated server name is verified as `example.com`; the worker's final custom
  Compose probe passed with
  `NGINX_CONFIG=./sites-example/proxy.conf`,
  `NGINX_CONTENT=./docker/default`, and `NGINX_SERVER_NAME=example.com`.
- The fresh Go/default shared-network smoke passed through
  `node scripts/smoke-proxy.mjs nginx-config:ci`. The worker receipt also
  records passing proxy, cache, PHP, TLS, and full image runtime smokes.
- The web unit suite passed 11/11 tests and the Vite build passed. With a
  task-local Wrangler config directory, `workers:dev` served the built root
  and JavaScript asset with the checked-in CSP, referrer, and nosniff headers.
  The worker receipt records browser 2/2, dry-run, dependency audit, and local
  asset checks passing. The first local Wrangler attempt failed only because
  this managed environment's `/home/risan/.config/.wrangler` is read-only.
- The current docs consistently separate the client-only Workers generator
  from the NGINX runtime, document the generic Dashboard settings without an
  account ID or deployment URL, and identify the runtime release as v3.0.0.
  `git diff --check` passed.

No Git refs, remote state, source files, or deployment state were changed by
this review. Only this review report was added.
