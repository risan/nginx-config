# NGINX configuration toolkit

This repository is a small, copy-and-customize toolkit for the free, open-source
NGINX server. It has a browser configuration builder, readable generated
examples, and a hardened NGINX runtime image for user sites and services. One
renderer and one option schema in [`lib/`](lib/) produce the builder output, the
checked-in examples, and the image's default config, so they cannot drift apart.

The defaults target **NGINX 1.30.5**, the stable release checked on 2026-10-01.
NGINX 1.31.6 is the current mainline release. Keep the stable patch release and
the OpenSSL, zlib, PCRE, base-image, and operating-system packages updated;
there is no single configuration switch that makes every workload faster.

The project covers NGINX Open Source. NGINX Plus features and modules that
nginx.org does not package, such as Brotli and zstd, are outside the default
configuration. See the [NGINX research notes](docs/research-nginx.md) and
[proxy research notes](docs/research-proxy.md) for source links and the
evidence behind the defaults.

## Choose a path

Use the **browser builder** when you want a complete `nginx.conf` from bounded
choices. It runs entirely in the browser: it has no account, API, analytics, or
server-side configuration service. Pick what you serve and where NGINX runs,
review the warnings and deploy steps, then copy or download the file. The app
lives in [`web/`](web/) (Astro) and is deployed with Wrangler as static assets;
see [`web/README.md`](web/README.md).

Use the **checked-in examples** in [`sites-example/`](sites-example/) when you
want a complete file to review and copy. Edit a deployment copy; regenerate the
repository examples from the renderer with `node scripts/generate-examples.mjs`.

### What you serve

| Profile | Use it for |
| --- | --- |
| Static | Files such as HTML, CSS, JavaScript, images, and downloads |
| SPA | A Vite, React, or Vue single-page app with a safe `index.html` fallback |
| PHP | A front-controller PHP application behind PHP-FPM |
| Reverse proxy | Any HTTP application or service (Go, Node, Python, Java, and others) |

The old `go` profile is gone: it differed from the proxy profile only in its
defaults, so Go services use the reverse proxy profile.

### Where NGINX runs

| Target | Ports and paths |
| --- | --- |
| Server or VM | Packages from your distribution or nginx.org. Ports 80 and 443, `user nginx`, PID in `/run`, logs in `/var/log/nginx`, certificates from certbot under `/etc/letsencrypt`. |
| Container | The non-root image. Ports 8080 and 8443, PID and temporary files under `/tmp`, logs to stdout and stderr, certificates under `/etc/nginx/tls`. The container target also produces `docker/nginx.conf`. |

Because a container publishes 8080 as 80, the config also knows the public ports
(`publicHttpPort`, `publicHttpsPort`). Redirects, `X-Forwarded-Port`, and the
HTTP/3 `Alt-Svc` header use the public numbers, and relative redirects
(`absolute_redirect off`) never leak an internal port. Every redirect has a fixed
target: HTTP to HTTPS goes to `https://<name>[:public port]/...` in one hop (also
from the www alias), and the alias with HTTPS off keeps the visitor's scheme and
port (a trusted TLS proxy in front is believed; anyone else is not).

## Browser builder

```bash
npm --prefix web ci
npm --prefix web run dev
```

The builder imports [`lib/options.ts`](lib/options.ts) and
[`lib/render.ts`](lib/render.ts) directly. The renderer rejects unknown fields
and unsafe values; it does not accept raw NGINX directives. Deployment commands
for the app (Wrangler, headers, previews) are in [`web/README.md`](web/README.md).

The renderer, its tests, and the scripts are plain TypeScript that Node 24 runs
without a build step. From the repository root:

```bash
npm ci                                 # TypeScript only, for the type check
npm run typecheck                      # tsc, strict, erasable syntax only
node --test tests/*.test.ts            # structural tests, one per audit item
node scripts/generate-examples.mjs --check
node scripts/check-nginx-version.mjs
node scripts/verify-nginx-configs.mjs  # nginx -t over ~110 option combinations, needs Docker
node scripts/print-config.ts proxy container '{"https":"manual"}'   # inspect one config
```

See [benchmarking and validation](docs/benchmarking.md) for the runtime smoke
tests.

## NGINX runtime quick start

Build and start the NGINX runtime locally with Compose:

```bash
docker compose config
docker compose up --build nginx
```

