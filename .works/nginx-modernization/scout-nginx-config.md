# Repository scout: nginx-config

Scouted 2026-09-20 from `/home/risan/projects/code/nginx-config`. The checkout was clean at the start of the scout; no implementation or branch mutation was performed.

## Guidance and repository shape

- No `AGENTS.md` was found in `/home/risan`, `/home/risan/projects`, `/home/risan/projects/code`, or this repository. The repository-local `.agents/` and `.codex/` directories contain no additional instruction files.
- This is a small, pure configuration repository with no package manifest, application source, test suite, CI workflow, Dockerfile, Compose file, generator, or lockfile.
- Tracked paths are the root [README.md](../../README.md), [nginx.conf](../../nginx.conf), [mime.types](../../mime.types), seven examples under `sites-example/`, five directive snippets plus two location snippets under `snippets/`, and `.gitignore` placeholders under `conf.d/`, `logs/`, `sites-available/`, `sites-enabled/`, and `ssl/`.
- The current HEAD is the 2017 commit `9a2acdc` (`:sparkles: Remove HSTS comment and increate keep-alive timeout on SSL connection.`). `git status --short --branch` reported `## master...origin/master` with no changes.

## Git and runtime evidence

- Local branch: `master`; tracking `origin/master`. Remote is `git@github.com:risan/nginx-config.git`.
- Remote refs currently expose `master`, `dev`, and `HEAD -> master`; there is no remote `main`. A separate branch operation is therefore needed for the requested `master` -> `main` rename and remote default-branch update.
- Docker is available: Docker 29.5.0, daemon Ubuntu 24.04.4 LTS, x86_64. Docker Compose is available as Compose v5.1.3 (`docker-compose` resolves to a Docker Desktop Windows path). No nginx image was present locally in the inspected image list.
- Host `nginx` is not installed, so native `nginx -t` cannot run. The intended validation seam is a pinned official free OSS image, for example `nginx:1.30.5-alpine`, with a temporary mounted config and `nginx -t`.
- Node 24.12.0, npm 11.18.0, Yarn 1.22.22, and `gh` 2.100.0 are available. `pnpm` is a Corepack shim but its first invocation failed with `EROFS` while trying to create `/home/risan/.cache/node/corepack/...`; a project-specific writable cache under `/tmp` can be used if pnpm is selected. There is no existing frontend toolchain.
- No evidence of an abandoned background process relevant to this repo was found; the working tree remained clean.

## Current configuration and modernization findings

The implementation should preserve this repository's useful copy-and-customize model while splitting portable defaults from opt-in, workload-specific tuning. Directives below are observations from the current files, with exact locations for the next author.

### Root and HTTP defaults

- [nginx.conf](../../nginx.conf):3 hard-codes `www-data`; this is Debian-friendly but not portable to the official Alpine image (`nginx` user) or arbitrary installations. The Docker image should use its own safe default, while host examples should clearly say to match the installed worker user.
- [nginx.conf](../../nginx.conf):16 and :25 set `worker_rlimit_nofile 8192` and `worker_connections 8000` without checking the service's actual `RLIMIT_NOFILE` or the fact that proxied connections consume descriptors too. Keep `worker_processes auto`; document that connection and file limits must be measured and raised together rather than claiming a universal maximum.
- [nginx.conf](../../nginx.conf):32-38 hard-code hash sizes. These are valid tuning knobs, but they should be documented as error-driven adjustments after `nginx -t`, not generic performance magic.
- [nginx.conf](../../nginx.conf):43-54 enables `sendfile`, `tcp_nopush`, and `tcp_nodelay`. They are reasonable Linux defaults for file delivery, but comments should say they are workload/platform dependent; `tcp_nopush` only matters with `sendfile`.
- [nginx.conf](../../nginx.conf):59 uses a 20-second client keep-alive, while [snippets/directive/ssl.conf](../../snippets/directive/ssl.conf):41 raises it to 120 seconds. The latter can retain idle sockets and is not a general SSL optimization. Choose a measured, consistent default and explain when to increase it.
- [nginx.conf](../../nginx.conf):65-74 has a typo in the comment and enables `charset` globally through `charset_types`; charset behavior should be explicit for text responses, especially when proxying or serving pre-compressed/binary assets.
- [nginx.conf](../../nginx.conf):76-79 logs the full request and forwarded-for header but has no documented trust boundary. `$http_x_forwarded_for` is client-controlled unless a trusted proxy is configured. Logs should include a clear proxy trust note and use container stdout/stderr in the Docker variant.
- [nginx.conf](../../nginx.conf):84-129 enables gzip globally. `gzip_comp_level 5` and a small minimum are reasonable starting points, but the comment's universal “75% reduction” claim is not evidence-backed. `gzip_proxied any` can recompress responses where the upstream already sent cache/private/auth semantics; use an intentional allowlist or explain the trade-off. Avoid listing already-compressed formats and expose precompressed/Brotli options only when the installed module/assets support them.
- `include conf.d/*.conf` and `include sites-enabled/*` at [nginx.conf](../../nginx.conf):131-135 provide clear extension points. A generator should emit a complete isolated file or a documented site file and must not silently replace a user's enabled directory.
- The current root has no request-size, header/body/read/send timeout, rate/connection limiting, open-file cache, cache zone, status/health endpoint, or observability guidance. These are important security/performance choices but many are app-specific; expose conservative opt-ins with warnings rather than a single universal value.

