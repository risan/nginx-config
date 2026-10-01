# NGINX config toolkit: gap analysis

Audit date: 2026-10-01. Target: `lib/config.js` renderer (NGINX OSS 1.30.5, `nginx:1.30.5-alpine` image), `sites-example/*.conf`, `snippets/**`, `docs/*.md`.
Read-only audit. Line numbers refer to `lib/config.js` unless another file is named.

Every item cites a URL fetched during this audit. The minimum version is the NGINX OSS version that first has the directive or behavior.

## Evidence used (all fetched)

- [CHANGES] https://nginx.org/en/CHANGES
- [core] https://nginx.org/en/docs/http/ngx_http_core_module.html
- [proxy] https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- [upstream] https://nginx.org/en/docs/http/ngx_http_upstream_module.html
- [ssl] https://nginx.org/en/docs/http/ngx_http_ssl_module.html
- [v2] https://nginx.org/en/docs/http/ngx_http_v2_module.html
- [v3] https://nginx.org/en/docs/http/ngx_http_v3_module.html
- [gzip] https://nginx.org/en/docs/http/ngx_http_gzip_module.html
- [gzip_static] https://nginx.org/en/docs/http/ngx_http_gzip_static_module.html
- [realip] https://nginx.org/en/docs/http/ngx_http_realip_module.html
- [geo] https://nginx.org/en/docs/http/ngx_http_geo_module.html
- [limit_req] https://nginx.org/en/docs/http/ngx_http_limit_req_module.html
- [limit_conn] https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html
- [headers] https://nginx.org/en/docs/http/ngx_http_headers_module.html
- [log] https://nginx.org/en/docs/http/ngx_http_log_module.html
- [fastcgi] https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html
- [websocket] https://nginx.org/en/docs/http/websocket.html
- [acme] https://nginx.org/en/docs/http/ngx_http_acme_module.html
- [packages] https://nginx.org/en/linux_packages.html
- [pkg-oss] https://raw.githubusercontent.com/nginx/pkg-oss/master/alpine/Makefile (shows the build flags of the official Alpine image)
- [docker-nginx] https://raw.githubusercontent.com/nginx/docker-nginx/master/stable/alpine/Dockerfile
- [docker-ipv6] https://raw.githubusercontent.com/nginx/docker-nginx/master/entrypoint/10-listen-on-ipv6-by-default.sh
- [top10] https://www.f5.com/company/blog/nginx/avoiding-top-10-nginx-configuration-mistakes
- [tuning-blog] https://www.f5.com/company/blog/nginx/tuning-nginx (older; some defaults it quotes are stale)
- [mozilla-json] https://ssl-config.mozilla.org/guidelines/latest.json (v6.0)
- [mozilla-gen] https://raw.githubusercontent.com/tlsref/configurator/master/src/js/helpers/nginx.js (successor of the archived mozilla/ssl-config-generator)
- [owasp-cs] https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- [owasp-shp] https://raw.githubusercontent.com/OWASP/www-project-secure-headers/master/ci/headers_add.json (updated 2026-09-13)
- [mdn-hsts] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security
- [mdn-xfo] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options
- [mdn-fa] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
- [mdn-pp] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy
- [mdn-coop] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy
- [mdn-corp] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy
- [mdn-xxss] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-XSS-Protection
- [h5bp-files] https://raw.githubusercontent.com/h5bp/server-configs-nginx/main/h5bp/location/security_file_access.conf
- [h5bp-gzip] https://raw.githubusercontent.com/h5bp/server-configs-nginx/main/h5bp/web_performance/compression.conf
- [h5bp-gzs] https://raw.githubusercontent.com/h5bp/server-configs-nginx/main/h5bp/web_performance/pre-compressed_content_gzip.conf
- [h5bp-nginx] https://raw.githubusercontent.com/h5bp/server-configs-nginx/main/nginx.conf
- [ncio-site] https://raw.githubusercontent.com/digitalocean/nginxconfig.io/master/src/nginxconfig/generators/conf/website.conf.js
- [ncio-sec] https://raw.githubusercontent.com/digitalocean/nginxconfig.io/master/src/nginxconfig/generators/conf/security.conf.js
- [ncio-main] https://raw.githubusercontent.com/digitalocean/nginxconfig.io/master/src/nginxconfig/generators/conf/nginx.conf.js
- [ncio-gen] https://raw.githubusercontent.com/digitalocean/nginxconfig.io/master/src/nginxconfig/generators/conf/general.conf.js
- [cf-realip] https://developers.cloudflare.com/support/troubleshooting/restoring-visitor-ips/restoring-original-visitor-ips/
- [webdev-cache] https://web.dev/articles/http-cache
- [rfc9110] https://datatracker.ietf.org/doc/html/rfc9110#section-8.6
- [rfc9116] https://www.rfc-editor.org/rfc/rfc9116.html
- [le-ocsp] https://letsencrypt.org/2024/12/05/ending-ocsp/
- [le-chal] https://letsencrypt.org/docs/challenge-types/
- [rollup] https://rollupjs.org/configuration-options/#output-assetfilenames
- [openssl35] https://openssl-library.org/news/openssl-3.5-notes/
- [alpine-openssl] https://pkgs.alpinelinux.org/packages?name=openssl&branch=v3.22&arch=x86_64
- [brotli] https://github.com/google/ngx_brotli

## Checklist status at a glance

