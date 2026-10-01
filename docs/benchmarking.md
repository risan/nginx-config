# Benchmarking and validation

A configuration is ready when it is accepted by the deployed NGINX build and
behaves correctly under the traffic it serves. A higher number from a synthetic
benchmark is not enough. Keep the old and new configurations, test the same
content and backend, and compare errors, tail latency, CPU, memory, descriptors,
network bytes, and disk I/O.

The [tuning guide](tuning.md) explains why the settings are opt-in. The
[research notes](research-nginx.md) and [proxy notes](research-proxy.md) link to
the official directive and release documentation.

## Freeze the test

Record these inputs before changing anything:

- NGINX version, nginx -V output, linked TLS library, and enabled modules;
- CPU, memory, file-descriptor, container, and network limits;
- kernel, filesystem, storage path, and base image;
- exact site files, application build, upstream version, and database state;
- request mix, body sizes, cache state, TLS protocol, client count, and duration;
- benchmark tool and its version.

Do not compare a warm cache with a cold cache, HTTP/1.1 with HTTP/2, or a local
backend with a remote backend and call the difference a configuration gain.

## Static checks

Run the failure-capable renderer, type, browser, version, and syntax checks
first. The example check is read-only; it fails if generated files drift:

~~~bash
set -eu
npm ci
npm run typecheck
node --test tests/*.test.ts
node scripts/generate-examples.mjs --check
node scripts/check-nginx-version.mjs
node scripts/verify-nginx-configs.mjs
npm --prefix web ci
npm --prefix web run test:unit
npm --prefix web run build
npm --prefix web exec -- playwright install --with-deps chromium
npm --prefix web run test:browser
git diff --check
~~~

The renderer tests parse the generated text and assert one structural rule per
audit item: indentation equals four spaces per brace level, security headers
appear once per server, immutable assets are plain prefixes, and so on. The
browser app's checks are described in [`web/README.md`](../web/README.md); the
build check catches import and production-bundle failures. Chromium and Linux
system dependencies are required for the browser tests; the install command
above is suitable for a fresh CI runner and may need administrator privileges.

`scripts/verify-nginx-configs.mjs` runs `nginx -t` in the pinned stable image
over about a hundred generated configs in one container: every profile, target,
and HTTPS mode, every option value at least once, and IPv4 and IPv6 QUIC servers
with and without a www alias. It fails on any syntax error. Do not replace these
checks with a successful file write or a single HTTP request.

The runtime smoke scripts start the real image on a private Docker network. Each
takes the image as its argument:

~~~bash
docker build -t nginx-config:local .
sh scripts/smoke-image.sh nginx-config:local     # default site, read-only, non-root, gzip
node scripts/smoke-proxy.mjs nginx-config:local  # identity, keepalive, WebSocket scope, failover, real IP,
                                                 # alias redirect Locations, PROXY-protocol health probe
node scripts/smoke-cache.mjs nginx-config:local  # proxy cache privacy and Vary
node scripts/smoke-php.mjs nginx-config:local    # PHP-FPM, source protection, symlink release, FastCGI cache
node scripts/smoke-static.mjs nginx-config:local # headers once, immutable assets, gzip, gzip_static
node scripts/smoke-tls.mjs nginx-config:local    # redirect to the public port, h2, HSTS, resumption
node scripts/smoke-http3.mjs nginx-config:local  # QUIC listener, a real HTTP/3 request (200 + Alt-Svc), TCP fallback
node scripts/smoke-acme.mjs nginx-config:local   # Pebble: canonical + alias certificates, restart reuses them
node scripts/smoke-resolve.mjs nginx-config:local # backend replaced, new IP, no reload (about 35 s)
~~~

`smoke-http3.mjs` makes the HTTP/3 request with a curl that supports it (the
`ymuski/curl-http3` image by default, `HTTP3_CURL_IMAGE` to change it) and fails
without one; `ALLOW_NO_HTTP3_CLIENT=1` reduces it to the UDP listener and
Alt-Svc checks on a machine that cannot pull a client. `smoke-acme.mjs` pulls `ghcr.io/letsencrypt/pebble`
and its test DNS server, and needs a free private subnet (random 10.x.x.0/24 by
default, `SMOKE_ACME_SUBNET` to set one). `smoke-resolve.mjs` replaces the
backend container behind a Docker network alias and waits for NGINX to follow
the new address by itself (the resolver's `valid=30s` sets the delay).

Run the generated and hand-edited files through the same NGINX package that will
serve them:

~~~bash
nginx -v
nginx -V 2>&1
sudo nginx -t
sudo nginx -T > /tmp/nginx-expanded.conf
~~~

The official free stable image is a useful disposable check when the target
configuration uses the same module set:

~~~bash
docker run --rm --user 0 --entrypoint nginx -v "$PWD:/repo:ro" \
  nginx:1.30.5-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94 \
  -t -c /repo/docker/nginx.conf
~~~

Include, certificate, and log paths must exist in the mounted layout.
The root `nginx.conf` and most of `sites-example/` are made for the server
target (certificate paths under `/etc/letsencrypt`, logs in `/var/log/nginx`),
so test those with the files in place on a host, or generate the container
target.
Use the repository's CI container check when it prepares those paths or when
your target image is different. A syntax test in another image is not proof
that the production package can load the file.

Inspect nginx -T for duplicate directives and unexpected inheritance. A reload
test should prove that a bad candidate is rejected while known-good workers
continue serving traffic:

~~~bash
sudo nginx -t && sudo nginx -s reload
curl -fsS https://example.com/healthz
~~~

## Request matrix

Run a small deterministic matrix before a load test.

| Area | Check |
| --- | --- |
| Static | Existing file, missing file, range request, conditional 304 |
| SPA | Existing asset, missing asset returns 404, application route falls back to index.html |
| Browser cache | Hashed asset is immutable; HTML, manifest, and service worker revalidate |
| Gzip | Selected public static text has gzip and Vary, also with a `Via` header; `.gz` files are served by gzip_static; dynamic profiles stay off unless explicitly reviewed; images/fonts/archives are not recompressed |
| Headers | Each security header appears exactly once on HTML, a hashed asset, a 404, and `/healthz` |
| PHP | Existing script runs; made-up .php returns 404 without reaching FPM; `.PHP` never returns source; a symlink release switch takes effect at once |
| Proxy | Host, scheme, and normalized client address reach the backend; normal requests reuse upstream connections, also on the WebSocket path |
| Proxy failure | Connect/read failure returns the intended error; safe idempotent retry is bounded |
| WebSocket | Upgrade returns 101 and an echo works; idle policy is understood |
| Streaming | First event arrives promptly; heartbeat keeps the route alive |
| Upload | At and above client_max_body_size behave as documented |
| TLS | Intended certificate/SNI and HTTP/2 work; old TLS versions fail |
| Host routing | Unknown Host and SNI never serve application content |
| Security | Dotfiles, backups, source control, and private keys are not public |
| Cache privacy | Authorization/session requests bypass; Set-Cookie is not shared |

Use an echo backend that returns received headers for identity tests. Send
forged X-Forwarded-For, X-Real-IP, Forwarded, and X-Forwarded-Proto values from
an untrusted client and verify that the edge overwrites them. Then test the
trusted-load-balancer path from an allowlisted address
(`scripts/smoke-proxy.mjs` does this with a second NGINX as the trusted hop).
The builder only configures that trust boundary when you list the proxy ranges.

For an HTTPS upstream, test both a valid and invalid certificate. The invalid
case must fail closed when verification is enabled.

## Load tests

Use a tool that can hold the intended protocol and connection pattern, such as
h2load for HTTP/2 or HTTP/3 and wrk/hey for HTTP/1.1. Verify the endpoint status
before loading it, and keep status codes, transport errors, and NGINX error-log
events separate from throughput:

~~~bash
status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' https://example.com/healthz)
case "$status" in 2*|3*) ;; *) echo "health check returned HTTP $status" >&2; exit 1 ;; esac
~~~

Keep the benchmark command and result with the change:

~~~bash
h2load -n 10000 -c 100 -m 10 https://example.com/assets/app.123456.js
wrk -t4 -c100 -d60s https://example.com/
~~~

These values are examples, not capacity recommendations. Start below the
service's known capacity, then increase one dimension at a time. Run enough
repetitions to see tail behavior. Count non-2xx responses, connection resets,
timeouts, and upstream errors explicitly; never treat a client tool error or an
HTTP error response as successful throughput. h2load reports protocol/status
failures; with wrk or hey, pair the run with access-log status counts and the
NGINX error log.

Test more than one workload:

- hot content-hashed static files;
- cold and warm SPA navigation;
- small and large proxy responses;
- authenticated and public proxy responses;
- PHP requests with realistic cookies and headers;
- slow clients, slow upstreams, and concurrent uploads;
- WebSocket and SSE connections when enabled;
- TLS handshakes and keep-alive traffic.

Capture resource evidence while the test runs:

~~~bash
docker stats CONTAINER
ss -s
pidstat -p $(pgrep -o nginx) 1
~~~

Avoid embedding the shell expansion in automation without checking the process
selection. On a host, use the service's metrics and a validated worker PID.
Also record disk I/O and open descriptors. A faster response with exhausted
memory, queued requests, or a growing error log is a regression.

## Tuning loop

1. Establish the baseline and freeze the request matrix.
2. Change one setting or one related group with a written reason.
3. Run syntax, security, and correctness checks.
4. Run the same warm/cold and protocol benchmarks.
5. Keep the change only when the relevant metric improves without unacceptable
   errors, tail latency, memory, descriptor, or privacy regressions.
6. Record the workload, result, and rollback condition next to the change.

Examples of changes that require evidence are larger worker or connection
limits, longer keep-alives, bigger buffers, a higher gzip level, open-file
caching, AIO/direct I/O, upstream retries, public proxy caching, per-IP rate
limits, CPU affinity, reuseport, and HTTP/3.

## Results to retain

A useful result records:

~~~text
date and commit:
nginx -V:
image/package digest:
hardware and limits:
request mix and cache state:
tool and command:
requests, duration, concurrency:
throughput and error count:
p50 / p95 / p99 latency:
CPU / memory / descriptors:
network / disk I/O:
decision and rollback condition:
~~~

Keep the raw output and a short interpretation. A benchmark that cannot be
repeated on the same inputs is a clue, not proof. For high-risk changes such as
cache policy, forwarded identity, TLS, or retries, correctness and isolation
take priority over a small throughput improvement.