The image ships a small welcome page, listens on port 8080, and accepts
`Host: localhost`. Unknown hosts receive 444. Check the page and health
endpoint, then stop it with `Ctrl-C` or `docker compose down`:

```bash
curl -i -H 'Host: localhost' http://localhost:8080/
curl -i -H 'Host: localhost' http://localhost:8080/healthz
```

The image is `nginx:1.30.5-alpine`, pinned by index digest
`sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94`
(checked 2026-10-01). It runs OpenSSL 3.5.8 and is built with HTTP/2, HTTP/3,
`gzip_static`, `realip`, `stub_status`, and threads. It also ships the official
ACME module (`ngx_http_acme_module.so`). It has no Brotli or zstd module. The
image contains no Node toolchain or app build.

Mount a reviewed, complete configuration made for the **Container** target, and
the content read-only:

```bash
NGINX_CONFIG=./sites-example/container.conf \
NGINX_CONTENT=./path/to/public \
NGINX_SERVER_NAME=localhost \
docker compose up --build nginx
```

The full file replaces `/etc/nginx/nginx.conf`; the content mount replaces
`/usr/share/nginx/html`. Set `NGINX_SERVER_NAME` to the mounted configuration's
`server_name`. A config made for the Server or VM target will not start in the
non-root image, because it binds port 80 and writes under `/var/log`.

```bash
docker build -t nginx-config:local .
docker run --rm -p 8080:8080 nginx-config:local
```

The container is designed for an unprivileged user. In production keep its root
filesystem read-only, give only `/tmp` writable space, drop capabilities, and
enable `no-new-privileges`; see [operations](docs/operations.md).

The GitHub Actions workflow builds pull requests and `main` without publishing,
then publishes to GHCR only for an exact stable `vMAJOR.MINOR.PATCH` tag or an
explicit manual run using `GITHUB_TOKEN`. Manual runs publish traceable
SHA-derived tags only; tags can move, so only a digest is immutable. They never
move `latest`, major, or minor aliases. This checkout does not publish
automatically. The changed runtime purpose is released as `v3.0.0`; after that
release has a recorded digest, pull it as follows:

```bash
docker pull ghcr.io/risan/nginx-config:3.0.0
# Use the digest recorded after publishing when an immutable reference is needed.
docker pull ghcr.io/risan/nginx-config@sha256:<published-digest>
```

The package may start private. Read back its package visibility after the
workflow and change it deliberately; anonymous pulls work only after it is
public, otherwise authenticate to `ghcr.io` first. Review the workflow under
[`.github/workflows/`](.github/workflows/) before tagging.

## Use a generated configuration

Treat a generated file as a reviewed starting point. The builder's **Deploy**
tab lists the exact steps for your choices. In short:

1. Save the current configuration and record the running build:

   ```bash
   sudo nginx -V 2>&1 | tee /tmp/nginx-build.txt
   sudo cp -a /etc/nginx /etc/nginx.backup.$(date +%Y%m%d%H%M%S)
   ```

2. Put the reviewed file in place and check it with the same NGINX package,
   modules, paths, and user that will run it:

   ```bash
   sudo nginx -t -c /etc/nginx/nginx.conf
   sudo nginx -T -c /etc/nginx/nginx.conf > /tmp/nginx-expanded.conf
   ```

3. Reload only after the test succeeds:

   ```bash
   sudo nginx -s reload
   ```

   A failed reload should leave the old workers serving traffic, but always
   check the error log and a real request after a change.

A generated file is a complete `nginx.conf`. Do not replace `/etc/nginx`
blindly: keep distribution-managed includes you still need, certificate
permissions, log ownership, and module packages. The file includes
`/etc/nginx/mime.types`, so keep that file current.

### HTTPS and certificates