| Area | Item | Status | Where |
|---|---|---|---|
| Core | `worker_processes auto`, finite `worker_connections` | COVERED | 914-919 |
| Core | `sendfile`, `tcp_nopush` | COVERED | 508-510 |
| Core | Restating defaults (`tcp_nodelay`, `sendfile_max_chunk 2m`, `keepalive_requests 1000`, header parsing) | DUBIOUS (noise; see A11) | 509-531 |
| Core | Bounded header/body/send timeouts, `reset_timedout_connection` | COVERED | 516-519 |
| Core | `client_max_body_size` visible and configurable | MISSING | — |
| Core | `absolute_redirect off` for port-mapped containers | MISSING (B1) | — |
| Core | IPv6 listeners | MISSING (C4) | 825, 841, 887 |
| Core | `open_file_cache` | MISSING (opt-in, C16) | — |
| Server | Catch-all `default_server` returning 444 / `ssl_reject_handshake on` | COVERED | 822-835 |
| Server | `server_tokens off` | COVERED | 528 |
| Server | Rendered indentation | WRONG (cosmetic, A10) | 641-642, 822-891 |
| TLS | TLS 1.2/1.3, Mozilla intermediate v6.0 ECDHE list (exact match) | COVERED | 546-548 |
| TLS | Shared session cache, tickets on (1.23.2+ rotation) | COVERED | 549-553 |
| TLS | `ssl_early_data off` | COVERED | 555 |
| TLS | `ssl_ecdh_curve auto` (OpenSSL 3.5 adds X25519MLKEM768 itself) | COVERED (implicit) | — |
| TLS | HSTS with includeSubDomains/preload choice, 2-year max-age | PARTIAL (C6) | 445, 859 |
| TLS | ACME automation / challenge on the HTTP listener | PARTIAL/WRONG (A3, A7, C19) | 648-651, 883-891 |
| Protocol | `http2 on` (current syntax) | COVERED | 842 |
| Protocol | HTTP/3 / QUIC | MISSING (C5) | — |
| Compression | gzip text, `gzip_vary`, `gzip_proxied off` (BREACH-aware) | COVERED | 559-585 |
| Compression | `gzip_types` covers repo's own text/font MIME types | PARTIAL (A12/B4) | 576-577 |
| Compression | `gzip_static` for prebuilt `.gz` | MISSING (C18) | — |
| Compression | brotli / zstd | Deliberately absent (D) | — |
| Browser cache | `no-cache` HTML, `immutable` hashed assets | PARTIAL (regex bug, A6) | 671-707 |
| Proxy | Upstream keepalive | COVERED, but broken when `websocket` is on (A1) | 631-635, 751 |
| Proxy | Buffering on, request buffering on | COVERED | 773-774 |
| Proxy | Spoofed identity headers cleared, httpoxy `Proxy ""` | COVERED | 760-766 |
| Proxy | Real client IP behind CDN/LB (`realip`) | MISSING (C1) | 753-756 |
| Proxy | Multi-server upstream, LB method, passive health, bounded `proxy_next_upstream` | MISSING (C11) | 625-637 |
| Proxy | WebSocket / SSE scoped to a path | WRONG/DUBIOUS (A2) | 770-787 |
| Proxy | Request ID propagation | MISSING (B5) | — |
| Proxy cache | GET/HEAD, auth/cookie bypass, lock, revalidate, stale | COVERED | 726-743 |
| Proxy cache | `Vary` handling | DUBIOUS (A9) | 489-492 |
| PHP | `try_files $uri =404`, `SCRIPT_FILENAME`, `HTTP_PROXY ""` | COVERED | 711-724 |
| PHP | `fastcgi_hide_header X-Powered-By` | MISSING (B3) | — |
| PHP | `fastcgi_keep_conn` + upstream keepalive, `fastcgi_cache`, FPM failover | MISSING (C13) | — |
| Limits | `limit_req` (429) | PARTIAL (scope and key, A8) | 587-592, 861-863 |
| Limits | `limit_conn`, dry-run modes | MISSING (C14) | — |
| Headers | nosniff, Referrer-Policy | COVERED | 426-431 |
| Headers | X-Frame-Options / frame-ancestors, CSP, Permissions-Policy, COOP/CORP | MISSING (C7-C10) | — |
| Headers | Repeated `add_header` per location instead of `add_header_inherit merge` | DUBIOUS (correct but verbose, B2) | 434-448 |
| Files | Dotfile / backup deny | COVERED, but `.well-known` over-blocked (A7) | 646-666 |
| Logging | No query string in log; stdout/stderr | COVERED | 536-539, 876-877 |
| Logging | Buffered access log | MISSING (opt-in, C17) | — |
| Health | `/healthz` 204 | COVERED, but sends `Content-Length` (A5) | 866-872 |
| Metrics | `stub_status` on a protected listener | MISSING (opt-in, C21) | — |

---

## (A) Wrong or dubious things in the repo now (by priority)

### A1 [HIGH] Turning on WebSocket sends `Connection: close` on every normal proxied request, which turns off upstream keepalive
- Where: `config.js:610-614` (map `default close; ... "" close;`), `config.js:751` (`proxy_set_header Connection $connection_upgrade`). The same map is in `snippets/directive/websocket-proxy.conf:2-6`. Output: `sites-example/proxy-ssl.conf:66-70,146`.
- Why it is wrong: with `websocket: true`, every non-upgrade request gets `Connection: close`. The backend closes the connection after each response, so `keepalive 32` (and the 1.29.7+ default keepalive) never reuses a connection. The upstream docs require the `Connection` header to be cleared for HTTP keepalive. They now show `proxy_http_version 1.1` and `Connection ""` as "before 1.29.7" defaults [upstream]. 1.29.7 changed proxying so the "Connection" header is no longer sent by default [CHANGES]. The `''  close` in the websocket page example [websocket] predates default keepalive. An empty `proxy_set_header` value means the header is not sent [proxy].
- Fix:
  ```nginx
  map $http_upgrade $connection_upgrade {
      default "";
      ~*^websocket$ upgrade;
  }
  ```
- Min version: works on all versions. It matters most on 1.29.7+, where keepalive is on by default.

### A2 [HIGH] WebSocket and streaming switches change all of `location /`
- Where: `config.js:767-787`. With `websocket` or `streaming`, `proxy_read_timeout 1h` applies to every route. With `streaming`, `proxy_buffering off` and `proxy_cache off` also apply to every route.
- Why it is dubious: the repo's own snippet says "Include inside a WebSocket location only. Do not use this for every request." (`snippets/directive/websocket-proxy.conf:12`), and `docs/tuning.md:202-205` says the same. [top10] #5 says turning off `proxy_buffering` degrades performance. With a 1h read timeout, one hung backend request holds a connection and worker slot for an hour.
- Fix: add `websocketPath` / `streamingPath` options (C12) that emit a separate `location ^~ /ws/ {...}` or `location ^~ /events/ {...}`. For SSE, the better default is to keep `proxy_buffering on` and have the app send `X-Accel-Buffering: no` on streaming responses. NGINX honors this per response [proxy, proxy_buffering].
- Min version: X-Accel-Buffering works on all supported versions.