### TLS and security

- [snippets/directive/ssl.conf](../../snippets/directive/ssl.conf):2 enables only `TLSv1.2`; it omits TLS 1.3. The updated baseline should support `TLSv1.2 TLSv1.3` when the linked OpenSSL supports it and should state how to check the build.
- [ssl.conf](../../snippets/directive/ssl.conf):6-10 includes legacy TLS 1.2 CBC suites and comments refer to an old Mozilla wiki URL. Use a current Mozilla-compatible profile or a clearly labeled compatibility profile, and explain that TLS 1.3 cipher selection is separate. Do not imply that `ssl_prefer_server_ciphers` controls TLS 1.3.
- [ssl.conf](../../snippets/directive/ssl.conf):13-16 forces `secp384r1` and requires `ssl/dhparam.pem` even though the listed ciphers are ECDHE and do not require custom finite-field DH parameters. The repository intentionally does not track that file (`ssl/.gitignore`), so SSL examples fail unless the user generates it. Remove the unnecessary hard requirement or make DHE/dhparam a separately documented compatibility option; keep modern curve support compatible with the installed OpenSSL.
- [ssl.conf](../../snippets/directive/ssl.conf):29-36 enables OCSP stapling and hard-codes public DNS resolvers. Stapling requires a usable issuer chain, resolver reachability, and certificate status support; it should be opt-in/validated and should not prescribe Google/Dyn resolvers to every network. The `ssl_trusted_certificate` paths in all `*-ssl.conf` examples also require user-provided files.
- [ssl.conf](../../snippets/directive/ssl.conf):22-26 disables session tickets, which is a safe default when ticket-key rotation is not managed, but the comment should avoid claiming Nginx cannot rotate keys in every deployment. Session cache and timeout should be explained as handshake-saving knobs.
- `server_tokens off` at [nginx.conf](../../nginx.conf):30 is useful disclosure reduction but is not a patching strategy. The README should require package updates and config testing.
- There are no response security headers. A shared baseline can safely add `X-Content-Type-Options`, `Referrer-Policy`, and an intentionally scoped `Permissions-Policy`; HSTS, CSP, framing policy, and cross-origin policies need explicit opt-in because they can break an application. HSTS must only be emitted after HTTPS is confirmed.
- [sites-example/no-default.conf](../../sites-example/no-default.conf):5-6 uses `deferred`, which is Linux-specific and unnecessary for a portable sample. It should use a clear default server and document that `return 444` is Nginx-specific behavior; a normal 400/404 alternative may be preferable for portability and observability.
- [snippets/location/protect-sensitive-files.conf](../../snippets/location/protect-sensitive-files.conf):2-10 protects dotfiles and a limited extension list, but the scope and status should be deliberate. It currently allows `.well-known` broadly and does not explain that ACME files are the intended exception. Add a precise policy for secrets/configs and avoid relying on an extension denylist as the only protection.

### Static examples and cache behavior

