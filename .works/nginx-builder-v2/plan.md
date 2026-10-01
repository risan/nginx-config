# Plan: NGINX builder v2 (renderer audit fixes + Astro UI)

Date: 2026-10-01. Branch: `worktree-astro-builder-audit`.
Evidence: `research-nginx-facts.md`, `research-gaps.md`, `research-frontend.md`
(copied next to this plan). Gap IDs (A1, B3, C5 ...) refer to `research-gaps.md`.

## Goals

1. Every directive the renderer emits is correct for NGINX 1.30.5 and backed by a
   cited source. Fix A1–A13. Drop restated defaults that are presented as tuning.
2. Cover the missing optimizations and security practices as defaults (B1–B10)
   or opt-in options (C1–C27 subset below), without overwhelming the UI.
3. Replace the Vue app with Astro 7 + React 19 islands + Tailwind 4 + shadcn/ui,
   with Oxlint, Oxfmt, Vitest, Playwright. Static output on Cloudflare Workers
   static assets (no adapter).
4. The UI, the checked-in examples, docs, and the runtime image all come from one
   renderer and one option schema.

Non-goals: brotli/zstd (not packaged by nginx.org), ECH (needs OpenSSL 4), split
multi-file output, multiple server blocks per config, NGINX Plus features.

## Verified facts this plan relies on

- Stable 1.30.5 / mainline 1.31.6 (2026-09-15). Current `nginx:1.30.5-alpine`
  index digest: `sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94`
  (checked with `docker buildx imagetools inspect`). The repo pins an old digest.
- Image: OpenSSL 3.5.8 at runtime; built with http_v3, gzip_static, realip,
  threads; ships `ngx_http_acme_module.so`. No brotli/zstd.
- 1.29.7+: upstream keepalive on by default (`keepalive 32 local`),
  `proxy_http_version` default 1.1, `Connection` not sent by default.
- `add_header_inherit merge` exists since 1.29.3.
- OpenSSL 3.5 `ssl_ecdh_curve auto` already prefers X25519MLKEM768.
- Let's Encrypt OCSP ended 2025-08-06; stapling is not a default.
- Mozilla/TLSRef guideline v6.0 intermediate = current cipher list, prefer server
  ciphers off, no dhparam; modern = TLS 1.3 only.

## Part 1 — Option schema and renderer (`lib/`)

### Files

- `lib/version.ts` — `NGINX_VERSION = '1.30.5'`, `NGINX_IMAGE_DIGEST`.
- `lib/options.ts` — the single option schema: keys, types, defaults, choices,
  per-profile/target applicability, validation, labels, one-line help, "why"
  text, doc URL, group, `advanced` flag, `experimental` flag. Exports
  `OPTIONS`, `GROUPS`, `PROFILES`, `TARGETS`, `defaultsFor(profile, target)`,
  `validateOptions(input)`, `isApplicable(key, options)`.
  Two callers: the validator/renderer and the UI. Labels/help live here so the
  UI and the static SEO reference section never drift from the renderer.
- `lib/render.ts` — `generateConfig(options)`, `deploySteps(options)`,
  `warnings(options)`. Small private helpers per block (main, events, http
  globals, tls, compression, maps, upstream, reject servers, redirect server,
  app server, locations). Use a tiny indentation-aware line builder so nesting is
  always correct (fixes A10).
- `lib/cloudflare-ips.ts` — Cloudflare IPv4/IPv6 ranges fetched from
  https://www.cloudflare.com/ips-v4 and /ips-v6 at build-time of this change,
  with the fetch date in a comment.
- Delete `lib/config.js`, `lib/version.js`, `lib/package.json` once callers move.

TypeScript with `erasableSyntaxOnly` (no enums, no parameter properties) so
Node 24 runs `.ts` directly (`node --test tests/*.test.ts`, scripts import
`../lib/render.ts`). Imports use explicit `.ts` extensions.

### Option schema v2 (SCHEMA_VERSION = 2)

Profiles: `static`, `spa`, `php`, `proxy` (the old `go` profile merges into
`proxy`; it only differed in defaults). Targets: `host` (VM/bare metal, ports
80/443, `/var/log/nginx`, `/run/nginx.pid`, `user`), `container` (non-root,
8080/8443, `/tmp` pid and temp paths, logs to stdout/stderr) — the container
target reproduces today's output style and backs `docker/nginx.conf`.