### A3 [HIGH] Redirects assume the public port equals the listen port, which breaks the default container setup
- Where: `renderRedirectServer` `config.js:883-891` emits `return 308 https://example.com:8443$request_uri` when `httpsPort` is 8443 (the default; see `sites-example/*-ssl.conf`). `config.js:758` sets `X-Forwarded-Port $server_port`.
- Why it is wrong: the image runs as UID 101 on 8080/8443 and is normally published as 80/443. Users then get redirected to `:8443`, which is not published. Backends that build URLs from `X-Forwarded-Port` produce `:8443` links. Let's Encrypt HTTP-01 "only accepts redirects ... to ports 80 or 443" [le-chal], so certificate renewal through this redirect fails. NGINX's own redirects (for example `try_files $uri $uri/` on a directory) are absolute and include `:8080` by default, because `absolute_redirect on` and `port_in_redirect on` are the defaults [core].
- Fix: add a separate `publicHttpsPort` (default 443) option (C2). Use it in the 308 target and in `X-Forwarded-Port`. Add `absolute_redirect off;` by default (B1).

### A4 [HIGH, PARTIAL] Forwarded identity is correct only when this NGINX is the internet edge
- Where: `config.js:753-757`. Docs: `docs/research-proxy.md:46-54`, `docs/security.md:144-156`.
- Assessment: overwriting `X-Forwarded-For` with `$remote_addr` is correct at the edge. Behind Cloudflare or a load balancer, `$remote_addr` is the proxy's address. The backend then sees one IP for all users, `limit_req` (A8) throttles all users as one client, and `X-Forwarded-Proto $scheme` reports `http` when TLS ends at the load balancer. The docs explain this, but the generator has no option for it. The realip module is compiled into the pinned image (`--with-http_realip_module` [pkg-oss]). Cloudflare documents `set_real_ip_from` plus `real_ip_header CF-Connecting-IP` [cf-realip]. See C1 for the option.

### A5 [MEDIUM] `/healthz` adds `Content-Length: 0` to a 204 response
- Where: `config.js:870`. Output: `nginx.conf:84`.
- Why it is wrong: RFC 9110 §8.6 says a sender must not send Content-Length in a message without a body, and a 204 never has content [rfc9110]. `add_header` adds a header line with that name verbatim [headers]. It does not change NGINX's length handling, so it only adds a non-conforming header. It also forces the healthz location to repeat every security header (`config.js:869`), because one `add_header` at a level cancels inheritance [headers].
- Fix: delete the line. Keep `access_log off; return 204;`. The location then inherits server headers.
- Dismissed suspicion: `/healthz` is not rate-limited even when `rateLimit` is on. `return` finalizes the request in the rewrite phase, before `limit_req` runs in the preaccess phase.

### A6 [MEDIUM] The "hashed asset" regex misses Vite/Rollup hashes and matches some unhashed files
- Where: `config.js:699` `"\.[A-Za-z0-9_-]{8,}\.(?:avif|css|...)$"`. The claim in `docs/tuning.md:98` ("Vite-style hashed asset names") is wrong.
- Evidence: Rollup's (and so Vite's) default names are `assets/[name]-[hash][extname]` and `[name]-[hash].js` [rollup], which put a dash, not a dot, before the hash. `/assets/index-BdK3x9aF.js` and Laravel-Vite `/build/assets/app-Ck3hF9aZ.js` do not match. The SPA profile is saved only by its `/assets/` location. The static and PHP profiles get no immutable caching. False positives that get a one-year `immutable` cache although they are not content-addressed include `jquery.validate.js` and `moment.timezone.js` (8+ letter middle segment). web.dev: one-year caching is only for "versioned URLs" [webdev-cache].
- Fix: replace the regex with an explicit `immutablePaths` list (C26, default `/assets/` for SPA). If a regex is kept, require hex or base64url hashes after `[.-]` and test it against real Vite, webpack and CRA names.

### A7 [MEDIUM] `.well-known` is blocked too broadly, and the ACME location is broken for proxy profiles
- Where: `config.js:653-660`, `config.js:648-651`.
- Evidence:
  - Every `/.well-known/*` path except `acme-challenge` returns 403. That blocks `/.well-known/security.txt`, the location RFC 9116 requires [rfc9116]. It also blocks app-served OIDC discovery and similar endpoints. Both h5bp (`location ~* /\.(?!well-known\/)`) [h5bp-files] and nginxconfig.io ("Denies access to hidden files except .well-known") [ncio-sec] exempt `.well-known`.
  - In the go/proxy profiles, no `root` is set, so the ACME `try_files $uri =404` reads the compiled-in default `html` directory. That is not a usable webroot.
  - In proxy profiles, the extension deny regex (`conf|ini|log|sh|sql|ya?ml`...) runs before `location /` and blocks real API routes such as `/openapi.yaml`.
  - With TLS on, the HTTP server (`config.js:883-891`) redirects the challenge too. HTTP-01 must be answered on port 80, and redirects are followed only to ports 80/443 [le-chal].
- Fix: use h5bp-style `location ~ /\.(?!well-known/)`. Limit the extension deny to file-serving profiles. Serve the challenge on the HTTP listener from an explicit `acmeWebroot` before the redirect (C19).

### A8 [MEDIUM] `rateLimit` covers every static asset and keys on the proxy's address
- Where: `config.js:591` `rate=10r/s`, `config.js:861-862` `limit_req zone=per_ip burst=20 nodelay` at server level.
- Evidence: `limit_req` is inherited by every location that has none of its own [limit_req]. In static, SPA and PHP profiles it counts every CSS, JS and image request. An HTTP/2 page load with more than about 30 assets from one IP can get 429s. Behind a CDN, all users share the CDN's IPs (A4). The option has no dry-run, although `limit_req_dry_run` exists since 1.17.1 [limit_req].
- Fix: apply the limit to dynamic locations only (the PHP `\.php$` location, proxy `location /`). Expose rate and burst. Add a dry-run toggle (C15). Requests with an empty key are not counted [limit_req], which allows a `map` exemption list.

