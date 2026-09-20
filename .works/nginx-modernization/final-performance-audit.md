# Final performance and security coverage audit

Audit date: 2026-09-20
Scope: free NGINX Open Source 1.30.5; renderer, generated examples, reusable
snippets, Docker baseline, and all user-facing Markdown
Current verdict: **PASS for the audited performance and security scope.**
Audited candidate fingerprint:
`sha256:9bba2faac194b22bc83d98ae6caddaf2c569ab51105a31ec533bfaf880775d45`.

Historical initial verdict: **BLOCK publication until F1 was fixed and
verified.** F2-F5 were bounded documentation/UI correctness work needed to
satisfy the requested coverage; none required turning workload-specific tuning
into global defaults. This initial verdict and its evidence are retained below
to show what failed before the fixes.

## Live baseline

- The official download page lists **1.30.5 stable** and **1.31.6 mainline**:
  <https://nginx.org/en/download.html>.
- The official security page says **1.30.5+ / 1.31.6+** are not vulnerable to
  CVE-2026-90439, the current HTTP/3 buffer-overflow advisory:
  <https://nginx.org/en/security_advisories.html>.
- The exact pinned runtime image digest resolves locally to NGINX 1.30.5 on
  linux/amd64. `nginx -V` reports OpenSSL 3.5.8 at runtime and the file-AIO,
  threads, gzip-static, HTTP/2, and HTTP/3 modules. Optional features still need
  checking on any different deployment package.

## Historical initial findings, in fix order

The line references and failure proof in this section describe the pre-fix
candidate. See the fixed-candidate section near the end for the current result.

### F1 — High — TLS session reuse is configured in the wrong virtual server and is disabled in a way that contradicts the research

Evidence: `lib/config.js:494-505` emits `ssl_session_cache`,
`ssl_session_timeout`, `ssl_session_tickets off`, and `ssl_early_data` only in
the named application server. `lib/config.js:683-690` creates a separate default
TLS server using `ssl_reject_handshake on`. Generated files show the same split,
for example `sites-example/proxy-ssl.conf:82-104`.

NGINX documents that sessions are always resumed from the **default server
context**, so session cache/ticket/timeout directives should be set there or at
`http` scope:
<https://nginx.org/en/docs/http/server_names.html#virtual_server_selection>.
NGINX also documents that a shared cache automatically generates, stores, and
periodically rotates ticket keys since 1.23.2, while `ssl_session_tickets off`
disables ticket resumption:
<https://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_session_cache>.

Failure scenario: repeat clients perform a full TLS handshake instead of
resuming a session. This increases handshake CPU and latency. It is especially
counterproductive for TLS 1.3, where tickets are the resumption mechanism.

Runtime proof against the exact pinned image and an unmodified generated TLS
configuration:

```text
first:  New, TLSv1.2, Cipher is ECDHE-RSA-AES256-GCM-SHA384
second: New, TLSv1.2, Cipher is ECDHE-RSA-AES256-GCM-SHA384
```

The second connection used the first connection's `-sess_out` file through
`openssl s_client -sess_in`; it was still `New`, not `Reused`.

Fix: put the common TLS protocol/cipher/session/early-data policy at `http`
scope when TLS is selected (or in the default TLS server), keep certificate/key
paths in the named server, and allow ticket resumption with the shared cache's
automatic key rotation. If explicit multi-instance ticket keys are later used,
document distribution and rotation separately. Update `snippets/directive/ssl.conf`
to agree. Add a runtime regression in `scripts/smoke-tls.mjs` that makes a second
TLS 1.2 connection with the saved session and requires `Reused`; also exercise
TLS 1.3 resumption if the client harness can reliably wait for the ticket.

The source and docs must choose one TLS 1.2 cipher policy. The renderer currently
hard-codes an AEAD-only list, while `docs/research-nginx.md:141-147`,
`docs/tuning.md:250-253`, and `docs/security.md:99-103` say to let current TLS
library policy choose unless a tested compatibility policy requires otherwise.
Keeping the AEAD-only list can be a deliberate security choice, but the docs
must say so and the actual OpenSSL/client matrix must test it. Removing the list
would align with the existing prose but would accept the broader NGINX default
`HIGH:!aNULL:!MD5` policy.