| Key | Type / values | Default | Applies | Group |
|---|---|---|---|---|
| profile | static/spa/php/proxy | static | all | top bar |
| target | host/container | host | all | top bar |
| serverName | hostname | example.com | all | Site |
| wwwRedirect | off / to-apex / to-www | off | all | Site |
| documentRoot | abs path | host `/var/www/example.com/public`, container `/usr/share/nginx/html` | static/spa/php | Site |
| upstreams | list of `host:port` or `unix:/abs.sock`, each with `backup` bool | proxy `127.0.0.1:3000`; php host `unix:/run/php/php-fpm.sock`, container `127.0.0.1:9000` | php/proxy | Site |
| https | off / manual / acme | off | all | HTTPS |
| certificatePath, certificateKeyPath | abs path | `/etc/nginx/tls/<serverName>/fullchain.pem` etc. | https=manual | HTTPS |
| acmeEmail | email | empty (required when acme) | https=acme | HTTPS |
| acmeStaging | bool | false | https=acme | HTTPS |
| tlsProfile | intermediate / modern | intermediate | https≠off | HTTPS |
| hsts | off / host / subdomains / preload | off | https≠off | HTTPS |
| http3 | bool, experimental | false | https≠off | HTTPS |
| gzip | bool | true for static/spa, false for php/proxy (BREACH) | all | Performance |
| gzipLevel | 1..9 integer | 1 | gzip | Performance (advanced) |
| gzipStatic | bool | true for static/spa | static/spa/php | Performance |
| immutablePaths | list of URI prefixes `^/[A-Za-z0-9._~/-]*/$` | spa `/assets/`, php `/build/`, static none | static/spa/php | Performance |
| openFileCache | bool | false | static/spa/php | Performance (advanced) |
| proxyCache | bool | false | proxy | Performance |
| fastcgiCache | bool | false | php | Performance |
| accessLogBuffer | bool | false | all | Performance (advanced) |
| clientMaxBodySize | `^[1-9][0-9]{0,4}[km]$` | php `16m`, else `1m` | all | Security |
| frameOptions | off / sameorigin / deny | sameorigin | all | Security |
| contentSecurityPolicy | header-safe string, empty = off | empty | all | Security (advanced) |
| cspReportOnly | bool | false | CSP set | Security (advanced) |
| permissionsPolicy | bool | false | all | Security |
| crossOriginOpenerPolicy | off / same-origin-allow-popups / same-origin | off | all | Security (advanced) |
| rateLimit | off / on / dry-run | off | php/proxy | Security |
| rateLimitRate | integer r/s 1..10000 | 10 | rateLimit≠off | Security |
| rateLimitBurst | integer 0..10000 | 20 | rateLimit≠off | Security |
| connLimit | integer 0..10000, 0 = off | 0 | all | Security (advanced) |
| realIp | off / cloudflare / custom | off | all | Security |
| trustedProxies | list of CIDR (reject /0) | empty | realIp=custom | Security |
| realIpHeader | X-Forwarded-For / X-Real-IP / proxy_protocol | X-Forwarded-For | realIp=custom | Security |
| loadBalancing | round-robin / least-conn / hash-ip | round-robin | proxy with ≥2 upstreams | Proxy |
| websocketPath | URI prefix or empty | empty | proxy | Proxy |
| streamingPath | URI prefix or empty | empty | proxy | Proxy |
| proxyReadTimeout | integer seconds 1..3600 | 60 | proxy | Proxy (advanced) |
| upstreamTls | bool | false | proxy | Proxy (advanced) |
| httpPort, httpsPort | port | host 80/443, container 8080/8443 | all | Advanced |
| publicHttpsPort | port | 443 | https≠off | Advanced |
| ipv6 | bool | true for host, false for container | all | Advanced |
| workerConnections | integer 512..65535 | host 4096, container 1024 | all | Advanced |
| workerUser | token | `nginx` | target=host | Advanced |
| resolver | space-separated IP list | host `127.0.0.53`, container `127.0.0.11` | needed by acme or hostname upstreams | Advanced |
| statusEndpoint | bool | false | all | Advanced |