### A9 [LOW] The proxy cache refuses any response that has `Vary`
- Where: `config.js:489-492` (`~*.+ 1`).
- Evidence: NGINX does not cache only `Vary: *`. For any other `Vary` value it caches a variant per request header (1.7.7) [proxy, proxy_cache_valid]. Most compressing backends send `Vary: Accept-Encoding`, so with this rule the cache stores almost nothing. `docs/research-proxy.md:98-100` itself says Vary is handled correctly.
- Fix: `map $upstream_http_vary $skip_cache_vary { default 0; ~*(cookie|authorization) 1; }`. `*` is already not cached.

### A10 [LOW] Rendering indentation
- Where: `config.js:822-891` push `server {` at column 0 while `http {` is open (`config.js:922,933`). `renderTls` (`config.js:641-642`) indents `ssl_certificate*` by 8 spaces inside a 4-space server body (`sites-example/proxy-ssl.conf:107-108`). Result: a cosmetic problem only, with no effect on parsing. Fix: indent server blocks by 4 and their bodies by 8, and use 8 in `renderTls`. Add a snapshot assertion.

### A11 [LOW] Restated defaults and no-op lines described as tuning
- `tcp_nodelay on` (default on), `sendfile_max_chunk 2m` (default since 1.21.4), `keepalive_requests 1000` (default since 1.19.10) [core]. `docs/research-nginx.md:101-103` says not to restate these as tuning, yet `config.js:509-513` does.
- `proxy_http_version 1.1`, `Connection ""` and `keepalive 32` are stale on 1.30 (`docs/research-proxy.md:20-23`; [upstream], [proxy]). The explicit `keepalive 32;` also drops the new default `local` flag [upstream]. That is harmless with one location, but it is a silent difference.
- `fastcgi_index index.php` inside `location ~* \.php$` (`config.js:721`) has no effect. It only applies to URIs that end with `/` [fastcgi].
- `gzip on` inside asset locations (`config.js:687,702`) repeats the http-level setting.
- `proxy_cache_bypass $http_upgrade` (`config.js:779`) is emitted even when the cache is off.
- `error_log` is repeated in the server block (`config.js:876`).
- Recommendation: drop these lines, or keep them with comments that do not call them optimizations.

### A12 [LOW] `gzip_types` leaves out text types that the repo's own `mime.types` defines
- Where: `config.js:576-577` against `mime.types:4-42`. Missing: `font/ttf font/otf application/manifest+json application/ld+json application/vnd.geo+json application/xhtml+xml application/rss+xml application/atom+xml image/x-icon image/bmp text/csv text/markdown text/vtt text/javascript`. h5bp includes all of these [h5bp-gzip]. `text/html` is always compressed [gzip]. See B4.

### A13 [LOW] The HSTS value is fixed
- Where: `config.js:445,859`: `max-age=31536000` with no `includeSubDomains` or `preload` choice. Mozilla v6.0 uses `hsts_min_age 63072000` and emits `includeSubDomains` [mozilla-json, mozilla-gen]. OWASP recommends `max-age=63072000; includeSubDomains; preload` [owasp-cs]. Preload requires `max-age` of at least 31536000 and `includeSubDomains` [mdn-hsts]. The current conservative default is defensible. Make it a choice (C6).

### A14 [INFO] Doc corrections, not config changes
- `docs/research-proxy.md:125-127`, `docs/tuning.md:152-154` and `docs/security.md:23-25` say `gzip_static` (and http_v3) must first be verified because they are "not built by default". That is true for source builds, but the pinned image's build includes `--with-http_gzip_static_module`, `--with-http_v3_module` and `--with-http_realip_module` [pkg-oss]. The image also installs `nginx-module-acme` [docker-nginx]. The docs can say so directly.
- Verified as accurate: CVE-2026-90439 fixed in 1.31.6 [CHANGES]; `add_header_inherit` in 1.29.3 [headers]; `resolve` in OSS since 1.27.3 [upstream]; 1.29.7 keepalive defaults [CHANGES].

---

## (B) Missing items that should be on by default

| # | Item | Directives | Min version | Evidence |
|---|---|---|---|---|
| B1 | Relative redirects, so port-mapped containers and TLS-terminating LBs do not leak `:8080` | `absolute_redirect off;` (http) | 1.11.8 | [core]; A3 |
| B2 | One header policy, without repeating it per location. Put headers once at server level. Child locations add only their own headers (for example `Cache-Control`). Delete `repeatedSecurityHeaders*` (434-448). Caution: `merge` appends, so a child must not redefine a header the server already sets, or it is sent twice. Needed for Alt-Svc with HTTP/3 (C5). | `add_header_inherit merge;` (http) | 1.29.3 (target 1.30.5 has it) | [headers] |
| B3 | Strip implementation disclosure from backends | PHP: `fastcgi_hide_header X-Powered-By;` / proxy: `proxy_hide_header X-Powered-By;` | all | OWASP "X-Powered-By: Remove all instances" [owasp-cs]; FastCGI does not hide it by default [fastcgi] |
| B4 | Complete `gzip_types` for static/SPA (A12). Keep `gzip_comp_level 1`, `gzip_proxied off`. | `gzip_types text/plain text/css text/xml text/javascript text/markdown text/csv text/vtt application/javascript application/json application/ld+json application/manifest+json application/vnd.geo+json application/xml application/xhtml+xml application/rss+xml application/atom+xml application/wasm image/svg+xml image/x-icon image/bmp font/ttf font/otf;` | all | [h5bp-gzip], [gzip] |
| B5 | Request correlation ID passed to upstream and logged (overwrites any client-supplied ID) | `proxy_set_header X-Request-ID $request_id;` (proxy) / `fastcgi_param HTTP_X_REQUEST_ID $request_id;` (php); add `rid=$request_id` to `log_format main` | 1.11.0 | [core] `$request_id`; docs/security.md:214 asks for "a safe request ID" |
| B6 | Fixed WebSocket `Connection` map (A1) | see A1 | all | [upstream], [CHANGES] 1.29.7 |
| B7 | Drop `Content-Length` on `/healthz` (A5) | `location = /healthz { access_log off; return 204; }` | all | [rfc9110] |
| B8 | With TLS on, answer ACME HTTP-01 on the HTTP listener before redirecting | in the redirect server: `location ^~ /.well-known/acme-challenge/ { root <acmeWebroot>; try_files $uri =404; }` `location / { return 308 https://$host$public_port$request_uri; }` | all | [le-chal] |
| B9 | Always emit `client_max_body_size` (default value `1m`), so the limit is visible and editable (C3 makes it configurable) | `client_max_body_size 1m;` (server) | all | [core]; docs/research-nginx.md:79-81 already recommends it |
| B10 | `.well-known` exemption like h5bp (A7) | `location ~ /\.(?!well-known/) { deny all; }` (keep the extension deny only for file profiles) | all | [h5bp-files], [rfc9116] |