### F2 — Medium — “Streaming responses” silently disables request buffering

Evidence: the UI calls the choice “Streaming responses” and describes SSE and
streamed output at `web/src/App.vue:420-425`. The renderer emits both
`proxy_buffering off` and `proxy_request_buffering off` at
`lib/config.js:633-636`.

Failure scenario: enabling SSE also begins forwarding uploads before their full
body is received, tying up the backend and removing retry/failover after body
forwarding starts. That is an independent choice from response streaming.
NGINX documents this consequence here:
<https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering>.

Fix: keep `proxy_request_buffering on` for the response-streaming toggle. Add a
separate concise manual upload-streaming recipe to the tuning/proxy docs, or a
separate UI option only if product scope warrants it. Keep cache off and the
route-specific read timeout for response streams.

### F3 — Medium — Multi-upstream balancing, dynamic DNS, and free passive health behavior are not covered

Evidence: `docs/research-proxy.md:32-104` covers one backend, headers,
buffering/retries/cache, and `docs/tuning.md:155-195` does likewise. Neither gives
a working multi-server recipe or explains round robin, `least_conn`, shared
state, `max_fails`/`fail_timeout`, or `resolve`. The generator accepts hostnames
but does not tell users that a hostname without `resolve` is resolved when the
configuration loads.

Failure scenario: a container/service DNS record changes and NGINX keeps the old
address until reload; or users copy commercial active-health examples into free
NGINX. With one upstream server, `max_fails` and `fail_timeout` are ignored.

Fix: add a compact measured opt-in section to `docs/tuning.md` or
`docs/research-proxy.md`, using the deployment's trusted resolver, for example a
shared upstream zone with two `server ... resolve` entries. Explain:

- weighted round robin is the safe default; `least_conn` helps only when request
  duration varies and should be measured;
- `zone` shares upstream state between workers;
- `max_fails`/`fail_timeout` provide passive failure handling and do not help a
  one-server group;
- `resolver`/`resolve` became free OSS functionality before this baseline, must
  point to trusted deployment DNS, and obeys DNS TTL unless overridden;
- bound retries and do not opt non-idempotent requests into generic retry;
- periodic active `health_check` remains NGINX Plus-only.

Official references:
<https://nginx.org/en/docs/http/ngx_http_upstream_module.html> and
<https://nginx.org/en/docs/http/ngx_http_upstream_hc_module.html>.

### F4 — Medium — OS and listen-queue tuning is absent from the otherwise broad guide

Evidence: the guides correctly couple `worker_connections` with descriptor
limits (`docs/tuning.md:34-60`) and warn against unproved `reuseport`, but there
is no section for listen backlog, `somaxconn`, SYN backlog, ephemeral ports for
upstream churn, socket auto-tuning, or NIC queue saturation.

Failure scenario: operators raise NGINX connection counts while the service
file limit or kernel listen queue remains the bottleneck, or paste oversized
socket/sysctl values that waste memory and harm latency.

Fix: add a short OS checklist, not universal sysctl values:

- inspect accept queue overflow/SYN backlog before changing `listen backlog` and
  keep it consistent with `net.core.somaxconn`/`tcp_max_syn_backlog`;
- raise systemd/container `LimitNOFILE`, `worker_rlimit_nofile`, and
  `worker_connections` together from measured descriptor use;
- inspect `TIME_WAIT`, connection reuse, and `ip_local_port_range` before
  changing ephemeral-port policy; keep upstream keepalive as the first remedy;
- keep Linux TCP receive auto-tuning and default socket buffers unless bandwidth-
  delay measurements prove a ceiling;
- inspect NIC RSS/RPS/IRQ distribution only when CPU/softirq imbalance is real;
- do not present congestion control, huge socket buffers, `tcp_tw_reuse`, or
  copied cloud sysctl bundles as NGINX defaults.