| Choice | How it works |
| --- | --- |
| Off | HTTP only. |
| My own certificate files | You issue and renew the certificate (for example with certbot). NGINX will not start the TLS server without the files, so deploy the config with HTTPS **Off** first, run `certbot certonly --webroot` against the challenge folder, then switch to this choice. The HTTP server (also with HTTPS off, in every profile, and for the www alias) answers `/.well-known/acme-challenge/` from `/var/www/_letsencrypt` (a container: `/var/cache/nginx/acme-challenge`, mounted from the host) before it redirects or proxies. Renewals use the same location. The Deploy tab prints every command. |
| Automatic | The official [NGINX ACME module](https://nginx.org/en/docs/http/ngx_http_acme_module.html) gets and renews Let's Encrypt certificates (HTTP-01 only, no DNS-01). Port 80 must be reachable from the internet and a resolver must work. In a container, mount a persistent volume at `/var/cache/nginx` owned by UID 101. The module is a separate package on a server (`nginx-module-acme`, since NGINX 1.29.1) and is already in the official Docker image. A local test with Pebble covers this path. |

The TLS policy follows the Mozilla/TLSRef guideline v6.0: **Intermediate** is
TLS 1.2 and 1.3 with the current ECDHE AEAD cipher list; **Modern** is TLS 1.3
only. Session tickets and `ssl_prefer_server_ciphers off` are NGINX defaults and
are not restated. `ssl_ecdh_curve` is left on `auto`, so OpenSSL 3.5 already
prefers the post-quantum hybrid group X25519MLKEM768. OCSP stapling is not
generated: Let's Encrypt turned off its OCSP responders on 2025-08-06, so
stapling does nothing for its certificates. There is no `ssl_dhparam` (the
cipher list has no DHE suites) and no early data (0-RTT is replayable and off by
default).

**HTTP/3** is still marked experimental in the NGINX module documentation. It
is built into the image and needs TLS, the QUIC listener, and UDP on the public
HTTPS port (for a container, `-p 443:8443/udp`). Versions before 1.30.5 and
1.31.6 are affected by CVE-2026-90439, which needs OpenSSL 3.5.0 or older, so
keep the patch level current. HTTP/3 cannot be combined with the PROXY protocol.
Keep it off until you have tested a real HTTP/3 client and the TCP fallback.

## Generator options

Options are grouped as the builder shows them. Every option has a one-line help
text, a short "why", and a link to the NGINX or MDN page that backs it; the
[builder](web/) renders the same text from [`lib/options.ts`](lib/options.ts).

| Group | Options |
| --- | --- |
| Site | Domain name, www redirect (to the bare domain or to `www`), files folder, backend servers (several servers, backups, unix sockets) |
| HTTPS | Off, own certificate, or automatic; contact email and staging; TLS policy; HSTS (off, host, subdomains, preload); HTTP/3 |
| Performance | gzip, gzip level, prebuilt `.gz` files (`gzip_static`), immutable asset folders, open file cache, public proxy or FastCGI cache, buffered access log |
| Security | Largest upload, clickjacking protection, Content-Security-Policy (also report-only), Permissions-Policy, Cross-Origin-Opener-Policy, rate limit (on, or dry run), connections per client, real client IP behind a CDN or load balancer |
| Backend | Balancing method, WebSocket path, streaming path, backend read timeout, HTTPS to the backend with certificate checks |
| Advanced | Listen and public ports, IPv6, worker connections and user, DNS resolver, `stub_status` on loopback |

What the renderer does by default, and why:

- **Headers once.** Security headers are set once at server level, with
  `add_header_inherit merge;` (NGINX 1.29.3 and later), so a location that adds
  `Cache-Control` still sends them. The frame-ancestors rule is merged into the
  one `Content-Security-Policy` header.
- **Immutable caching by folder.** Long caching applies only to folders you
  list (the SPA default is `/assets/`), as a plain `location /assets/ { ... }`,
  so the dotfile, sensitive-extension, and `\.php$` rules still win. The old
  "hashed file name" regex was wrong for Vite and Rollup names (a dash, not a
  dot, before the hash) and is gone.
- **Dotfiles and sensitive files.** Dotfiles are denied except `.well-known`
  (security.txt and ACME). Extension rules (`.env`, `.sql`, `.bak`, and others)
  apply only to file-serving profiles, so a proxy site can still serve
  `/openapi.yaml`.
- **Proxy.** Upstream keepalive and HTTP/1.1 are NGINX defaults since 1.29.7, so
  there is no `proxy_http_version`, `Connection ""`, or `keepalive 32`.
  WebSocket and streaming are separate locations with their own headers and
  timeouts; normal requests keep upstream connection reuse. Every location lists
  the full `proxy_set_header` set, because inheritance is all or nothing. A
  request ID (`$request_id`) is logged and sent to the backend and PHP.
- **PHP.** The FastCGI parameters are written out once each, with
  `$realpath_root` so symlink deploys switch atomically. `.php` matches in any
  letter case and the script must exist (`try_files $uri =404`).
- **Rate limit.** Applied to dynamic locations only, never to static files.
  Behind a CDN, set the real client IP or every visitor counts as one client.
- **Real client IP.** Cloudflare (published ranges, copied 2026-10-01), another
  proxy with explicit CIDRs (never `/0`), or the PROXY protocol. Trusted proxies
  may set the client IP and `X-Forwarded-Proto`; anyone else cannot, and a
  malformed value falls back to the real scheme. With the PROXY protocol the
  public listener needs the PROXY header, so the config adds a plain
  `listen 127.0.0.1:<http port>` for health probes (the Dockerfile and Compose
  probes keep working).
- **Compression.** Text is compressed with a full `gzip_types` list. Woff and
  woff2 are never recompressed. `gzip_proxied any` keeps compression and
  `gzip_static` working behind CDNs, which send `Via`. gzip for PHP and proxy
  responses is an explicit opt-in because of the BREACH attack.
- **Dropped defaults.** `tcp_nodelay`, `sendfile_max_chunk`,
  `keepalive_requests`, header-parsing switches, body and send timeouts, and
  the session ticket and early data lines were restated defaults and were
  removed. Each remaining non-default line has a short comment.

The renderer cannot know your identity model, backend TLS CA, upload-streaming
safety, cache invalidation policy, or endpoint capacity. Configure those
deployment-specific policies yourself and test them. Do not trust
`X-Forwarded-For` from arbitrary clients, and do not enable a shared cache for
authenticated responses.

## Safe baseline ideas

The canonical configuration starts with `worker_processes auto`, a portable
`worker_connections` starting point, `sendfile` for ordinary files, buffered
proxy and FastCGI responses, public static text gzip, and long caching only for
folders of hashed files. Match service file limits before increasing connection
capacity. The host target sets `worker_rlimit_nofile` to twice the connection
count. Open-file caches, upstream caches, AIO, large buffers, affinity,
`reuseport` on TCP, and aggressive limits remain measured opt-ins. Keep logs
useful without logging cookies or secrets. See [tuning](docs/tuning.md) and
[benchmarking](docs/benchmarking.md) before changing values globally.

## Important security defaults

Use the newest patched stable NGINX and inspect `nginx -V` so the running build
matches its modules. Run dedicated unprivileged workers, protect private keys,
deny unknown hosts and sensitive files, bound request bodies (`1m` by default,
`16m` for PHP), and hide the version. CSP, HSTS preload, cross-origin policy,
and permissions policy must match the application. For HTTPS upstreams the
builder turns on SNI and certificate verification against an explicit name. For
load balancers trust only exact `set_real_ip_from` ranges.

## Layout

```text
lib/options.ts                option schema, defaults, and validation (one source)
lib/render.ts                 config renderer, deploy steps, and warnings
lib/version.ts                NGINX version and pinned image digest
lib/cloudflare-ips.ts         Cloudflare ranges used by the Cloudflare option
tests/                        renderer and schema tests (node --test)
scripts/                      examples, nginx -t matrix, and runtime smoke tests
nginx.conf + sites-example/   examples produced by the renderer
docker/nginx.conf             the image default (container target, static)
web/                          browser builder (Astro), deployed with Wrangler
snippets/                     small legacy directives, kept in step with the renderer
docs/                         tuning, security, operations, migration, research
Dockerfile / compose.yaml     NGINX runtime image and Compose quick start
```

Keep `mime.types` from the upstream package current when adding a type; do not
replace it with a short hand-written list. Distribution package layouts and
optional modules vary, so validate this repository with the actual image or
package you deploy. The PHP profile accepts `host:port` or `unix:/path` PHP-FPM
addresses; the Debian socket name (`php8.x-fpm.sock`) depends on your PHP
version, so adjust it.

## Further reading

- [Performance and configuration tuning](docs/tuning.md)
- [Security checklist and deployment recipes](docs/security.md)
- [Container, release, and operations guide](docs/operations.md)
- [Benchmarking and validation](docs/benchmarking.md)
- [Migration from the old repository](docs/migration.md)
- [NGINX baseline research](docs/research-nginx.md)
- [Proxy, container, and GHCR research](docs/research-proxy.md)
- [Official NGINX downloads](https://nginx.org/en/download.html)
- [Official NGINX documentation](https://nginx.org/en/docs/)

The project remains under the [MIT license](LICENSE). Historical attribution:
[NGINX documentation](https://nginx.org/en/docs/) and [h5bp server
configs](https://github.com/h5bp/server-configs-nginx); current behavior is
checked against official documentation.