- [snippets/location/cache-control.conf](../../snippets/location/cache-control.conf):3 has a duplicated `html` alternative (`html|html`). More importantly, it sends public caching for HTML and one-week caching for all CSS/JS, which can cause stale deploys and can cache dynamic content. Prefer immutable, long-lived caching only for fingerprinted assets, short/no caching for HTML/API data, and use `add_header ... always` where status coverage is intended.
- The README already warns that `add_header` inheritance is replaced by a more specific location ([README.md](../../README.md):263-276), so any new shared headers/cache snippets must account for this exact Nginx behavior.
- Static samples [sites-example/site.conf](../../sites-example/site.conf) and [site-ssl.conf](../../sites-example/site-ssl.conf) use `try_files $uri $uri/ =404`; a separate SPA sample needs `/index.html` fallback, while conventional static sites should retain 404 behavior.
- The MIME file is hand-maintained ([mime.types](../../mime.types)) and includes old/rare types plus a typo-like `safariextz` token under `application/octet-stream`. Replacing it wholesale with the current upstream MIME list or documenting the intentional minimal list is safer than adding ad-hoc types in a generator.

### PHP/FastCGI

- [sites-example/php.conf](../../sites-example/php.conf):40 and [php-ssl.conf](../../sites-example/php-ssl.conf):63 hard-code the obsolete-looking `/run/php/php7.1-fpm.sock`. Make the PHP-FPM socket/address an obvious placeholder or variable and document Debian/Alpine/container alternatives.
- The PHP location regex at [php.conf](../../sites-example/php.conf):36 and [php-ssl.conf](../../sites-example/php-ssl.conf):59 ends at `.php`, so the `fastcgi_split_path_info` support in [snippets/directive/fastcgi-php.conf](../../snippets/directive/fastcgi-php.conf):3 is not reached for `/script.php/path`. Either explicitly disallow PATH_INFO and simplify the snippet, or intentionally support it with a matching location and safe script existence check.
- [snippets/directive/fastcgi.conf](../../snippets/directive/fastcgi.conf):1 builds `SCRIPT_FILENAME` from `$document_root`; the updated sample should explain symlink/deployment implications and consider `$realpath_root` where appropriate. It should also inherit the distribution's maintained `fastcgi_params` where possible and explicitly clear untrusted `HTTP_PROXY` input to avoid the HTTPoxy class of issues.
- No upload/body limit, buffering/read timeout, or PHP-specific cache/session guidance exists. These must be opt-in and sized for the application; do not advertise arbitrary “maximum performance” values.

### Reverse proxy and WebSocket

- [sites-example/proxy.conf](../../sites-example/proxy.conf):3 and [proxy-ssl.conf](../../sites-example/proxy-ssl.conf):3 define `upstream backend { server localhost:3000; }`. `localhost` can resolve to the wrong address in a container and is not a useful multi-instance/load-balancing example; use an explicit service/address placeholder and show multiple upstream members only where appropriate.
- [snippets/directive/proxy.conf](../../snippets/directive/proxy.conf):1 forwards `$http_host`, which preserves arbitrary client-supplied port text. `$host` is the safer normal Host value. The forwarded headers need a documented trusted-proxy model; do not blindly trust incoming `X-Forwarded-*` when Nginx is internet-facing.
- [snippets/directive/proxy.conf](../../snippets/directive/proxy.conf):1-4 lacks explicit HTTP/1.1, upstream keep-alive, timeouts, buffering, body-size, and retry policy. Nginx 1.29.7+ changed the default proxy HTTP version to 1.1 with keep-alive, but explicit settings keep samples understandable and compatible with older packaged versions.
- [snippets/directive/websocket-proxy.conf](../../snippets/directive/websocket-proxy.conf):1-4 always sends `Connection: upgrade` and has a cache-bypass variable without a cache configuration. Use a `map` to send `upgrade` only when the client asks for it, keep this include only on WebSocket locations, and document the longer read timeout needed for long-lived connections.
- HTTPS upstreams need SNI/CA verification choices; the current examples only proxy to plaintext localhost and do not explain upstream TLS verification. A generator should make upstream scheme, host, port, SNI, and verification explicit.

### SSL listen syntax and examples

- Every TLS sample uses `listen 443 ssl http2` ([site-ssl.conf](../../sites-example/site-ssl.conf):13-14, :36-37; similarly `php-ssl.conf` and `proxy-ssl.conf`). Modern Nginx has a separate `http2 on;` directive; the `listen ... http2` parameter is deprecated in current releases. The updated samples should use the current syntax and say HTTP/2 is optional, not guaranteed by TLS alone.
- The SSL examples duplicate certificate directives in redirect and serving blocks and require missing local certificate files. A clearer template can centralize shared TLS includes while retaining separate HTTP redirect and HTTPS content servers.