Official Linux references:
<https://kernel.org/doc/html/latest/networking/ip-sysctl.html> and
<https://docs.kernel.org/networking/scaling.html>.

### F5 — Medium — TLS performance tradeoffs requested for coverage are missing

Evidence: the TLS guide covers protocols, session cache, HTTP/2, HTTP/3, early
data, OCSP, and HSTS, but does not mention `ssl_buffer_size` or conditional
kernel TLS. The large-file section covers AIO/direct I/O/thread pools only for
plain file I/O.

Fix: add measured opt-in notes, without enabling either by default:

- the 16 KiB `ssl_buffer_size` default minimizes bulk-response overhead; 4 KiB
  can improve first-byte latency at the cost of more TLS records/calls, so test
  the real response mix;
- kTLS/`SSL_sendfile()` is conditional on Linux, OpenSSL, cipher, kernel, build,
  and runtime support. Treat `ssl_conf_command Options KTLS` as an advanced
  experiment and verify it is active; keep normal TLS fallback.

Official SSL buffer reference:
<https://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_buffer_size>.

### F6 — Low — Documentation has one repeated broken official link and stale implementation wording

`https://nginx.org/en/news.html` returns 404. The correct official URL is
`https://nginx.org/news.html`. Replace it in `docs/research-nginx.md:22,40,50`,
`docs/research-proxy.md:17`, and `docs/security.md:28`.

`docs/research-nginx.md:503-517` still calls several choices features of a
“future generator,” although the Vue generator exists. Rewrite it as current
implementation boundaries. All other extracted non-example external links
returned 2xx/3xx during this audit, and all relative Markdown links in README and
`docs/*.md` resolve to existing paths.

## Initial coverage matrix (historical)

| Area | Current treatment | Judgment |
| --- | --- | --- |
| Workers, event method, descriptors | `worker_processes auto`; portable connection start; event auto-selection; FD coupling; avoids copied affinity/accept settings | Good safe default and measured opt-in coverage |
| Accept fairness, `reuseport`, backlog | `multi_accept`, affinity, and `reuseport` correctly remain measured opt-ins | Backlog/kernel half missing; fix F4 |
| Static socket/file delivery | `sendfile`, bounded `sendfile_max_chunk`, `tcp_nopush`; explains `tcp_nodelay` default and overlay/network-FS caveats | Good |
| Open-file cache and browser cache | Guarded hot-tree recipe; validators retained; immutable only for hashed assets; SPA missing assets stay 404 | Good; deployment-specific manifest/service-worker paths remain manual |
| Compression | Low gzip level, threshold, safe types, `Vary`; dynamic compression explicit with BREACH warning; `gzip_static` recipe; Brotli/Zstd identified as non-core | Good. Pinned image has gzip-static, but portability warning is correct |
| TLS and HTTP/2 | TLS 1.2/1.3, current `http2 on`, shared session cache concept, early data off | Blocked by actual resumption failure F1; add buffer/kTLS note F5 |
| HTTP/3 | Correctly experimental, patched floor, TCP fallback, QUIC key/GSO/retry prerequisites | Good measured opt-in; do not enable by default |
| Proxy keepalive and buffering | Current 1.30 HTTP/1.1/keepalive defaults documented; normal request/response buffering retained; timeouts described as inactivity gaps | Good except response/upload streaming conflation F2 |
| Load balancing, DNS, health | Retry safety covered | Material docs gap F3 |
| Proxy cache | Explicit public-cache opt-in; method/auth/cookie/request/response guards; bounded path, lock, revalidation, stale behavior; runtime privacy smoke | Strong; product invalidation policy still manual by design |
| PHP/FastCGI | Script existence check, standard params, HTTPoxy protection, default buffering, conditional persistent connections/cache guidance | Good; guessed global buffers correctly avoided |
| Large-file AIO/thread pools/direct I/O | Prerequisites and storage/alignment tradeoffs documented | Good measured opt-in |
| Logging/measurement | Safe timing format, buffered-file-log tradeoff, no blanket log disabling, repeatable warm/cold protocol-aware benchmark loop | Good |
| OS/kernel/network | Descriptor coupling only | Material docs gap F4 |
| Obsolete folklore | Removes forced epoll/accept mutex, huge buffers/counts, unlimited body, old HTTP/2 push/syntax, blanket gzip/cache/trust | Strong |

