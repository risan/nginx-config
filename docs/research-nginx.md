# NGINX Open Source research baseline

Research checked: **2026-09-20**. This note covers the free, open-source NGINX
server. NGINX Plus-only features are out of scope.

## Current supported target

- The current **stable** release is **1.30.5**. The current **mainline** release
  is **1.31.6**. Both were released on 2026-09-15.
- Use **1.30.5 or newer**. Do not pin the repository to the first release in a
  stable branch, such as `1.30.0`; stable branches receive security fixes.
- Make stable 1.30 the default for this repository. Mainline contains newer
  features and bug fixes, but it changes more often. A user may choose mainline
  after testing it and any third-party modules together.
- Prefer official NGINX packages or the official container image. Pin a full
  version in repeatable deployments and keep an update process; a permanent
  image digest without an update process also becomes stale.

Sources:

- [Official download page](https://nginx.org/en/download.html)
- [Official release news](https://nginx.org/news.html)
- [Official package repositories](https://nginx.org/en/linux_packages.html)
- [NGINX source README: stable gets critical backports; mainline gets current
  features and fixes](https://github.com/nginx/nginx#stable-and-mainline-binaries)

## Security release floor

The latest stable patch is a security requirement, not a cosmetic update.
NGINX 1.30.5 / 1.31.6 fixes **CVE-2026-90439**, a buffer overflow in the
experimental HTTP/3 module. Earlier 1.30 patch releases also fixed issues in
regular expressions used by `map`, slice, SSI, gRPC/proxy v2, charset, rewrite,
HTTP/2 proxying, SCGI/uWSGI, HTTP/3, and OCSP resolver handling. The current
1.30.5 stable release contains all of those core fixes.

The practical rules are:

1. Check the [official security advisory page](https://nginx.org/en/security_advisories.html)
   whenever the pinned version changes.
2. Rebuild deployed images after a fixed NGINX package **and** fixed base image
   libraries are available. NGINX also depends on OpenSSL, zlib, PCRE, and the
   operating system.
3. Load only modules the deployment uses. Dynamic modules, njs, and third-party
   modules have their own update lifecycles. In particular, njs advisories are
   not fixed by changing only an NGINX core version.
4. Record `nginx -V` in diagnostics. It proves the running version, linked TLS
   library, and compile-time modules; a config file alone does not.

Source: [NGINX security advisories](https://nginx.org/en/security_advisories.html)
and the dated [release news](https://nginx.org/news.html).

## Baseline that is safe for most deployments

These settings have a clear effect and do not depend on guessed traffic values.

```nginx
worker_processes auto;

events {
    # Includes client and upstream connections. The operating-system file
    # descriptor limit must be at least this large for each worker. This is an
    # illustrative capacity; calculate the production value from peak load.
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;

    server_tokens off;

    # Efficient for normal files served from local filesystems.
    sendfile   on;
    tcp_nopush on;  # Has an effect only with sendfile.

    # Keep the built-in tcp_nodelay on, keepalive_requests 1000,
    # keepalive_time 1h, and sendfile_max_chunk 2m defaults.

    # Illustrative limit: choose the real value from application requirements.
    # Never use 0 (unlimited) as a generic default.
    client_max_body_size 10m;

    # A shared TLS session cache reduces repeat-handshake CPU work.
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;
}
```

`worker_processes auto` starts with the available CPU count. It is a starting
point, not proof that more workers improve an I/O-heavy or CPU-limited workload.
`worker_connections` includes connections to proxied/FastCGI servers, so a
reverse proxy may consume roughly two connections per active request. Its real
ceiling is also bounded by the worker's open-file limit.

Let NGINX select the event method. Explicit `use epoll;` makes a config less
portable and normally adds no benefit because NGINX already selects the most
efficient available method. Leave `accept_mutex off` on modern Linux and BSD;
the official docs say it is unnecessary with `EPOLLEXCLUSIVE` or `reuseport`.
Leave `multi_accept off` unless a burst-heavy workload demonstrates a gain.

`tcp_nodelay` is already on. Do not repeat it as if that were a modern tuning
change. `sendfile_max_chunk` is already 2 MiB, which prevents one fast file
transfer from monopolizing a worker. Do not restore the old unlimited behavior.

Sources: [core and event directives](https://nginx.org/en/docs/ngx_core_module.html)
and [HTTP core directives](https://nginx.org/en/docs/http/ngx_http_core_module.html).

### File descriptor sizing

Do not paste `worker_rlimit_nofile 65535` without matching the service/container
limit. First measure peak client plus upstream connections and open cached files.
Then make these values agree:

- process/service `RLIMIT_NOFILE`;
- optional `worker_rlimit_nofile`;
- `worker_connections` per worker;
- expected upstream connections and cached open files.

A useful upper bound for client connections is not simply
`worker_processes * worker_connections` when the same worker also opens upstream
and file descriptors. `stub_status` exposes accepted/handled counts; a growing
gap can reveal resource limits. Keep that endpoint on a loopback or protected
management listener.

Source: [worker connection semantics](https://nginx.org/en/docs/ngx_core_module.html#worker_connections)
and [free `stub_status` module](https://nginx.org/en/docs/http/ngx_http_stub_status_module.html).

## TLS and HTTP protocols

### TLS baseline

```nginx
listen 443 ssl;
http2 on;

ssl_protocols TLSv1.2 TLSv1.3;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
```

- TLS 1.2 and 1.3 are already NGINX's protocol defaults. Keep them explicit in
  a teaching template; TLS 1.3 needs OpenSSL 1.1.1 or newer.
- The generator uses a short ECDHE AEAD list for TLS 1.2 compatibility; TLS 1.3
  cipher choice remains with the TLS library. Do not copy old cipher strings
  from tutorials. Test the generated list against the actual OpenSSL build and
  clients, and use the current OpenSSL policy in hand-written configurations
  unless a known compatibility requirement justifies a tested TLS 1.2 policy.
- Keep `ssl_ecdh_curve auto`; it delegates the current curve list to OpenSSL.
- Keep TLS 1.3 early data (`ssl_early_data`) off. NGINX warns that early-data
  requests can be replayed. It is unsafe as a generic switch for login, payment,
  upload, or any state-changing request.
- A shared session cache is the documented efficient cache. Since 1.23.2 it also
  generates and rotates ticket keys when tickets are enabled unless explicit
  ticket key files are used. Multi-instance deployments that explicitly share
  ticket keys must also own secure key distribution and rotation; one permanent
  key is not a safe fleet policy.
- OCSP stapling is an opt-in feature. It needs the issuer chain, a trusted CA
  file, a working resolver, and `ssl_stapling_verify on`. Do not enable it with
  incomplete placeholders and call that secure.
- HSTS is safe only after the domain works entirely over HTTPS. Start without
  `includeSubDomains` or `preload`; those flags affect other hosts and are hard
  to undo. Add the header with `always` only after that operational decision.

Sources: [SSL module](https://nginx.org/en/docs/http/ngx_http_ssl_module.html),
[HTTPS configuration](https://nginx.org/en/docs/http/configuring_https_servers.html),
and [RFC 6797 for HSTS](https://www.rfc-editor.org/rfc/rfc6797).

### HTTP/2

Use the current syntax:

```nginx
listen 443 ssl;
http2 on;
```

`listen 443 ssl http2;` is deprecated. The `http2` directive was added in
1.25.1 and requires `ngx_http_v2_module`; TLS HTTP/2 also requires ALPN. Keep the
default `http2_max_concurrent_streams 128` unless tests show a reason to change
it. Old directives such as `http2_idle_timeout`, `http2_max_requests`,
`http2_max_field_size`, and `http2_max_header_size` are obsolete; their general
HTTP equivalents now cover HTTP/1, HTTP/2, and HTTP/3.

Source: [HTTP/2 module](https://nginx.org/en/docs/http/ngx_http_v2_module.html).

### HTTP/3

HTTP/3 is **available but still marked experimental** by NGINX. Keep it out of
the default configuration and expose it as an advanced opt-in.

Prerequisites and constraints:

- NGINX 1.25.0+ with `ngx_http_v3_module`; official Linux packages include it.
- UDP and TCP listeners on the HTTPS port, normally `listen 443 quic reuseport;`
  plus `listen 443 ssl;`, with `Alt-Svc` advertising HTTP/3.
- TLS 1.3. OpenSSL 3.5.1+ is recommended for full current support; before NGINX
  1.29.1, OpenSSL could not enable 0-RTT through this module.
- `quic_retry on` provides address validation. `quic_gso on` is useful only
  when the Linux kernel and network device support UDP segmentation offload.
- A persisted, protected `quic_host_key` keeps validation tokens valid across
  reloads. The default random key changes on every reload.
- Keep 0-RTT off for the same replay reason as TLS early data.
- Test both TCP fallback and UDP paths. A browser showing HTTP/2 does not prove
  UDP 443 is reachable.

The current stable patch floor matters especially here: CVE-2026-90439 affects
NGINX 1.29.2 through 1.31.5, including stable 1.30.0 through 1.30.4. It is fixed
in 1.30.5 and 1.31.6.

Sources: [HTTP/3 module](https://nginx.org/en/docs/http/ngx_http_v3_module.html)
and [QUIC build/configuration guide](https://nginx.org/en/docs/quic.html).

## Static files and browser caching

A good static baseline is:

```nginx
location /assets/ {
    try_files $uri =404;

    # Use this long lifetime only for content-hashed filenames.
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

- Long-lived `immutable` caching is correct only when a changed file gets a new
  URL, normally a content hash from the build. Do not apply it to `index.html`,
  service workers, manifests, or mutable filenames.
- For HTML entry points use revalidation, for example `Cache-Control: no-cache`,
  rather than a year-long cache. `no-cache` permits storage but requires a check
  before reuse; `no-store` is for content that must not be stored.
- NGINX already generates `ETag` for static responses and supports
  `Last-Modified`. Do not disable validators as an alleged performance tweak.
- `expires` generates both `Expires` and `Cache-Control: max-age`. Remember that
  any `add_header` at a child level changes inheritance. Stable 1.30 supports
  `add_header_inherit merge`, but use it deliberately and keep complete header
  policy close to each server when compatibility matters.

Source: [headers and expiry module](https://nginx.org/en/docs/http/ngx_http_headers_module.html)
[HTTP core ETag behavior](https://nginx.org/en/docs/http/ngx_http_core_module.html#etag),
[RFC 8246 for `immutable`](https://www.rfc-editor.org/rfc/rfc8246), and
[RFC 9111 cache semantics](https://www.rfc-editor.org/rfc/rfc9111).

### Open-file cache

`open_file_cache` is off by default. It can reduce repeated filesystem lookups
for a large, hot static tree:

```nginx
open_file_cache          max=1000 inactive=20s;
open_file_cache_valid    30s;
open_file_cache_min_uses 2;
# Keep missing-file errors uncached when deployments add files in place.
open_file_cache_errors   off;
```

This is an opt-in setting. `max` consumes file descriptors and memory. Cached
metadata can delay visibility of file replacement, permission, or existence
changes until revalidation. Size it from the observed hot file set and deployment
method, and count the descriptors in the process limit.

Source: [open file cache directives](https://nginx.org/en/docs/http/ngx_http_core_module.html#open_file_cache).

### Compression

Dynamic gzip is useful for text but trades CPU for bytes. A conservative option:

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1000;
gzip_comp_level 1;
gzip_types
    text/css
    text/javascript
    application/javascript
    application/json
    application/xml
    image/svg+xml;
```

- Do not use `gzip_types *`; images, video, archives, fonts, and other already
  compressed formats usually waste CPU and may grow.
- Level 1 is the NGINX default. Compare CPU, response size, and tail latency
  before raising it; a higher number is not automatically a better result.
- Do not tune `gzip_buffers` without evidence; the platform-aware defaults are
  usually appropriate.
- For build-generated assets, precompressed `.gz` files move compression work
  out of request handling. `gzip_static on` needs the optional
  `ngx_http_gzip_static_module`; verify with `nginx -V`.
- Do not compress responses that mix secrets with attacker-controlled text over
  TLS. The NGINX docs explicitly warn about BREACH. Static public assets do not
  have that secret-reflection pattern.
- Brotli and Zstandard response filters are not NGINX core modules. Do not make
  an unmaintained third-party module part of the safe default merely to improve
  a benchmark.

Sources: [gzip filter](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)
and [precompressed gzip files](https://nginx.org/en/docs/http/ngx_http_gzip_static_module.html).

### Large-file I/O

Use ordinary `sendfile on` first. `aio`, `aio threads`, `directio`, and custom
output buffers are specialized options for large files or slow storage:

- Linux native AIO requires `directio`; unaligned portions still block.
- `directio` disables `sendfile` for that request.
- `aio threads` needs a build with `--with-threads`; multi-threaded file sending
  is Linux-only and supported only with specific event methods.
- Network filesystems, container overlay filesystems, range requests, and object
  sizes can change the result. Benchmark the actual storage path.

Source: [AIO, direct I/O, and sendfile documentation](https://nginx.org/en/docs/http/ngx_http_core_module.html#aio).

## PHP / FastCGI

The correctness and security baseline matters more than guessed buffer sizes:

```nginx
location ~ \.php$ {
    # Never send a nonexistent script path to PHP-FPM.
    try_files $uri =404;

    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
```

- Keep `fastcgi_buffering on` and `fastcgi_request_buffering on` for ordinary
  pages. These defaults let NGINX read upstream responses promptly and isolate
  the application from slow clients. Disable response buffering only for a
  deliberate streaming endpoint. Disable request buffering only when the app
  must stream uploads and accepts losing retry/failover after sending begins.
- Keep default page-sized FastCGI buffers until logs show `upstream sent too big
  header`. Raising them for every request consumes memory per active request and
  may only hide an oversized application header or cookie.
- Choose connect/read/send timeouts from the application's measured behavior.
  A local PHP-FPM connect should fail quickly, while a valid long-running report
  may need a larger read gap. These directives measure gaps between operations,
  not total request duration.
- A Unix socket can avoid local TCP setup and exposure. TCP is appropriate
  across containers/hosts. The measurable difference is workload-dependent.
- `fastcgi_keep_conn on` is required before upstream keepalive can work, but it
  is not a blanket PHP-FPM optimization. It holds backend connections open, so
  enable and size it only with PHP-FPM connection and queue evidence.
- `fastcgi_cache` is powerful but opt-in. Cache only public GET/HEAD responses,
  bypass authentication/session/cart/admin traffic, respect `Set-Cookie` and
  application cache headers, and use `fastcgi_cache_lock on` to prevent many
  identical misses from hitting PHP at once. Define invalidation before launch.
- Hide implementation headers such as `X-Powered-By` at PHP or with
  `fastcgi_hide_header`; this reduces disclosure but does not replace patching.

Sources: [FastCGI module](https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html),
[upstream keepalive](https://nginx.org/en/docs/http/ngx_http_upstream_module.html),
and [official `try_files` FastCGI example](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files).

## Request hardening and safe operational defaults

Use limits that match application behavior; global copied values can block real
users or fail to stop expensive endpoints.

- Set `client_max_body_size` per server or upload location. Avoid `0`, which
  disables the check.
- Keep header buffers bounded. Increase `large_client_header_buffers` only for a
  measured cookie/header requirement; it limits HTTP/1, HTTP/2, and HTTP/3.
- Use finite header, body, send, FastCGI, and proxy timeouts. Know that the core
  timeout directives measure inactivity between reads/writes, not total duration.
- Preserve `ignore_invalid_headers on`, `underscores_in_headers off`, and
  `merge_slashes on` unless a documented application requirement says otherwise.
- Configure a default server that serves no application content. For TLS, a
  default server using `ssl_reject_handshake on` can reject unknown SNI names.
- Trust forwarded client IP headers only from explicit proxy/load-balancer CIDRs
  using `set_real_ip_from`. Never trust every source; rate limiting and audit
  logs would then be spoofable.
- Protect dotfiles, backups, source-control data, environment files, private
  keys, and application source by deny rules and filesystem permissions. Allow
  only the exact `/.well-known/` paths an ACME flow needs.
- Run workers as a dedicated unprivileged user and keep configuration and key
  material non-writable by that user. In a container, bind a high port if the
  master does not need root/capabilities.
- Use `limit_req` and `limit_conn` only per endpoint after observing dry-run
  results. Set rejection status to 429 where appropriate. NAT, IPv6 privacy,
  trusted-proxy handling, HTTP/2 streams, and legitimate bursts all affect a
  per-IP policy. In HTTP/2 and HTTP/3, each concurrent request counts separately
  for `limit_conn`.
- `server_tokens off` removes the version from the standard `Server` header and
  error pages. Open-source NGINX still identifies itself as nginx; treat this as
  reduced disclosure, not a security boundary.
- Security headers are application contracts. `X-Content-Type-Options: nosniff`
  is broadly safe. HSTS requires an HTTPS-only decision. CSP, frame policy,
  cross-origin policy, referrer policy, and permissions policy must reflect the
  assets and integrations an application actually uses. A strict copied CSP can
  break the site; a permissive one provides little value.

Sources: [HTTP core limits](https://nginx.org/en/docs/http/ngx_http_core_module.html),
[real IP module](https://nginx.org/en/docs/http/ngx_http_realip_module.html),
[request rate limiting](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html),
and [concurrent request limiting](https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html).

## Logging and observability

Do not turn off access logs merely to increase a synthetic throughput number.
They are needed to validate performance and investigate incidents. A buffered
file log reduces write frequency:

```nginx
log_format timed '$remote_addr [$time_iso8601] "$request" $status '
                 '$body_bytes_sent rt=$request_time urt=$upstream_response_time';
access_log /var/log/nginx/access.log timed buffer=32k flush=1s;
```

Tradeoffs: a crash can lose data still in the buffer, and variable log paths do
not support buffered writes. Include request time, upstream time/status, bytes,
protocol, and a safe correlation ID. Never log authorization, cookies, query
secrets, or request bodies by default. Keep `error_log` at `warn` or `error` in
normal production; debug logging is high-volume and may expose sensitive data.

Source: [HTTP log module](https://nginx.org/en/docs/http/ngx_http_log_module.html).

## Settings that need evidence before enabling

| Setting | Why it is not a universal optimization | Evidence needed |
| --- | --- | --- |
| `worker_cpu_affinity` | Containers/cgroups, NUMA, and schedulers change the useful mapping. | CPU saturation and repeatable benchmark improvement. |
| `reuseport` | Creates a listener per worker and has documented security implications if misused. | Accept-queue imbalance or scaling evidence. |
| `multi_accept on` | A worker accepts all waiting connections at once; this can change fairness. | Burst workload comparison with errors and tail latency. |
| Very large `worker_connections` | Consumes file descriptors and connection memory; upstreams count too. | Peak concurrency, memory, and matching OS limits. |
| Short global timeouts | Can reject slow mobile clients and valid uploads/streams. | Endpoint timing and slow-client tests. |
| `open_file_cache` | Uses descriptors and serves cached metadata until revalidation. | Hot-file count, deploy behavior, lower filesystem lookup cost. |
| `gzip_comp_level 5+` | More CPU can increase tail latency for small byte savings. | Compression ratio, CPU, p95/p99 latency. |
| `gzip_proxied any` | May compress personalized or secret-bearing responses. | Data classification and BREACH review. |
| `aio` / `directio` / thread pools | OS, filesystem, alignment, and file size determine the result. | Actual large-file storage benchmark. |
| `fastcgi_cache` | Incorrect keys/bypass rules can leak one user's content to another. | Cache contract, tests, invalidation, auth/session bypass. |
| Rate/connection limits | Per-IP values can punish NAT users and HTTP/2 concurrency. | Dry-run logs and endpoint capacity. |
| HTTP/3 | Still experimental and requires UDP/TLS/module operational support. | Compatibility, fallback, loss/latency, security patching. |
| TLS 0-RTT | Requests can be replayed. | Application-level replay protection and idempotency proof. |

## Obsolete or misleading tuning to remove

- `use epoll;`: automatic event-method selection already handles this.
- `accept_mutex on;`: unnecessary with modern Linux `EPOLLEXCLUSIVE` or
  `reuseport`; default has been off since 1.11.3.
- `tcp_nodelay on;`: already the default. Keeping a commented teaching note is
  enough.
- `sendfile_max_chunk 0;`: restores an old unlimited behavior that can let one
  transfer monopolize a worker.
- Huge `client_header_buffer_size`, `large_client_header_buffers`, proxy, or
  FastCGI buffers copied without an observed error.
- `keepalive_requests 100000`: NGINX warns that excessive values retain
  per-connection allocations; the current default is 1000.
- Old HTTP/2 syntax/directives: use `http2 on` and general core timeout/header
  directives.
- HTTP/2 server push: its directives are obsolete since 1.25.1. Use application
  preload links and consider current `early_hints` only with measured benefit.
- TLS 1.0/1.1, hand-written DH parameters without a DHE requirement, fixed old
  curve lists, and cipher strings copied from dated posts.
- `ssl_session_cache builtin`: it is per-worker and can fragment memory; the
  docs say a shared-only cache is more efficient.
- Blanket `ssl_early_data on`, `gzip_types *`, `client_max_body_size 0`, caching
  all FastCGI output, disabling logs, or trusting arbitrary `X-Forwarded-For`.
- Tuning `connection_pool_size` or `request_pool_size`; NGINX documentation says
  these have minimal performance impact and generally should not be changed.

## Verification contract

Every generated/example configuration should pass these checks before it is
described as ready:

1. **Build identity:** `nginx -v` is at least 1.30.5 and `nginx -V` shows the
   expected SSL library and modules (`http_ssl`, `http_v2`, and only optional
   modules actually selected).
2. **Configuration:** `nginx -t` succeeds inside the same package/container and
   with the same mounted files used at runtime. `nginx -T` is inspected for
   inheritance and duplicate directives.
3. **TLS:** TLS 1.2 and 1.3 handshakes succeed; TLS 1.0 and 1.1 fail. The expected
   certificate chain and SNI host are returned. Unknown SNI/Host does not serve
   an application.
4. **Protocols:** HTTPS negotiates `h2` and still serves HTTP/1.1. If HTTP/3 is
   selected, a real HTTP/3 client succeeds over UDP and TCP fallback still works.
5. **Static caching:** hashed assets have the long immutable policy; HTML and
   service workers do not. Conditional requests return 304 where appropriate.
6. **Compression:** eligible text over the size threshold returns
   `Content-Encoding: gzip` plus `Vary: Accept-Encoding`; images/archives and
   secret-bearing dynamic endpoints do not.
7. **PHP:** an existing script executes; a nonexistent `.php` path returns 404
   without reaching PHP-FPM; uploads at and above the declared limit behave as
   documented; a streaming route is tested if buffering is disabled.
8. **Limits and identity:** forwarded addresses are accepted only from trusted
   proxies. Rate limits run in dry-run first and logs show expected keys.
9. **Reload:** configuration reload is graceful. NGINX checks syntax and opens
   new logs/listeners before replacing workers; failed application leaves the old
   configuration running.
10. **Performance:** compare before/after on the real content mix and full TLS
    path. Record throughput, error rate, p50/p95/p99 latency, CPU, memory, open
    descriptors, network bytes, and disk I/O. Warm and cold cache results must be
    separated. Keep a tuning change only when the relevant metric improves
    without unacceptable regression or errors.

Sources: [command-line checks](https://nginx.org/en/docs/switches.html) and
[graceful configuration reload behavior](https://nginx.org/en/docs/control.html).

## Implementation decisions for this repository

- Target stable NGINX 1.30.5 and current syntax.
- Provide a compact core baseline rather than a file full of magic numbers.
- Make HTTP/2 standard for TLS examples and HTTP/3 an experimental opt-in.
- Separate static, SPA, PHP-FPM, and reverse-proxy examples because caching,
  buffering, retries, and timeouts differ.
- Make long browser caching available only for hashed assets.
- Keep FastCGI/proxy caching off in the base examples and provide guarded,
  clearly labeled opt-in snippets.
- Keep load limits, compression levels, file caches, large-file AIO, OCSP
  stapling, rate limits, and real-IP trust ranges explicit choices. The current
  generator exposes bounded options for selected workload profiles; trusted
  load balancers, upstream TLS, upload streaming, and route-specific policies
  still require manual, tested edits.
- Keep generator warnings and comments concise, and explain *why* a
  non-default directive exists.
