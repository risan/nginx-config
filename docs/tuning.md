# Performance tuning

NGINX is already efficient with its defaults. A setting is useful when it
matches a workload and improves a measured result. Keep a before/after record
for throughput, error rate, p50/p95/p99 latency, CPU, memory, open files, and
network and disk I/O. Warm and cold cache runs answer different questions.

The Vue + Vite generator is a separate client deployed through Workers. The
Docker image runs NGINX for mounted user content and a reviewed generated
configuration. The values below are starting points for that runtime, not
universal best settings; test them against the actual site or service.

The [NGINX research baseline](research-nginx.md) and [proxy research
baseline](research-proxy.md) contain the source links behind this guide. This
page is the short operational version.

## Establish the build and baseline

Check the actual binary and the expanded configuration. A file generated for
one package can fail on another package because optional modules and include
paths differ.

```bash
nginx -v
nginx -V 2>&1
sudo nginx -t
sudo nginx -T > /tmp/nginx-expanded.conf
```

Record the NGINX patch version, OpenSSL version, modules, CPU and memory limits,
storage type, kernel, traffic mix, and test tool. Change one related group of
settings at a time, reload gracefully, and keep the old file available for
rollback.

There is no universal fastest value for buffers, timeouts, caches, worker
counts, or compression levels. A synthetic static-file result does not predict
an authenticated proxy or PHP application.