## Initial publication gate (historical)

After the fixes, the minimum fresh evidence is:

1. Second TLS 1.2 connection reports `Reused` against the generated config's
   separate default reject server; TLS 1.0/1.1 still fail and HTTP/2 still works.
2. Response streaming leaves request buffering on; a manual upload-streaming
   recipe states loss of retry after forwarding begins.
3. Every generated profile and TLS variant passes `nginx -t` in the exact pinned
   1.30.5 image; generated examples have no drift.
4. Unit/browser/build, proxy, cache-privacy, PHP, TLS, image, and Compose checks
   pass on the same candidate.
5. External docs link check has no unexpected 4xx/5xx and internal Markdown
   targets resolve.
6. `git diff --check` passes and the release commit/image digest are recorded.

## Fixed-candidate verification

Candidate content fingerprint:
`sha256:9bba2faac194b22bc83d98ae6caddaf2c569ab51105a31ec533bfaf880775d45`.
This is a SHA-256 over the sorted path and file-content hashes of the 66 tracked
or untracked, non-ignored repository files, excluding `.works/` and `.git/`.
The release commit should replace this workspace fingerprint as the durable
identity after commit.

Current verdict: **PASS for the audited performance and security scope.** The
six initial findings are resolved in this candidate. No high- or medium-severity
performance/security gap remains in the renderer, examples, reusable snippets,
or tuning guidance. Workload-specific settings remain measured opt-ins rather
than being presented as universal optimizations.

### Resolution evidence

| Finding | Fixed-candidate evidence | Result |
| --- | --- | --- |
| F1 — TLS resumption/context | `lib/config.js:414-427` puts protocols, the explicit TLS 1.2 AEAD policy, shared cache, rotating tickets, and early-data policy at `http` scope. `lib/config.js:511-515` keeps only certificate/key paths per named server; `lib/config.js:694-705` retains the default TLS reject server. `snippets/directive/ssl.conf:1-13` matches this design. | Resolved |
| F1 — runtime behavior | `scripts/smoke-tls.mjs:129-167` requires ALPN `h2` and a real HTTP/2 204 response. Lines 169-192 require `Reused` for TLS 1.2 and TLS 1.3. Lines 194-214 reject accepted early data and require unknown-SNI handshakes to fail for both protocols. The fresh smoke run passed against the exact pinned image. | Resolved |
| F2 — response/upload streaming | `lib/config.js:642-658` disables response buffering only, keeps `proxy_request_buffering on`, disables cache, and explains that upload streaming is separate. `docs/tuning.md:181-195` states the retry tradeoff; `docs/research-proxy.md:153-158,231-235` matches the implemented boundary. | Resolved |
| F3 — upstream balancing/DNS/health | `docs/tuning.md:202-250` covers round robin, measured `least_conn`, shared zones, passive failure handling, bounded safe retries, free-versus-commercial health behavior, and dynamic `resolve` with a trusted platform resolver. | Resolved |
| F4 — OS/listen/socket tuning | `docs/tuning.md:252-266` ties backlog to measured accept-queue pressure and `somaxconn`, retains TCP buffer autotuning by default, and makes ephemeral-port changes conditional on observed exhaustion. It rejects copied sysctl bundles and unsafe `TIME_WAIT` shortcuts. | Resolved |
| F5 — TLS transfer options | `docs/tuning.md:268-282` explains the 16 KiB/4 KiB buffer tradeoff and treats kTLS as an advanced measured option with build, OpenSSL, kernel, cipher, and certificate prerequisites. It correctly states that NIC offload is optional. | Resolved |
| F6 — links/current wording | Official news links now use `https://nginx.org/news.html`; the research notes describe the implemented generator. The final documentation audit reports 33 local links/anchors and 53 external links checked. | Resolved |

### Fresh focused evidence