---

## (C) Missing items that should be opt-in generator options

Proposed option names follow the existing flat `OPTION_KEYS` style. Every free-text value needs token validation (the existing `CONTROL_OR_DIRECTIVE_RE`). Header values also need a dedicated validator that allows `;`, `'`, `(`, `)` and spaces inside a double-quoted string, and rejects `"`, `\`, `$`, `{`, `}` and control characters. `$` must be rejected because it would start an NGINX variable.

### C1 [HIGH] `trustedProxies` + `realIpHeader`: "Behind a CDN or load balancer"
- UI: CIDR list (reject `0.0.0.0/0` and `::/0`). Header select: `X-Forwarded-For` / `CF-Connecting-IP` / `proxy_protocol`. A "Cloudflare" preset fills the published ranges and shows a "keep this list updated" warning [cf-realip].
- Emit (http):
  ```nginx
  set_real_ip_from 203.0.113.0/24;   # one line per CIDR
  real_ip_header X-Forwarded-For;    # or CF-Connecting-IP / proxy_protocol
  real_ip_recursive on;
  # Trust X-Forwarded-Proto only from the same proxies.
  geo $realip_remote_addr $from_trusted_proxy {
      default 0;
      203.0.113.0/24 1;
  }
  map "$from_trusted_proxy:$http_x_forwarded_proto" $forwarded_proto {
      "~^1:(?<p>https?)$" $p;
      default $scheme;
  }
  ```
  In the proxy location, use `proxy_set_header X-Forwarded-Proto $forwarded_proto;`. Keep `X-Forwarded-For $remote_addr`, which is now the real client after realip. For `proxy_protocol`, also add `listen ... proxy_protocol`.
- Min version: realip module (in the pinned image [pkg-oss]); `real_ip_recursive` 1.3.0/1.2.1; `$realip_remote_addr` 1.9.7; `geo` with a custom address variable 0.7.27 [realip], [geo].

### C2 [HIGH] `publicHttpsPort` (default 443): "Public HTTPS port (what browsers use)"
- Emit: `return 308 https://<serverName>[:<publicHttpsPort unless 443>]$request_uri;` and `proxy_set_header X-Forwarded-Port <publicHttpsPort|publicHttpPort>;`. Use the same port in Alt-Svc (C5). Fixes A3. Min version: all.

### C3 [HIGH] `clientMaxBodySize`: "Max request/upload size"
- Values `^[1-9][0-9]{0,4}[km]$`. Reject `0`, which turns the check off [core]. Preset defaults: 1m for static, SPA, Go and proxy; suggest 16m for PHP.
- Emit: `client_max_body_size 16m;` (server). Min version: all.

### C4 [MEDIUM] `ipv6`: "Also listen on IPv6"
- Emit `listen [::]:<port> ...` next to every IPv4 `listen`, including both default servers. If only the app server gets `[::]`, the app server becomes the IPv6 default and unknown Hosts reach the app.
  ```nginx
  listen [::]:8080 default_server;          # reject server
  listen [::]:8443 ssl default_server;      # TLS reject server
  listen [::]:8080;  listen [::]:8443 ssl;  # app / redirect servers
  ```
  `ipv6only` defaults to on, so separate sockets are correct [core]. Off by default: binding `[::]` fails on hosts with IPv6 turned off. The official image adds `[::]` only after checking `/proc/net/if_inet6` [docker-ipv6]. nginxconfig.io exposes `listenIpv6` [ncio-site]. Min version: 0.7.36.

### C5 [MEDIUM] `http3`: "HTTP/3 (QUIC), experimental"
- Requires TLS. The module is in the pinned image [pkg-oss] and marked experimental [v3].
- Emit:
  ```nginx
  # TLS reject server
  listen 8443 quic reuseport default_server;
  # app server
  listen 8443 quic;
  add_header Alt-Svc 'h3=":443"; ma=86400' always;   # public port (C2)
  # optional advanced: quic_retry on;  quic_host_key /etc/nginx/tls/quic_host.key;
  ```
  `reuseport` may appear only once per address:port. Keep `ssl_early_data off`. The UI must say "publish UDP 443 (for example `-p 443:8443/udp`)". This depends on B2, so Alt-Svc reaches every location.
- Min version: 1.25.0. Patch floor 1.30.5/1.31.6 because of CVE-2026-90439 [CHANGES]. nginxconfig.io exposes `http3` [ncio-site].

### C6 [MEDIUM] `hsts`: change from boolean to select "HSTS"
- Values: `off` | `host` | `subdomains` | `preload`.
- Emit: `add_header Strict-Transport-Security "max-age=63072000" always;`, then `; includeSubDomains`, then `; includeSubDomains; preload`. Explain that preload is hard to undo and needs max-age of at least 1y plus includeSubDomains [mdn-hsts]. 2-year value from [mozilla-json]/[owasp-cs]. nginxconfig.io exposes `hstsSubdomains` and `hstsPreload` [ncio-site]. Min version: `always` 1.7.5.

### C7 [MEDIUM] `frameOptions`: "Clickjacking protection"
- Values: `DENY` / `SAMEORIGIN` (recommended preselected) / `off`.
- Emit:
  ```nginx
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Content-Security-Policy "frame-ancestors 'self'" always;   # 'none' for DENY
  ```
  If C8 is set, append `frame-ancestors` to that policy instead of sending a second CSP header. `frame-ancestors` has no `default-src` fallback and cannot be set in `<meta>` [mdn-fa]. X-Frame-Options covers older browsers; ALLOW-FROM is obsolete [mdn-xfo]. OWASP: `X-Frame-Options: DENY` [owasp-cs]. Min version: all.

