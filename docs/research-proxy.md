# Reverse proxy, workload, container, and generator research

Research checked on **2026-09-20**. Sources are upstream NGINX, Docker, and
GitHub documentation. This note separates documented behavior from choices
that still need a workload test; there is no universally fastest buffer,
timeout, cache size, or connection count.

## Current baseline

- The current free stable release is **NGINX 1.30.5**; mainline is 1.31.6.
  The stable release fixes CVE-2026-90439, while older 1.30 releases do not.
  Sources: [NGINX downloads](https://nginx.org/en/download.html) and
  [NGINX security advisories](https://nginx.org/en/security_advisories.html).
- Stable 1.30 inherited a material 1.29.7 change: proxying now defaults to
  HTTP/1.1 and upstream keepalive is enabled by default. The default keepalive
  cache is 32 idle connections **per worker**. It is not a cap on total open
  upstream connections. Sources: [release news](https://nginx.org/news.html),
  [`proxy_http_version`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_http_version),
  and [`keepalive`](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive).
- Therefore, old snippets that present `proxy_http_version 1.1`,
  `proxy_set_header Connection ""`, and `keepalive 32` as performance tuning
  are stale for 1.30. They may remain explicit for readability or compatibility,
  but should not be described as an optimization on the current stable line.
- This repository uses the Docker Official Image tag `nginx:1.30.5-alpine`,
  pinned to its reviewed multi-platform digest
  `sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c`
  when checked via the [Docker Hub tag API](https://hub.docker.com/v2/repositories/library/nginx/tags/1.30.5-alpine).
  The Docker Official Image already ships UID 101; the Dockerfile uses
  `USER 101:101`, port 8080, and `/tmp` paths after copying the generated UI
  config. This is a deliberate image choice, not the separate nginxinc
  unprivileged image, so their runtime paths and entrypoint rules must not be
  mixed.

## Reverse proxy rules

### Connections and headers

- Let NGINX 1.30 use its HTTP/1.1 and keepalive defaults. Expose keepalive as an
  advanced option only. A larger idle cache consumes backend capacity and must
  be sized from worker count, backend limits, and observed reuse.
- Pass `Host $host`; `$host` has a safe fallback when the request has no Host,
  unlike `$http_host`. Pass `X-Forwarded-Proto $scheme` and, when useful,
  `X-Forwarded-Host $host`. Source: [`proxy_set_header`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header).
- At an internet-facing edge, overwrite identity headers:
  `X-Real-IP $remote_addr` and `X-Forwarded-For $remote_addr`. Do not append an
  attacker-provided chain. `$proxy_add_x_forwarded_for` explicitly appends to
  the client-supplied value.
- When NGINX is behind a load balancer, trust only its exact address/CIDR with
  `set_real_ip_from`, then select the known header with `real_ip_header` and use
  `real_ip_recursive on` for a trusted proxy chain. Never use `0.0.0.0/0` or
  `::/0`. After normalization, pass the resulting `$remote_addr` downstream.
  Source: [`ngx_http_realip_module`](https://nginx.org/en/docs/http/ngx_http_realip_module.html).
- For an HTTPS upstream, enable SNI and certificate verification explicitly:
  `proxy_ssl_server_name on`, `proxy_ssl_verify on`, and a trusted CA file.
  Verification is off by default. Source: [upstream TLS directives](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ssl_verify).

### Buffering, streams, timeouts, and retries

- Keep response buffering on for normal HTTP. NGINX reads the backend quickly
  and can shield it from slow clients. Do not guess larger buffers without
  measuring response headers, memory, and temporary-file writes. Source:
  [`proxy_buffering`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering).
- Disable response buffering only on streaming locations such as SSE. Keep
  caching off there. The app should send periodic heartbeat data before
  `proxy_read_timeout` expires; that timeout measures the gap between reads,
  not total response time.
- WebSocket locations must pass `Upgrade` and a mapped `Connection` value.
  NGINX closes an idle tunnel after the read timeout unless the backend sends
  ping frames or the timeout is raised. Use the upstream
  [WebSocket pattern](https://nginx.org/en/docs/http/websocket.html).
- `proxy_connect_timeout`, `proxy_send_timeout`, and `proxy_read_timeout` are
  workload limits, not speed switches. The send/read limits are gaps between
  operations, not whole-request deadlines. Keep them visible and documented;
  raise the read timeout only for known long-polling or streaming endpoints.
- The default retry cases are `error timeout`. If a multi-server preset adds
  status retries, bound them with `proxy_next_upstream_tries` and
  `proxy_next_upstream_timeout`. Never add `non_idempotent`: NGINX normally
  avoids retrying POST/PATCH after sending the request, which prevents duplicate
  side effects. Source: [`proxy_next_upstream`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream).
- Request buffering is on by default. That isolates the backend from a slow
  upload and preserves retry options. Offer `proxy_request_buffering off` only
  for deliberate streaming uploads; after NGINX starts forwarding a body it
  cannot retry that request. Set `client_max_body_size` to the application's
  actual limit rather than `0`; the default is 1 MiB. Sources:
  [`proxy_request_buffering`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering)
  and [`client_max_body_size`](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size).

### Proxy cache is opt-in

- `proxy_cache` is off by default. Generate cache configuration only for a
  location the user marks public and safe to share. Never enable it globally
  for an authenticated application.
- Keep only GET/HEAD cacheable. Include `$scheme`, `$host`, and `$request_uri`
  in the key when one cache zone can serve multiple hosts. Bypass and refuse to
  store requests with `Authorization` or the application's session cookie.
- Keep NGINX's handling of `Cache-Control`, `Set-Cookie`, and `Vary`; do not
  add `proxy_ignore_headers` for them. A response with `Set-Cookie` is not
  cached by default, and `Vary` is represented in the cached variant. Source:
  [proxy cache response rules](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache_valid).
- `proxy_cache_lock on` can stop many simultaneous misses from hitting the
  backend. `proxy_cache_revalidate on`, background update, and stale-on-error
  can help a truly public cache, but stale content is a product decision. The
  cache path needs `max_size` and `inactive` bounds and should share a
  filesystem with its temporary path to avoid copies. Sources:
  [`proxy_cache_lock`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache_lock)
  and [`proxy_cache_path`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache_path).

## Workload presets

### Static files and SPA

- Use `try_files $uri =404` for a static site. For an SPA use
  `try_files $uri $uri/ /index.html`, but keep `/assets/` separate with
  `try_files $uri =404` so a missing JavaScript file does not return HTML.
  Source: [`try_files`](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files).
- `sendfile on` is a sensible Linux static-file default. `open_file_cache` can
  reduce repeated file metadata work on a hot, stable tree, but it is off by
  default and negative caching can hide newly deployed files until revalidation.
  Make it an explained option. Sources: [`sendfile`](https://nginx.org/en/docs/http/ngx_http_core_module.html#sendfile)
  and [`open_file_cache`](https://nginx.org/en/docs/http/ngx_http_core_module.html#open_file_cache).
- Give content-hashed assets a long `public, max-age=31536000, immutable`
  policy. Keep `index.html` at `no-cache` so deployments are discovered.
  Precompressed `.gz` assets can be served with `gzip_static`, but the module
  is not built by default, so generated config must first verify the target
  image includes it. Source: [`gzip_static`](https://nginx.org/en/docs/http/ngx_http_gzip_static_module.html).

### Go HTTP service

- A Go service uses the normal reverse-proxy preset; it needs no special NGINX
  module. Default to a single upstream, safe normalized forwarding headers,
  regular buffering, and explicit application timeouts. WebSocket/SSE/upload
  behavior must be selected per route rather than applied to the whole service.

### PHP-FPM

- Route ordinary requests through a front controller only after trying a real
  static file. In the PHP location, use `try_files $uri =404` before
  `fastcgi_pass` so a nonexistent script is never handed to PHP-FPM. Pass
  `SCRIPT_FILENAME $document_root$fastcgi_script_name` through the standard
  FastCGI parameters. NGINX documents that `try_files` performs this existence
  check: [core module PHP example](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files).
- Do not enable PATH_INFO parsing by default. Add it only for frameworks that
  require it and test the split expression.
- FastCGI connection reuse requires both an upstream `keepalive` cache and
  `fastcgi_keep_conn on`; it is not automatically enabled by the proxy HTTP/1.1
  change. Source: [FastCGI keepalive](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive).

## Safe generator architecture

- Build a client-only Vue + Vite application. Store choices in one typed model
  and render config with pure functions. The same model should drive the form,
  preview, download, examples, and tests so snippets cannot drift.
- Offer bounded presets: static, SPA, Go/reverse proxy, PHP-FPM, WebSocket
  upgrades, response streaming for SSE or long-lived output, public proxy cache,
  and TLS. Keep request buffering enabled in the response-streaming option.
  Trusted-load-balancer source normalization and upload streaming are manual,
  deployment- or route-specific opt-ins because they change trust and retry
  behavior. Put risky or workload-dependent switches behind an “advanced”
  explanation.
- Never accept raw directives. Validate each field as the NGINX token it
  represents: host/IP, port, CIDR, server name, size, or duration. Reject
  newlines, semicolons, braces, comments, control characters, and unexpected
  whitespace. Fixed paths are safer than free-form paths. Vue's HTML escaping
  protects the page; token validation separately protects the generated config.
- Generate deterministic output and comments. No timestamp in the config.
  Download with an in-browser `Blob`; no backend, account, analytics, or secret
  is needed. The generated text is never executed by the web app.
- Compile the UI in a Node build stage, then copy only `dist/` into the NGINX
  runtime. The runtime image should contain no Node toolchain or source tree.

## Runtime image

- This repository deliberately uses the Docker Official stable image pinned by
  version and digest. Its shipped UID 101 is selected with `USER 101:101`; the
  generated runtime listens on 8080, puts its PID in `/tmp`, and uses `/tmp`
  for temporary paths. Keep those paths and permissions with this image rather
  than mixing instructions from a different unprivileged image.
- Add a local `/healthz` location returning 204 and a Docker `HEALTHCHECK` that
  makes an HTTP request to it. A process-only check such as `nginx -t` does not
  prove the server accepts requests. Docker defines health checks as a runtime
  liveness test: [Dockerfile `HEALTHCHECK`](https://docs.docker.com/reference/dockerfile/#healthcheck).
- Provide a Compose example with a read-only root filesystem, `tmpfs` for
  `/tmp`, `cap_drop: [ALL]`, and `security_opt: [no-new-privileges:true]`.
  These settings are native Compose controls: [Compose service reference](https://docs.docker.com/reference/compose-file/services/).
  If public proxy caching is enabled, use a separately bounded writable volume
  or tmpfs and document that tmpfs counts toward the container memory limit.
- Bind only the published port, mount custom config read-only, log to stdout and
  stderr, and run as the image's numeric non-root user. Do not install shells or
  debugging tools solely for the health check.

## GHCR publishing

- Publish `ghcr.io/risan/nginx-config` from GitHub Actions with the
  repository `GITHUB_TOKEN`; grant the job only `contents: read` and
  `packages: write`. GitHub documents this exact flow:
  [publishing Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).
- Pin third-party actions to full commit SHAs. GitHub states that tags can move
  and full SHAs fix the exact reviewed code. Source:
  [GitHub Actions threat protection](https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats#pin-third-party-actions-to-commit-shas).
- On pull requests and `main` pushes, build and test without logging in or
  pushing. Publish only from trusted exact stable `vMAJOR.MINOR.PATCH` tags or
  an explicit `workflow_dispatch`. Use a traceable commit-SHA tag for every
  image and semantic-version tags for releases; tags can move, so only a digest
  is immutable. Move `latest` only for a deliberate stable release.
- Add `org.opencontainers.image.source` and standard revision/version labels.
  Publishing with `GITHUB_TOKEN` links the package to the repository. New GHCR
  packages default to private; the owner must explicitly make the package
  public. Consumers that require repeatability should pull by digest. Source:
  [GitHub Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
- Pin the Docker base image by digest for a reproducible release, then use an
  update bot or scheduled PR to refresh that digest and rerun the complete image
  tests. A floating stable tag silently changes the build; a never-updated digest
  silently misses security rebuilds.

## Acceptance checks

1. Every generated preset and checked-in example passes `nginx -t` inside the
   pinned free stable 1.30.5 image.
2. Generator snapshots cover every option alone and the supported combinations;
   hostile values containing newline, semicolon, brace, comment, or whitespace
   are rejected before rendering.
3. An echo backend proves a forged incoming `X-Forwarded-For`, `X-Real-IP`,
   `Forwarded`, and `X-Forwarded-Proto` cannot override the edge identity.
   When trusted-load-balancer normalization is added manually, a separate test
   proves only an allowlisted hop changes `$remote_addr`.
4. Cache tests prove authorized/session requests bypass the cache, `Set-Cookie`
   responses are not stored, different Host values cannot share an object, and
   only GET/HEAD populate the public cache.
5. An SSE test receives the first event promptly and keeps the connection alive
   with heartbeat data. A WebSocket test completes a 101 upgrade and echo.
6. Upload tests cover just below and above `client_max_body_size`. The
   response-streaming option keeps `proxy_request_buffering on` while disabling
   response buffering. A separately reviewed upload-streaming location, when
   used, must prove that the backend receives data before the full body arrives;
   the normal location buffers it.
7. Retry tests fail the first backend and succeed on the second for an idempotent
   request, then prove a sent POST is not duplicated.
8. Static/SPA tests prove a real asset is served, a missing asset returns 404,
   an application route falls back to `index.html`, hashed assets are immutable,
   and `index.html` is revalidated.
9. PHP tests prove only an existing `.php` file reaches PHP-FPM. Go tests prove
   host, scheme, and normalized client address. HTTPS-upstream tests fail an
   untrusted certificate.
10. The built container runs as non-root, starts with a read-only root and only
    `/tmp` writable, has no Linux capabilities, becomes healthy through HTTP,
    and serves the Vite app on 8080.
11. Pull-request CI builds without registry credentials. A trusted branch/tag
    dry run produces the expected OCI labels and tags; the publish job uses only
    `GITHUB_TOKEN`, pushes GHCR successfully when triggered, and emits an
    attestation tied to the pushed digest.