## Workers, connections, and files

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}
```

`worker_processes auto` is a sensible starting point. `worker_connections`
counts client sockets, upstream sockets, and other connections owned by a
worker; a reverse proxy can therefore use roughly two descriptors per active
request. The real ceiling is also the process `RLIMIT_NOFILE` and container
limit. Do not copy a large `worker_rlimit_nofile` value without raising the
service limit and measuring the result.

Inspect descriptor pressure with the service's metrics and error log. If the
limit is reached, fix the matching systemd/container limit, worker limit, and
connection setting as one change. `worker_connections` is capacity, not a
request-rate setting.

Leave NGINX's event-method selection automatic. Explicit `use epoll` is less
portable and normally adds nothing on current Linux. Leave `accept_mutex` and
`multi_accept` at their defaults until an accept-queue benchmark shows a
repeatable improvement. CPU affinity and `reuseport` also need workload proof;
containers, NUMA, and the scheduler can make a copied recipe worse.

## Static files

`sendfile on` is a good starting point for files on a local filesystem.
`tcp_nopush on` can coalesce the first response packets when `sendfile` is in
use. NGINX already enables `tcp_nodelay` for keep-alive connections, so writing
it again is explanatory rather than a new optimization.

```nginx
sendfile on;
tcp_nopush on;
```

Use `try_files $uri =404` for a static tree. For an SPA, use
`try_files $uri $uri/ /index.html` only for application routes; keep an
`/assets/` location on `=404` so a missing JavaScript file does not return HTML.

Give content-hashed assets a long cache lifetime:

```nginx
location /assets/ {
    try_files $uri =404;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

Use `Cache-Control: no-cache` for `index.html`, manifests, and service workers
when a deployment must be discovered promptly. `immutable` is correct only if
the URL changes whenever the bytes change. NGINX already emits validators for
static files; do not disable `ETag` or `Last-Modified` as a speed trick.

The renderer's asset-cache toggle scopes immutable caching to Vite-style hashed
asset names and, for SPAs, keeps `/assets/` on a strict `try_files ... =404`
path. Inspect the generated location and enable it only when every matched URL
is immutable; a missing JavaScript or CSS file must remain a 404.

`open_file_cache` can reduce filesystem metadata work for a large, stable, hot
tree, but it consumes memory and file descriptors and can delay recognition of
replaced or newly created files:

```nginx
open_file_cache          max=10000 inactive=30s;
open_file_cache_valid    60s;
open_file_cache_min_uses 2;
open_file_cache_errors   off;
```

Size it from the hot set and deployment behavior. Keep it off when rapid file
replacement or a small tree matters more than repeated metadata lookups.

For large files, test the actual storage and filesystem before enabling
`aio`, `aio threads`, or `directio`. `directio` changes when `sendfile` is used;
network filesystems, overlay filesystems, range requests, and alignment all
affect the result. See the [core module AIO documentation](https://nginx.org/en/docs/http/ngx_http_core_module.html#aio).

## Compression

Gzip trades CPU for fewer bytes. A conservative text-only starting point is:

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_comp_level 2;
gzip_types
    text/css
    text/javascript
    application/javascript
    application/json
    application/xml
    image/svg+xml;
```

Do not use `gzip_types *`: images, video, archives, and most modern fonts are
already compressed. A higher level can save a few more bytes while increasing
CPU and tail latency; compare bytes, CPU, and p95/p99 before changing it.

The renderer keeps gzip off by default for PHP-FPM, Go, and general proxy
responses. If dynamic gzip is explicitly enabled, restrict it to reviewed
public responses and check for reflected secrets before enabling it;
BREACH makes blanket compression unsafe. Static and SPA profiles can compress
public text assets when their gzip option is selected.

Compressing a response that reflects secrets together with attacker-controlled
input can expose information through the BREACH attack. Avoid dynamic gzip for
such responses. Static public assets do not have that pattern. `gzip_static`
can serve build-produced `.gz` files, but first check `nginx -V` for
`ngx_http_gzip_static_module` in the target package.

Brotli and Zstandard response filters are not NGINX core modules. Do not make a
third-party module a default dependency; add one only when its source,
maintenance, package, and fallback behavior are owned and tested.

## Proxy and upstream traffic

Keep normal proxy response buffering enabled. It lets NGINX read from a backend
quickly and shield it from a slow client. Disable buffering only for a route
that deliberately streams data, and then set a route-specific read timeout and
send heartbeat data before the idle gap expires.

The current stable line uses HTTP/1.1 and an upstream keep-alive cache by
default. Old snippets that present `proxy_http_version 1.1`, an empty
`Connection` header, or a copied `keepalive 32` as a universal speed fix are
stale. Keep such directives explicit only when they document a compatibility
choice or a measured pool size.

Start with the application-aware limits below and change them only from observed
behavior:

```nginx
proxy_connect_timeout 5s;
proxy_send_timeout    60s;
proxy_read_timeout    60s;
```

Send and read timeouts measure the gap between operations, not the complete
request time. A long-poll or SSE route needs a heartbeat or a longer route
timeout; making the global timeout large retains resources for every client.

Use `proxy_next_upstream` retries only for errors/timeouts and only when a
request is safe to retry. Bound retries with
`proxy_next_upstream_tries`/`proxy_next_upstream_timeout` when a multi-server
upstream is used. Do not add `non_idempotent` as a generic option: a sent POST
must not be duplicated without an application-level idempotency design.

Proxy request buffering is useful for ordinary uploads because the backend is
not tied to a slow sender. Set `proxy_request_buffering off` only when the
application deliberately accepts a streaming upload and the loss of retry
ability after forwarding begins.

The renderer's WebSocket, response-streaming, proxy-cache, and rate-limit
switches apply to the generated proxy `location /` or server. If only one URL
needs a behavior, split the configuration into locations and move that setting
there after reviewing the location precedence rules.

WebSockets need the `Upgrade` and mapped `Connection` headers in their own
location. A tunnel is closed after an idle read timeout unless the application
sends ping frames or the location raises that timeout. Do not apply WebSocket
headers to every ordinary HTTP route.

For several backend instances, the default upstream method is round-robin. Add
only the behavior your workload needs and keep retries safe. This is a current
free NGINX Open Source recipe; `zone` shares peer state between workers and
`max_fails`/`fail_timeout` provide passive failure handling:

```nginx
upstream api {
    zone api 64k;
    # least_conn can help when requests have very different durations.
    least_conn;
    server api-1:8080 max_fails=3 fail_timeout=10s;
    server api-2:8080 max_fails=3 fail_timeout=10s;
}
```

These are passive failure observations, not active health checks. `max_conns`,
`backup`, and bounded `proxy_next_upstream_tries`/`proxy_next_upstream_timeout`
are useful only when the backend capacity and retry safety are known. Free NGINX
does not provide NGINX Plus active health checks; use the service's own health
system or an external checker when active probing is required.

For backend names that can change, NGINX Open Source 1.27.3 and later can
refresh upstream peers with `resolve`. The current stable 1.30.5 target meets
that requirement. Put the resolver on a trusted local network; Docker's
127.0.0.11 is only an example:

```nginx
upstream api {
    zone api 64k;
    resolver 127.0.0.11 valid=30s ipv6=off;
    resolver_timeout 5s;
    least_conn;
    server api.service:8080 resolve max_fails=3 fail_timeout=10s;
    server api-backup.service:8080 resolve max_fails=3 fail_timeout=10s;
}

location / {
    proxy_pass http://api;
}
```

Replace the resolver with the local platform resolver and do not trust a public
resolver for private service names. A stale or unavailable resolver can turn a
healthy upstream into request failures; monitor it before using dynamic names.
On older NGINX builds, check the version before using `resolve`; a variable
`proxy_pass` is a compatibility fallback, but its URI replacement rules differ
from a literal `proxy_pass` and must be tested. See the [free upstream module
documentation](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
for the `zone`, `resolve`, and passive-failure semantics.

The listen backlog and socket buffers are operating-system queues, not speed
switches. If connection bursts show an accept queue overflow, measure and raise
the NGINX `listen ... backlog=` together with the OS `net.core.somaxconn`, file
descriptor limits, and container port limits. Compare `ss -lnt`/`ss -s`, SYN
cookies, resets, and tail latency before and after. Leave the OS TCP receive and
send buffers on autotuning unless packet loss or throughput measurements show a
specific problem; changing `net.core.rmem_max`, `net.core.wmem_max`, or
`listen ... rcvbuf/sndbuf` without matching host policy can reduce capacity.

Outbound proxy connections also consume ephemeral ports. If connect failures
show `EADDRNOTAVAIL` or a growing `TIME_WAIT` population, record
`ss -s`, the configured `ip_local_port_range`, worker/upstream connection
counts, and the backend address/port tuples first. Change the range or connection
reuse policy only with the host owner after the measurement shows port pressure;
do not copy a `sysctl` bundle or shorten `TIME_WAIT` as a generic fix.

For TLS responses, NGINX's default `ssl_buffer_size 16k` suits larger transfers.
`ssl_buffer_size 4k` may reduce time to first byte for small dynamic responses,
but increases writes and can reduce bulk throughput. Benchmark both response
sizes before changing it. Kernel TLS (kTLS) is conditional: the NGINX build
needs `--with-http_ssl_module`, its OpenSSL build must expose kTLS support, the
kernel and negotiated cipher must support it; NIC offload is optional. The
certificate/key must still load normally. kTLS does not replace the certificate and private-key setup; the
chain must be valid and the key readable by the NGINX master. Verify `nginx -V`,
`openssl version -a`, kernel TLS support, and the certificate chain on the
target. Only then test the OpenSSL setting
`ssl_conf_command Options KTLS;` in a disposable configuration; omit it when
any prerequisite is missing or when fallback behavior has not been measured.
The [NGINX SSL module documentation](https://nginx.org/en/docs/http/ngx_http_ssl_module.html)
describes `ssl_conf_command`; OpenSSL's configuration support and the kernel
TLS implementation must also be present.

## PHP-FPM and FastCGI

The most valuable PHP safeguard is checking that the requested script exists:

```nginx
location ~ \.php$ {
    try_files $uri =404;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
```

Keep FastCGI request and response buffering on for ordinary pages. Increase
buffers only when the error log shows an oversized upstream header and the
application's header size is understood. Persistent FastCGI connections need
both an upstream `keepalive` cache and `fastcgi_keep_conn on`; they can consume
PHP-FPM capacity, so size them from queue and worker evidence.

FastCGI caching is opt-in. Restrict it to public GET/HEAD responses, bypass
authentication, sessions, carts, and admin paths, respect `Set-Cookie` and
application cache headers, and define invalidation before launch.

## Proxy caching

`proxy_cache` is off by default for a reason. A shared cache is safe only for
responses that the application explicitly allows to be shared. A minimal review
must cover:

- GET and HEAD only;
- a key containing scheme, host, and URI when hosts share a cache zone;
- bypass and no-store rules for authorization and session cookies;
- `Set-Cookie`, `Cache-Control`, and `Vary` handling;
- bounded disk size and inactivity expiry;
- invalidation and stale-content behavior.

`proxy_cache_lock on` can collapse a stampede of identical public misses, but it
does not make a private response safe to share. Never add
`proxy_ignore_headers` to hide a cache-safety signal without an application-level
review.

## TLS and protocol choices

Use TLS 1.2 and TLS 1.3 with the current syntax:

```nginx
listen 443 ssl;
http2 on;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
```

The `http2 on` directive replaces the deprecated `listen ... http2` parameter
on current NGINX. Let the current TLS library choose its defaults unless a
known client or policy requires a tested TLS 1.2 cipher policy. Keep early data
off because a request sent before handshake completion can be replayed.

HTTP/3 is still experimental in NGINX. Treat it as a separate benchmark and
operational project: it needs the module, UDP and TCP listeners, TLS 1.3,
security updates, a persisted protected QUIC key, and a real client test. Keep
TCP fallback working. It is not enabled by the browser generator's normal
profiles.

## Logs and limits

Do not disable access logs to improve a synthetic score. Include request time,
upstream time/status, status, bytes, protocol, and a safe correlation ID. A
buffered log lowers write frequency but can lose the last buffer on a crash.
Never log cookies, authorization, query secrets, or request bodies by default.

Use finite, application-aware request and header limits. Avoid
`client_max_body_size 0` as a generic default. Increase header buffers only for
a measured cookie/header requirement. Test rate and connection limits in
`limit_req_dry_run`/`limit_conn_dry_run` first where available; NAT users,
IPv6 privacy addresses, trusted proxy handling, HTTP/2 streams, and legitimate
bursts make a copied per-IP number unreliable.

## Changes that need proof

| Change | Measure before keeping it |
| --- | --- |
| More workers/connections or open-file limits | Peak concurrency, descriptors, memory, errors |
| Longer keep-alive or upstream pools | Reuse, backend idle capacity, memory |
| Higher gzip level or more MIME types | Bytes saved, CPU, p95/p99 latency |
| Larger proxy/FastCGI buffers | Header errors, per-request memory, tail latency |
| Open-file or response cache | Hit rate, descriptor use, deployment freshness |
| AIO/direct I/O/thread pools | Actual large-file latency and I/O wait |
| Retries, stale cache, or cache bypass rules | Duplicate side effects, privacy, hit rate |
| Rate/connection limits | Dry-run rejects, legitimate traffic, overload behavior |
| HTTP/3, `reuseport`, or CPU affinity | Protocol success, loss, CPU distribution, tail latency |

For a repeatable test plan, use [benchmarking and validation](benchmarking.md).