### C8 [LOW-MEDIUM] `contentSecurityPolicy` + `cspReportOnly`: "Content-Security-Policy (advanced)"
- Free text with the header validator. Starter suggestion: OWASP's `default-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests` [owasp-shp].
- Emit: `add_header Content-Security-Policy "<value>" always;`, or `Content-Security-Policy-Report-Only`. Off by default because a copied CSP breaks sites (`docs/security.md:200-203`). nginxconfig.io exposes it [ncio-sec].

### C9 [LOW] `permissionsPolicy`: "Disable powerful browser features"
- Emit: `add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;`.
- MDN marks the header "Limited availability", not Baseline [mdn-pp]. OWASP's long list [owasp-shp] includes `fullscreen=()` and `autoplay=()`, which break embedded video. Offer the short list as the starting value.

### C10 [LOW] `crossOriginOpenerPolicy` / `crossOriginResourcePolicy`
- UI: COOP `same-origin-allow-popups` (OAuth- and payment-safe) / `same-origin`. CORP `same-site` / `same-origin`.
- Emit: `add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;` and `add_header Cross-Origin-Resource-Policy "same-site" always;`.
- MDN warns that `same-origin` breaks cross-origin OAuth and payment popups [mdn-coop]. CORP values are listed in [mdn-corp]. Do not offer COEP `require-corp` as a default (D).

### C11 [MEDIUM] Upstream pool: `upstreams[]`, `loadBalancing`, `passiveHealth`, `retry`
- UI: "Backend servers" list, each with a `backup` checkbox. "Balancing" select: round-robin / `least_conn` / `hash $binary_remote_addr consistent`. Do not offer `ip_hash`; [top10] #9 recommends `hash ... consistent` instead. "Re-resolve DNS names" with a resolver IP.
- Emit:
  ```nginx
  upstream backend {
      zone backend 64k;
      least_conn;
      server app-1:3000 max_fails=3 fail_timeout=10s;
      server app-2:3000 max_fails=3 fail_timeout=10s;
      server app-3:3000 backup;          # not with hash/ip_hash/random
      # DNS mode: resolver 127.0.0.11 valid=30s; ... server app:3000 resolve;
  }
  # in location:
  proxy_next_upstream error timeout http_502 http_503 http_504;
  proxy_next_upstream_tries 2;
  proxy_next_upstream_timeout 10s;
  ```
  Never emit `non_idempotent`. The default retry policy only matters once there is more than one server, so the "no proxy_next_upstream" suspicion is a gap only together with this option.
- Min version: `resolve` 1.27.3 OSS; `zone` OSS; `least_conn` 1.3.1; `hash` 1.7.2; `http_429` 1.11.13; non-idempotent protection 1.9.13 [upstream], [proxy]. [top10] #10 covers upstream groups.

### C12 [MEDIUM] `websocketPath` / `streamingPath`: "WebSocket path", "Server-sent events path"
- Replaces A2.
- Emit:
  ```nginx
  location ^~ /ws/ {
      proxy_pass http://backend;
      proxy_set_header Upgrade $websocket_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_read_timeout 1h; proxy_send_timeout 1h;
      # plus the identity headers from location /
  }
  location ^~ /events/ { proxy_pass http://backend; proxy_buffering off; proxy_cache off; proxy_read_timeout 1h; }
  ```
  Help text: the app can instead send `X-Accel-Buffering: no` [proxy]. Note the `proxy_set_header` inheritance trap: any `proxy_set_header` in the child location drops all parent ones [top10] #4. Emit the full header set, or put the shared ones at server level and use only `Upgrade`/`Connection` here.

### C13 [MEDIUM] PHP-FPM: `fastcgiKeepalive`, `fastcgiReadTimeout`, `fastcgiBackup`, `fastcgiCache`
- `fastcgiKeepalive` (with optional backup server):
  ```nginx
  upstream php_fpm { server 127.0.0.1:9000; server 127.0.0.1:9001 backup; keepalive 8; }
  fastcgi_pass php_fpm; fastcgi_keep_conn on;
  ```
  Both parts are required for keepalive [fastcgi], [upstream]. Each idle connection holds a `pm.max_children` slot.
- `fastcgiReadTimeout`: `fastcgi_read_timeout 60s;` (the default) [fastcgi].
- `fastcgiCache`: mirror the proxy cache maps (method, Authorization, Cookie, request no-cache, Set-Cookie, upstream private/no-store), then:
  ```nginx
  fastcgi_cache_path /tmp/nginx-fcgi-cache levels=1:2 keys_zone=php_cache:10m max_size=256m inactive=10m use_temp_path=off;
  fastcgi_cache php_cache; fastcgi_cache_key "$scheme|$host|$request_uri";
  fastcgi_cache_methods GET HEAD; fastcgi_cache_lock on;
  fastcgi_cache_valid 200 301 302 10m;
  fastcgi_cache_use_stale error timeout updating http_500 http_503;
  fastcgi_cache_bypass ...; fastcgi_no_cache ...;
  ```
  [fastcgi]. Do not expose `fastcgi_buffers` tuning (D). nginxconfig.io offers a PHP backup server [ncio-site].

### C14 [LOW] `connLimit`: "Limit concurrent connections per client"
- Emit (http, then server or dynamic location):
  ```nginx
  limit_conn_zone $binary_remote_addr zone=per_ip_conn:10m;
  limit_conn per_ip_conn 20;
  limit_conn_status 429;
  ```
  Help text: in HTTP/2 and HTTP/3 each concurrent request counts as a connection [limit_conn]. Requires C1 behind a CDN. Min version: `limit_conn_status` 1.3.15; `limit_conn_dry_run` 1.17.6.

### C15 [LOW] `rateLimitRate`, `rateLimitBurst`, `rateLimitDryRun`, `rateLimitScope` (`dynamic` | `all`)
- Emit: `limit_req zone=per_ip burst=<n> nodelay;` only in dynamic locations, plus `limit_req_dry_run on;`. Min version: dry run 1.17.1 [limit_req]. Fixes A8.