- Live official pages still list **1.30.5 stable** and **1.31.6 mainline** on
  2026-09-20. The security advisory lists 1.30.5+ and 1.31.6+ as not vulnerable
  to CVE-2026-90439.
- The pinned image reports NGINX 1.30.5, running OpenSSL 3.5.8, and the file-AIO,
  threads, gzip-static, HTTP/2, and HTTP/3 modules.
- `node --test tests/config.test.mjs`: 14/14 passed.
- `node scripts/generate-examples.mjs --check`: all 12 examples current.
- `node scripts/check-nginx-version.mjs`: `NGINX_VERSION=1.30.5` passed.
- `node scripts/verify-nginx-configs.mjs`: all five profiles, with and without
  TLS, passed `nginx -t` in the exact pinned image.
- `node scripts/smoke-tls.mjs`: real HTTP/2, TLS 1.2/1.3 resumption, early-data
  rejection, HSTS, redirect, and unknown-SNI checks passed.
- A generated response-streaming profile contained `proxy_buffering off`,
  retained `proxy_request_buffering on`, omitted the `off` form, and passed
  `nginx -t` in the exact pinned image.
- The documented two-peer dynamic-DNS recipe, including `zone`, upstream-scope
  `resolver`/`resolver_timeout`, trusted-resolver placeholder, and both
  `server ... resolve` entries, passed `nginx -t` in the exact pinned image.
- The documented `ssl_buffer_size 4k` and
  `ssl_conf_command Options KTLS` experiment parsed successfully in the exact
  pinned image. This proves syntax/build acceptance only; the guide correctly
  requires target-kernel and workload measurements before use.
- `git diff --check` passed after the final fixes.

### Current coverage matrix

| Area | Final treatment | Judgment |
| --- | --- | --- |
| Workers, connections, event method, descriptors | CPU-aware workers; modest connection start; service/container FD coupling; event auto-selection; affinity/accept controls remain measured | Covered |
| Listener/socket fairness and OS queues | `sendfile_max_chunk`, default accept behavior, conditional `reuseport`; backlog/`somaxconn`, TCP autotuning, ephemeral ports, and unsafe sysctl folklore explained | Covered as safe defaults plus measured host opt-ins |
| Static files and browser caching | `sendfile`, `tcp_nopush`, strict `try_files`, SPA asset 404 behavior, validators, hashed immutable assets, guarded open-file cache | Covered |
| Compression and precompression | Low-cost text gzip, threshold and `Vary`, BREACH boundaries, `gzip_static` build check, Brotli/Zstd identified as non-core | Covered |
| TLS and protocols | TLS 1.2/1.3, working shared resumption, automatic ticket rotation, early data off, actual HTTP/2, HTTP/3 kept experimental, buffer and kTLS tradeoffs | Covered |
| Upstreams | Current HTTP/1.1/keepalive behavior, round robin/`least_conn`, shared zones, trusted dynamic DNS, passive failure handling, bounded retry guidance | Covered |
| Proxy buffering and cache | Normal request/response buffering, separate response/upload streaming decisions, timeouts, retry safety, public-cache privacy guards, lock/revalidation/stale tradeoffs | Covered |
| PHP/FastCGI | Script existence and HTTPoxy protection, standard parameters, ordinary buffering, guarded persistent connections and cache guidance | Covered |
| Large-file I/O | AIO, thread pools, and `directio` documented as filesystem/alignment/workload experiments | Covered as measured opt-ins |
| Logs and measurement | Safe timing fields, privacy limits, buffered-log tradeoff, warm/cold repeatable benchmark loop, resource and tail-latency evidence | Covered |
| Obsolete folklore | Forced event methods, blanket accept/socket/buffer/sysctl changes, unlimited bodies, old HTTP/2 syntax, blanket compression/cache/trust removed or rejected | Covered |

This PASS does not claim that every directive should be enabled. It confirms
that the major free NGINX 1.30 performance categories are either represented by
a conservative default, documented as a measured opt-in with prerequisites and
tradeoffs, or deliberately excluded with a clear reason.