## Official version/research anchor

The live official Nginx download page currently lists free Nginx Open Source stable `1.30.5` (released 2026-09-15) and mainline `1.31.6`; the official news page records the stable release and a fix for a vulnerability in `ngx_http_v3_module`. Treat `1.30.5` as the current stable baseline for this dated work, pin Docker tests to the exact patch, and re-check the official download/security pages before release because the version will drift. Sources: <https://nginx.org/en/download.html>, <https://nginx.org/news.html>, <https://nginx.org/en/security_advisories.html>.

## Architectural seams and likely decomposition

The request is an initiative with separate seams that can be developed and validated independently:

1. **Core baseline** — root `nginx.conf`, `mime.types`, `snippets/basic.conf`, security/cache/compression snippets. This is the most shared surface and should land first or establish the config contract.
2. **Workload examples** — `sites-example/site*.conf` for static/SPA, `php*.conf` for PHP-FPM, and `proxy*.conf` plus upstream/WebSocket snippets for reverse proxy/Go/Node services. Each can be tested by rendering a minimal complete config against the Docker image.
3. **Container packaging** — new `Dockerfile`, `docker-compose.yml`/override, `.dockerignore`, and possibly a Docker-specific `conf.d` include. Keep image defaults and host `/etc/nginx` assumptions separate; logs should follow container conventions.
4. **Client-side generator** — new isolated `web/` (Vue 3 + Vite or React + Vite) package, schema/options model, template/render layer, download/copy UX, and generator tests. There is no existing frontend seam, so avoid coupling it to the live root config until a versioned template contract exists. It must not accept or interpolate arbitrary directives without validation/escaping.
5. **Documentation** — replace the 906-line 2017 [README.md](../../README.md) with a task-oriented guide covering installation, Docker, examples, security assumptions, validation, tuning boundaries, and generator usage. README is a shared conflict hotspot across every slice.
6. **Git branch publication** — rename local `master` to `main`, push/set upstream, and update remote default branch only with repository-owner authority. This is independent of config edits and should be performed after the working tree is reviewable.

### Shared-file conflict map

- `README.md`: likely touched by core, Docker, generator, and examples work; designate one documentation owner or sequence updates.
- `nginx.conf`, `snippets/basic.conf`, `snippets/location/cache-control.conf`, and `snippets/location/protect-sensitive-files.conf`: shared by every site example and generator contract; freeze the baseline before child edits.
- `snippets/directive/ssl.conf`, `proxy.conf`, `websocket-proxy.conf`, and `fastcgi*.conf`: shared by their corresponding example families; avoid parallel edits to a snippet and its consumer without a contract/merge plan.
- `sites-example/*.conf`: parallel by family (`site`, `php`, `proxy`) with low cross-file conflict once shared snippets are stable.
- New `Dockerfile`/Compose files may need README references but otherwise are isolated.
- New `web/` files are isolated from Nginx files; only the generator schema/template mapping creates a semantic dependency. Put that mapping in one versioned source of truth to avoid config/UI drift.
- `.works/nginx-modernization/*` planning artifacts are shared process files; decompose/plan owners should sequence writes.

## Suggested acceptance/evidence seams for planning

- Run `nginx -t` against the exact target image with every generated/example configuration, including a minimal cert/key fixture for TLS examples or an explicit syntax-only strategy that does not need live certs.
- Exercise HTTP responses in a disposable Docker Compose stack: unknown host/default server, static file/404, SPA fallback, PHP FastCGI, HTTP reverse proxy, and WebSocket upgrade. Verify headers, cache controls, compression negotiation, forwarded headers, and sensitive-file denial.
- Add generator unit tests for every option combination, escaping/validation of host/path/upstream values, and deterministic output; add one browser smoke test only if the webapp is built in this initiative.
- Run `git diff --check`, a Markdown/link check if introduced, and an exact image/version readback (`nginx -V`/`nginx -v`) in the final evidence.
- Re-run current official download/security lookups at handoff; do not encode “latest” as a permanent unverified claim in comments.