### C16 [LOW] `openFileCache` (static/SPA/PHP): "Cache file metadata"
- Emit:
  ```nginx
  open_file_cache max=1000 inactive=20s;
  open_file_cache_valid 30s;
  open_file_cache_min_uses 2;
  open_file_cache_errors off;
  ```
  The docs example sets `open_file_cache_errors on`; keep it off so files added during a deploy are found [core]. Already recommended as opt-in in `docs/research-nginx.md:245-261`.

### C17 [LOW] `accessLogBuffer`: "Buffer access-log writes"
- Emit: `access_log /dev/stdout main buffer=32k flush=5s;`. Writes happen when the buffer is full, when `flush` expires, or on reopen/exit [log]. Help text: a crash loses the unwritten buffer, and container logs are delayed by up to `flush`. Listed in [tuning-blog]. Min version: `flush` 1.3.10.
- Related: an `accessLogSkip2xx3xx` option using `if=` (1.7.0) [log].

### C18 [MEDIUM] `precompressed`: "Serve prebuilt .gz files"
- Emit (static/SPA asset and html locations): `gzip_static on;`. The build must produce `.gz` files with the same mtime [gzip_static], [h5bp-gzs]. The module is compiled into the pinned image [pkg-oss]. Preselect it for static/SPA when gzip is on. Without a `.gz` file it costs only one extra file lookup.

### C19 [MEDIUM] `acme`: "Automatic certificates (NGINX ACME module)"
- Alternative: `acmeWebroot` for certbot (B8).
- Emit:
  ```nginx
  load_module modules/ngx_http_acme_module.so;   # main context
  http {
      resolver 127.0.0.11 valid=300s;            # must be reachable
      acme_issuer letsencrypt {
          uri https://acme-v02.api.letsencrypt.org/directory;
          contact admin@example.com;
          state_path /var/cache/nginx/acme-letsencrypt;   # writable, persistent volume
          accept_terms_of_service;
      }
      acme_shared_zone zone=ngx_acme_shared:1M;
      server { listen 8443 ssl; acme_certificate letsencrypt;
               ssl_certificate $acme_certificate; ssl_certificate_key $acme_certificate_key;
               ssl_certificate_cache max=2; }
  }
  ```
  The HTTP-01 challenge requires a port-80 listener (container 8080 published as 80) [acme], [le-chal]. `challenge tls-alpn-01` is the alternative [acme].
- Packaged since 1.29.1 [packages]. The pinned `nginx:1.30.5-alpine` installs `nginx-module-acme` (ACME_VERSION 0.4.1; not on armhf) [docker-nginx]. The non-root UID 101 needs a writable `state_path`.

### C20 [LOW] `upstreamTls`: "Backend uses HTTPS"
- Emit:
  ```nginx
  proxy_pass https://backend;
  proxy_ssl_server_name on;
  proxy_ssl_name <name>;
  proxy_ssl_verify on;
  proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
  ```
  `proxy_ssl_verify` is off by default [proxy]. Manual-only today (`docs/security.md:158-174`).

### C21 [LOW] `statusEndpoint`: "Expose stub_status on loopback"
- Emit: `server { listen 127.0.0.1:8081; location = /nginx_status { stub_status; allow 127.0.0.1; deny all; access_log off; } }`.
- [top10] #8 (unsecured metrics). The module is compiled in [pkg-oss].

### C22 [LOW] Proxy-cache extras: `cacheBackgroundUpdate`, `cacheStatusHeader`
- Emit: `proxy_cache_background_update on;` (1.11.10 [proxy]) and `add_header X-Cache-Status $upstream_cache_status always;`. Both are opt-in: the first serves stale content, and the second reveals cache state.

### C23 [LOW] `earlyHints`: forward 103 from the upstream
- Emit: `map $http_sec_fetch_mode $early_hints { navigate $http2$http3; }` and `early_hints $early_hints;`. Min version: 1.29.0 [core]. Replaces HTTP/2 push, which is obsolete since 1.25.1 [v2].

### C24 [LOW] `certCompression`
- Emit: `ssl_certificate_compression on;`. Min version: 1.29.1, default off [ssl]. Needs OpenSSL compression support in the build. Test before exposing it.

### C25 [LOW] `securityTxt`: if B10 is not adopted, at least allow security.txt
- Emit: `location = /.well-known/security.txt { try_files $uri =404; }` [rfc9116]. nginxconfig.io has a security.txt option [ncio-sec].

### C26 [MEDIUM] `immutablePaths`: replaces the regex (A6)
- UI: list of prefixes such as `/assets/`, `/build/assets/`, `/_next/static/`.
- Emit per prefix: `location ^~ /assets/ { try_files $uri =404; add_header Cache-Control "public, max-age=31536000, immutable"; access_log off; }` [webdev-cache].

### C27 [LOW] `gzipLevel`: 1 (default) to 6
- nginxconfig.io uses 6 [ncio-gen], h5bp uses 5 [h5bp-gzip], and the NGINX default is 1 [gzip]. Expose it with a "measure CPU" note rather than changing the default.

---

## (D) Do not add these (cargo-cult or harmful)