Rules:
- Unknown keys are rejected. Every string goes through the existing
  directive-safe validators; header values use a dedicated validator (allow
  `;`, `'`, `(`, `)`, spaces; reject `"`, `\`, `$`, `{`, `}`, control chars).
- `defaultsFor(profile, target)` drives preset switching. Switching profile or
  target keeps fields the user changed when they still apply (UI concern).
- Keep the hardening validations from `lib/config.js`: loopback upstream on the
  NGINX listen port, unspecified addresses, IPv6 parsing, hostile JSON keys.

### Renderer behavior (defaults, all versions ≥ 1.30.5 unless noted)

Main/events:
- `worker_processes auto;` `worker_connections <n>;`. Host: `user <workerUser>;`,
  `pid /run/nginx.pid;`, `worker_rlimit_nofile <2n>;` (nginx docs: connections
  are bounded by open files; [top10] #1). Container: `pid /tmp/nginx.pid;`, no
  rlimit (the runtime sets limits).
- ACME: `load_module modules/ngx_http_acme_module.so;` first line after comments.

http globals:
- Keep: `sendfile on; tcp_nopush on;` `server_tokens off;` timeouts
  `client_header_timeout 15s; client_body_timeout 60s; send_timeout 60s;
  reset_timedout_connection on;` (comment why each differs from default),
  `include mime.types; default_type application/octet-stream;`.
- Remove restated defaults (A11): `tcp_nodelay`, `sendfile_max_chunk`,
  `keepalive_requests`, `ignore_invalid_headers`, `underscores_in_headers`,
  `merge_slashes`, `proxy_http_version 1.1`, `Connection ""`, upstream
  `keepalive 32` (1.29.7 default `keepalive 32 local` already applies), repeated
  server `error_log`, `fastcgi_index` in regex location, `gzip on` in children.
  Docs explain where these went.
- `keepalive_timeout 65s` → keep NGINX default (75s); omit.
- New default-on: `absolute_redirect off;` (B1), `add_header_inherit merge;`
  (B2: headers once at server level; children add only their own headers and
  never redefine a server header), `$request_id` in the log format and passed
  upstream (B5).
- Container target keeps the `/tmp` temp paths; host target omits them.
- Log format without query strings (keep), add `rid=$request_id`. Host:
  `access_log /var/log/nginx/access.log main [buffer=32k flush=5s];`
  `error_log /var/log/nginx/error.log warn;`. Container: stdout/stderr.

TLS (https≠off), at http level:
- intermediate: `ssl_protocols TLSv1.2 TLSv1.3;` + current Mozilla v6.0 cipher
  list + `ssl_prefer_server_ciphers off;`. modern: `ssl_protocols TLSv1.3;` and
  no cipher list.
- `ssl_session_cache shared:SSL:10m; ssl_session_timeout 1d;` (Mozilla v6.0),
  `ssl_session_tickets on` omitted (default on; 1.23.2+ rotates keys).
- Do not set `ssl_ecdh_curve` (auto prefers X25519MLKEM768 on OpenSSL 3.5). Do
  not emit stapling, dhparam, early data (default off; omit and document).
- manual: `ssl_certificate/_key` in the app server.
- acme: `resolver <resolver> valid=300s ipv6=<on|off>;`, `acme_issuer
  letsencrypt { uri <prod|staging>; contact <email>; state_path
  /var/cache/nginx/acme-letsencrypt; accept_terms_of_service; }`,
  `acme_shared_zone zone=ngx_acme_shared:1M;`, server: `acme_certificate
  letsencrypt; ssl_certificate $acme_certificate; ssl_certificate_key
  $acme_certificate_key; ssl_certificate_cache max=2;`. The HTTP listener must
  stay reachable on public port 80.
- `http2 on;` in the TLS app server.
- http3: app server `listen <httpsPort> quic;` (+ `[::]` variant), reject
  server `listen <httpsPort> quic reuseport default_server;` (reuseport once per
  address:port), `add_header Alt-Svc 'h3=":<publicHttpsPort>"; ma=86400' always;`
  at server level, `quic_retry on;`. Warning: experimental, open UDP.
- HSTS: `max-age=63072000` (+ `; includeSubDomains`, + `; preload`) `always`.

Servers (indent correctly, A10):
- Reject server(s): HTTP `listen <httpPort> default_server; return 444;`
  (`[::]` when ipv6). TLS: `ssl_reject_handshake on;` default server.
- HTTP server when https≠off: answers ACME HTTP-01 before redirecting (B8):
  manual → `location ^~ /.well-known/acme-challenge/ { root /var/www/_letsencrypt;
  try_files $uri =404; }` (host) or `/tmp/acme-challenge` (container); acme →
  handled by the module; then `location / { return 308
  https://$host<:publicHttpsPort unless 443>$request_uri; }`. Use the explicit
  `serverName` rather than `$host` in the redirect (Host is already matched).
- wwwRedirect: an extra server for the other name that 301/308s to the
  canonical name on the same scheme (needs a cert covering both names; acme
  issues for both because `server_name` lists both in that server — verify with
  module docs; otherwise list both in the main `server_name`).
- App server: listen lines, `server_name`, TLS, root/index for file profiles,
  `client_max_body_size`, server-level security headers (nosniff,
  Referrer-Policy, X-Frame-Options + CSP `frame-ancestors` merged into the CSP
  header when CSP set, Permissions-Policy short list, COOP, HSTS, Alt-Svc),
  `limit_conn` when set, `/healthz` without `Content-Length` (A5).
- Sensitive files: `location ~ /\.(?!well-known/) { deny all; }` (B10);
  extension deny (`bak|conf|dist|env|ini|log|sh|sql|sw[op]|ya?ml` etc.) only in
  file-serving profiles (A7).
- Static: `location / { try_files $uri $uri/ =404; }`; HTML `no-cache`;
  `immutablePaths` → `location ^~ <prefix> { try_files $uri =404; add_header
  Cache-Control "public, max-age=31536000, immutable"; access_log off; }`
  (replaces the broken regex, A6). gzipStatic → `gzip_static on;` in http.
- SPA: as static, fallback `/index.html`; immutable prefixes never fall back.
- PHP: `location / { try_files $uri $uri/ /index.php$is_args$args; }`,
  `location ~ \.php$ { try_files $uri =404; fastcgi_pass <upstream or
  php_fpm group>; include fastcgi_params; fastcgi_param SCRIPT_FILENAME
  $realpath_root$fastcgi_script_name; fastcgi_param DOCUMENT_ROOT
  $realpath_root; fastcgi_param HTTP_PROXY ""; fastcgi_param
  HTTP_X_REQUEST_ID $request_id; fastcgi_hide_header X-Powered-By; }`
  (`$realpath_root` so atomic symlink deploys work). Rate limit here only.
  fastcgiCache mirrors the proxy cache maps.
- Proxy: `upstream backend { [zone backend 64k;] [least_conn;|hash
  $binary_remote_addr consistent;] server … max_fails=3 fail_timeout=10s
  [backup]; }`; hostname upstreams with `resolve` + zone + resolver.
  `location / { proxy_pass http(s)://backend; proxy_set_header Host $host;
  X-Real-IP $remote_addr; X-Forwarded-For $remote_addr; X-Forwarded-Proto
  $forwarded_proto; X-Forwarded-Host $host; X-Forwarded-Port <public port>;
  X-Request-ID $request_id; clear spoofable headers (keep list);
  proxy_hide_header X-Powered-By; proxy_connect_timeout 5s; proxy_read_timeout
  <n>s; proxy_next_upstream error timeout http_502 http_503 http_504;
  proxy_next_upstream_tries 2; (only when ≥2 upstreams) limit_req …; }`.
  Shared `proxy_set_header` lines go at server level so websocket/streaming
  locations can add theirs without losing them? No — `proxy_set_header`
  inheritance is all-or-nothing; emit the full set in each proxy location via
  one helper.
- websocketPath → separate `location ^~ <path>` with full header set +
  `Upgrade $http_upgrade` + `Connection $connection_upgrade` where the map is
  `default ""; ~*^websocket$ upgrade;` (A1), 1h timeouts, no cache.
- streamingPath → separate location with `proxy_buffering off; proxy_cache off;
  proxy_read_timeout 1h;`. Help text mentions `X-Accel-Buffering: no` instead.
- proxyCache: keep maps, change Vary map to skip only `*`/cookie/authorization
  (A9), add `add_header X-Cache-Status $upstream_cache_status always;`? No —
  leave out (reveals cache state). Keep lock/revalidate/use_stale +
  `proxy_cache_background_update on;`.
- upstreamTls: `proxy_ssl_server_name on; proxy_ssl_verify on;
  proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;` and
  `proxy_ssl_name` = first upstream host.
- realIp: `set_real_ip_from` per CIDR (Cloudflare list or custom),
  `real_ip_header CF-Connecting-IP|…`, `real_ip_recursive on;`, geo+map for
  `$forwarded_proto` trusted only from those proxies; when off,
  `$forwarded_proto` is a `map` default `$scheme` (or just use `$scheme`).
  proxy_protocol adds `proxy_protocol` to listen lines and uses
  `real_ip_header proxy_protocol`.
- statusEndpoint: separate server `listen 127.0.0.1:<8081 or free port>;
  location = /nginx_status { stub_status; allow 127.0.0.1; deny all; }`
  (validate port collision with upstream/listen ports).
- Gzip: `gzip_types` full list from B4, `gzip_vary on; gzip_min_length 1024;
  gzip_comp_level <n>; gzip_proxied off|any` (any only when the user enabled gzip
  on php/proxy, with a BREACH comment). Never compress woff/woff2.

`deploySteps(options)`: short ordered list of `{title, command?, note?}`: where to
put the file, `nginx -t`, reload (`systemctl reload nginx` or `docker run`
with `-p 80:8080 -p 443:8443 [-p 443:8443/udp]`), certbot webroot command for
manual+host, ACME state volume for container, Cloudflare "Full (strict)" note.

`warnings(options)`: experimental HTTP/3, preload hard to undo, CSP breaks
sites if wrong, gzip on dynamic responses (BREACH), rate limit behind CDN
without realIp, IPv6 bind failure, ACME needs port 80 + resolver.

Every emitted non-default directive carries a one-line comment explaining why.
Comments stay short.

### Repo files

- `nginx.conf`, `docker/nginx.conf`, `sites-example/*.conf` regenerated by
  `scripts/generate-examples.mjs` (switch to `.ts` import). Example set:
  static, spa, php, proxy × {http, https manual}, plus `proxy-full.conf`
  (acme + http3 + realIp cloudflare + 2 upstreams + websocket + cache) and
  `container.conf`. Delete `go*.conf`. Keep `no-default.conf`.
- Remove `snippets/` duplicates that contradict the renderer, or regenerate
  them: keep only what docs reference; fix `websocket-proxy.conf` map (A1),
  `protect-sensitive-files.conf` (B10), cache-control regex (A6), `proxy.conf`
  stale lines.
- `Dockerfile`, `scripts/verify-nginx-configs.mjs`, `scripts/check-nginx-version.mjs`
  → new digest from `lib/version.ts`.

### Verification (must pass)

- `node --test tests/*.test.ts`: validator rejects hostile input; snapshot-free
  structural assertions per gap ID (A1 map, A5 no Content-Length, A6 prefixes,
  A10 indentation: every line's indent == 4 × brace depth, B1, B2, B5, B8 ...).
- `scripts/verify-nginx-configs.mjs`: run `nginx -t` in the pinned image for a
  combinatorial matrix (each profile × target × https{off,manual,acme} ×
  representative toggles; all options on at least once; ≤ ~80 configs, batched
  into one container run with a loop to stay fast). Host-target configs run as
  root with `/var/log/nginx` present in the image.
- Existing smoke scripts updated and passing: proxy headers, cache privacy,
  php, tls redirect (now to public port), image.
- New smoke: websocket upgrade through `websocketPath` keeps upstream keepalive
  for normal requests (count backend connections), healthz has no
  Content-Length, HTTP/3 config starts (no client needed).

## Part 2 — Web app (`web/`)

### Stack (latest on 2026-10-01, from npm)

astro 7.3.5, @astrojs/react 7.0.0, react/react-dom 19.3.0, tailwindcss +
@tailwindcss/vite 4.3.3, shadcn CLI 4.21.0 (style new-york, Radix primitives,
pick explicitly), tw-animate-css, lucide-react, @fontsource/ibm-plex-sans +
@fontsource/ibm-plex-mono, oxlint 1.86.0, oxfmt 0.71.0 (+ prettier 3 with
prettier-plugin-astro only for `*.astro`, since oxfmt does not format Astro),
vitest 5.0.3, @playwright/test 1.63.0, wrangler 4.145.0, TypeScript (7.0.2 if
`astro check` works with it, else latest 6.x — record the choice). Node 24.
No `@astrojs/cloudflare` adapter: static output + `assets.directory: ./dist`.

### Pages (SEO)

- `/` — static intro (1 short paragraph, h1), the builder island
  (`client:load`), then a static, indexable "What each option does" reference
  generated at build time from `lib/options.ts` (label, why, NGINX docs link),
  plus a short FAQ. Proper `<title>`, meta description, canonical, Open Graph,
  JSON-LD `SoftwareApplication`, `sitemap.xml` (@astrojs/sitemap), robots.txt.
- `/docs/<slug>` — the repo's `docs/*.md` rendered with an Astro content
  collection (`glob` loader with base `../docs`), relative `.md` links rewritten
  to `/docs/<slug>`. The docs stay in the repo root as the source of truth.

### Builder UX

- Top bar (44px): wordmark `nginx-config` (mono), `NGINX 1.30.5 stable` badge,
  links Docs / GitHub. No hero section.
- Control strip under it: segmented control **What are you serving?**
  (Static · SPA · PHP · Reverse proxy) and **Where does it run?** (Server/VM ·
  Container). These two set defaults.
- Desktop (≥1280): left section nav (Site, HTTPS, Performance, Security, Proxy
  or PHP, Advanced; each with an error dot), middle form, right sticky preview
  (~45%). 1024–1279: form + preview, nav collapses to a top tab row. <1024:
  single column; a sticky bottom bar "Preview nginx.conf · N lines" opens the
  preview in a sheet.
- Form rows: label left, control right, one-line muted help below, an info
  tooltip with the "why" + NGINX docs link; `Experimental` / `Advanced` badges.
  Advanced rows hidden behind a per-section "Show advanced (n)" toggle.
  Inapplicable options are not rendered.
- Lists (upstreams, trusted proxies, immutable paths): compact row editor with
  add/remove buttons.
- Errors: inline under the field; the preview shows the last valid config with a
  banner "Fix 2 errors to update" that links to the fields.
- Preview: header with filename, line count, Copy, Download, Share (copies URL
  with non-default options in the hash, read on load; no server round trip).
  Tabs: `nginx.conf` · `Deploy` (deploySteps) · `Warnings (n)`. Line numbers,
  tiny custom NGINX tokenizer (comments, directive names, variables, strings,
  numbers/units, braces) — no highlight library. Lines added by the last change
  get a subtle marker for ~1.5s.
- Keyboard: all controls reachable; focus visible; `aria` labels; respects
  `prefers-reduced-motion`; light + dark (system, with toggle).

### Visual design

- Neutral gray scale (Tailwind `stone` or `neutral`), one accent (muted green,
  e.g. `oklch(0.52 0.12 150)`), amber warnings, red errors. No gradients, no
  glow, no large shadows (1px borders, at most `shadow-xs` on popovers).
- Radius `--radius: 0.25rem` (4px) everywhere; no pills except tiny badges.
- Type: IBM Plex Sans 14px base, 13px labels/help at 12px; IBM Plex Mono 12.5px
  code. Self-hosted via fontsource (CSP `font-src 'self'`).
- Density: control height 32px (`h-8`), section padding 12–16px, 8px row gaps.
- shadcn components: button, input, label, switch, select, toggle-group, tabs,
  tooltip, badge, separator, textarea, sheet, scroll-area, collapsible, sonner.

### Tooling and quality

- `web/package.json` scripts: `dev`, `build` (`astro check && astro build`),
  `preview`, `lint` (`oxlint` over web/src, ../lib, ../scripts, ../tests),
  `fmt` / `fmt:check` (oxfmt + prettier for .astro), `test:unit` (vitest),
  `test:browser` (playwright against `astro preview`), `deploy`
  (`npm run build && wrangler deploy`), `deploy:dry-run`.
- `web/public/_headers`: keep CSP (`script-src 'self'` — verify Astro emits no
  inline scripts for islands; if it does, use hashes via Astro's CSP support or
  move to `'self'` + hashes), add `Cache-Control: public, max-age=31536000,
  immutable` for `/_astro/*`.
- Unit tests: URL-hash round trip, preset switching, field visibility, the
  tokenizer. Browser tests (Playwright): each profile renders, toggling HTTPS
  updates preview, errors block copy/download, share link restores state,
  mobile sheet opens, no console errors, axe-core accessibility check.
- `.github/workflows/ci.yml`: replace Vue steps (lint, fmt:check, check, unit,
  build, browser), switch renderer tests to `.ts`.

## Part 3 — Docs

README and `docs/*.md` updated to match: new options, target host/container,
removed defaults and why, HTTP/3 status, ACME module, gzip_static available in
the image, realIp, corrected Vite regex claim, LE OCSP end, digest. Keep the
evidence links. Remove claims about the Vue app.

## Work split

1. Renderer implementer (Sonnet): Part 1, then docs (Part 3).
2. Web implementer (Sonnet): Part 2. Starts with scaffold, design system,
   layout, tokenizer, URL state against the schema contract above; wires real
   `lib/options.ts` once Part 1 lands (`lib/` is read-only for this agent).
3. Review: Codex `sol` on the plan (now) and on the finished diff.