| Item | Reason | Evidence |
|---|---|---|
| `X-XSS-Protection "1; mode=block"` (nginxconfig.io still emits it [ncio-sec]) | MDN: it "can create XSS vulnerabilities"; use CSP. OWASP: set `0` or omit. | [mdn-xxss], [owasp-cs] |
| `Expect-CT`, `Public-Key-Pins` | OWASP: "Do not use". | [owasp-cs] |
| OCSP stapling on by default (`ssl_stapling on`) | Let's Encrypt removed OCSP URLs on 2025-05-07 and shut off responders on 2025-08-06, so stapling does nothing for LE certs and logs warnings. Mozilla JSON still lists `ocsp_staple: true`, so keep the commented snippet for other CAs. | [le-ocsp], [mozilla-json] |
| `ssl_session_tickets off` | Mozilla's generator emits it only for NGINX < 1.23.2. Since 1.23.2 the shared cache rotates ticket keys. | [mozilla-gen], [ssl] |
| `ssl_dhparam` / DHE ciphers | Mozilla v6.0 intermediate has no DHE ciphers. NGINX: without dhparam, DHE is not used. | [mozilla-json], [ssl] |
| Pinning `ssl_ecdh_curve` | OpenSSL 3.5 already prefers X25519MLKEM768 by default, and the image's Alpine 3.22 ships OpenSSL 3.5.9. A pinned list can drop future PQ groups. If pinned, copy Mozilla's `X25519MLKEM768:X25519:prime256v1:secp384r1`. | [openssl35], [alpine-openssl], [mozilla-json] |
| `ssl_prefer_server_ciphers on` | Mozilla v6.0 sets `server_preferred_order: false`. | [mozilla-json] |
| `ssl_early_data on` / 0-RTT | Replayable. | [ssl], [v3] |
| `listen ... http2`, `http2_push*`, `http2_idle_timeout`, etc. | Deprecated or obsolete since 1.19.7/1.25.1. | [v2] |
| `worker_connections 65535` + `worker_rlimit_nofile 65535` + `multi_accept on` (nginxconfig.io hard-codes these) | Without matching OS and container limits they only hide limits. [top10] #1 links `worker_rlimit_nofile` to `worker_connections`; expose it only with an fd-limit field. | [ncio-main], [top10], docs/research-nginx.md:108-123 |
| `use epoll`, `accept_mutex on` | Selected automatically; off by default since 1.11.3. | docs/research-nginx.md:95-99, [core] |
| `proxy_buffering off` globally | [top10] #5. | [top10], [proxy] |
| `proxy_next_upstream non_idempotent` | Duplicates POSTs. | [proxy] |
| `gzip_proxied any` by default (h5bp and nginxconfig.io do this) | BREACH warning in the NGINX docs; the repo correctly keeps dynamic gzip opt-in. | [gzip], [h5bp-gzip], [ncio-gen] |
| `gzip_types *` or compressing woff/woff2, images, archives | Already compressed. | [h5bp-gzip] (lists only ttf/otf/eot fonts) |
| brotli / zstd as defaults | Not NGINX core. Not in nginx.org dynamic packages (geoip, image-filter, njs, perl, xslt, otel, acme). No core change in CHANGES through 1.31.6. ngx_brotli needs a build that exactly matches the binary. Revisit only as an image variant with `load_module`. `gzip_static` (C18) gives most of the static-asset win without it. | [packages], [CHANGES], [brotli] |
| COEP `require-corp`, `Clear-Site-Data`, `Cache-Control: no-store` as global headers (from OWASP's maximal list) | Breaks third-party resources, logs users out and wipes storage, and turns off all caching. These are per-app or per-endpoint decisions, not server defaults. | [owasp-shp], [webdev-cache] |
| OWASP's full `Permissions-Policy` list as default | Turns off fullscreen and autoplay (embeds). The header is not Baseline. Offer the short list in C9. | [owasp-shp], [mdn-pp] |
| `Access-Control-Allow-Origin "*"` on fonts/SVG (nginxconfig.io) | Not needed for same-origin. CORS is an app policy. | [ncio-gen] |
| `if ($request_method !~ ...)` method filtering (nginxconfig.io "restrict") | [top10] #6 says to prefer `map` and keep `if` to `return`/`rewrite`. Method policy belongs to the app or `limit_except`. | [top10], [ncio-site] |
| Hiding `Server: nginx` with third-party headers-more | `server_tokens off` already removes the version. A custom Server value needs a non-core module. | [owasp-cs] |
| Blanket `fastcgi_buffers`/`proxy_buffers`/`large_client_header_buffers` increases | Defaults are page-sized. Raise only after "upstream sent too big header". | [fastcgi], docs/research-nginx.md:336-338 |
| `client_max_body_size 0` | Turns the check off. | [core] |
| `ssl_buffer_size 4k` globally | The default is 16k. Benefit depends on the workload (docs/tuning.md:273-275). | [ssl] |
| `reuseport` on TCP listeners by default | Needed only for QUIC (C5). Otherwise it needs scaling evidence. | [core], docs/research-nginx.md:427 |
| `access_log off` globally / `error_log off` | `error_log off` writes a file named "off". | [top10] #2, [log] |
| `X-DNS-Prefetch-Control off`, `X-Permitted-Cross-Domain-Policies none` as defaults | In OWASP's list but legacy or low value (Flash/Acrobat policies, prefetch privacy). Optional "legacy extras" bundle at most. | [owasp-shp] |

---

## Verification of the caller's suspicions

| Suspicion | Verdict |
|---|---|
| `Content-Length 0` on 204 healthz | Confirmed wrong (A5) |
| XFF overwrite behind CDN/LB | Confirmed: correct at the edge only, and realip is missing (A4/C1). `X-Forwarded-Proto` is also wrong behind a TLS LB. |
| Indentation | Confirmed (A10) |
| Repeated headers vs `add_header_inherit merge` | Confirmed available in 1.29.3+. The current repetition is correct, just verbose. `merge` appends, so watch for duplicates (B2). |
| No IPv6 | Confirmed; opt-in (C4). Add `[::]` to the default servers too. |
| No HTTP/3 | Confirmed; experimental opt-in (C5); module present in the image |
| `client_max_body_size` not configurable | Confirmed; not even emitted (B9/C3) |
| No upstream failover/LB | Confirmed (C11) |
| No `proxy_next_upstream` policy | Partly dismissed: the default `error timeout` applies and is fine. It matters only together with C11. |
| No `gzip_static` | Confirmed; the module is in the pinned image (C18) |
| No `open_file_cache` | Confirmed; opt-in only (C16) |
| No CSP/Permissions-Policy/XFO/COOP | Confirmed (C7-C10) |
| HSTS lacks includeSubDomains/preload | Confirmed (A13/C6) |
| No `limit_conn` | Confirmed (C14) |
| No fastcgi tuning | Confirmed for keepalive/cache/backup (C13). Buffer tuning should not be added (D). |
| No access_log buffering | Confirmed; opt-in (C17) |
| No ACME | Partly: a challenge location exists, but it is redirected on HTTP and rootless in proxy profiles (A7/B8). Native `nginx-module-acme` is in the pinned image (C19). |
| Not in the original list, found here | A1 (WebSocket map turns off keepalive), A2 (whole-location WS/SSE), A3 (public port in redirects / `absolute_redirect`), A6 (hash regex), A8 (rate limit scope), A9 (Vary), A12 (gzip_types), B3 (X-Powered-By), B5 (request ID) |
