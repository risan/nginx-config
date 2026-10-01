# NGINX Open Source facts, verified 2026-10-01

Method: every claim below comes from a page fetched on 2026-10-01 (curl or
WebFetch). Raw copies of nginx.org pages are saved in `./src/`
(`en_download.html`, `news.html`, `en_CHANGES`, `en_CHANGES-1.30`,
`en_CHANGES-1.28`, `en_security_advisories.html`).

Limits:
- Bash stopped working partway through: the harness refused every command
  because of a worktree-isolation guard. So `docker buildx imagetools inspect`,
  `docker run ... nginx -V` and `openssl version` were **not run**. Docker
  digests come from the Docker Hub v2 API. I fetched it three times, through
  three tags, and got the same index digest each time.
- WebFetch pages pass through a summarizer. Where a value is load-bearing
  (digests, defaults), I fetched it again with a "quote verbatim" prompt.

---

## A. Repo claims checked

| # | Repo claim (location) | Verdict | Evidence |
|---|---|---|---|
| 1 | Stable = **1.30.5** (README:9, docs/research-nginx.md:8, Dockerfile, lib/version.js) | **VERIFIED** | https://nginx.org/en/download.html lists "Stable version … nginx-1.30.5". `CHANGES-1.30`: "Changes with nginx 1.30.5 15 Sep 2026". |
| 2 | Mainline = **1.31.6** (README:10, research:8) | **VERIFIED** | download.html lists "Mainline version … nginx-1.31.6". https://nginx.org/en/CHANGES: "Changes with nginx 1.31.6 15 Sep 2026". |
| 3 | Both released **2026-09-15** (research:9) | **VERIFIED** | https://nginx.org/news.html: "2026-09-15 nginx-1.30.5 stable and nginx-1.31.6 mainline versions have been released". GitHub API (https://api.github.com/repos/nginx/nginx/releases): release-1.31.6 published 2026-09-15T15:34:19Z, release-1.30.5 2026-09-15T15:37:15Z. |
| 4 | CVE-2026-90439 is a buffer overflow in HTTP/3, affecting **1.29.2–1.31.5** and fixed in 1.30.5/1.31.6 (research:30, 206-208) | **VERIFIED, with a missing condition** | https://nginx.org/en/security_advisories.html: "Buffer overflow when using ngx_http_v3_module Severity: medium Advisory CVE-2026-90439 Not vulnerable: 1.31.6+, 1.30.5+ Vulnerable: 1.29.2-1.31.5". CHANGES adds the condition the repo leaves out: it happens "under certain configurations when using HTTP/3 **with OpenSSL 3.5.0 and earlier**". Other 1.30.5 change: "the QUIC transport parameters extension received in an SSL connection is always ignored." |
| 5 | Dockerfile pins `nginx:1.30.5-alpine@sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c` | **WRONG as the current digest.** Whether it is an older valid digest is **UNVERIFIABLE** here (no docker/registry access). | Docker Hub API https://hub.docker.com/v2/repositories/library/nginx/tags/1.30.5-alpine returns `digest: sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94`, `media_type: application/vnd.oci.image.index.v1+json`, `tag_last_pushed: 2026-09-26T19:50:44Z`. `stable-alpine` and `1.30-alpine` return the same digest. Official images are rebuilt when the base image changes, so the repo's digest may be an earlier 1.30.5 build: it could still pull, but it is stale. Run `docker buildx imagetools inspect nginx:1.30.5-alpine` to confirm. |
| 6 | HTTP/3 is "still marked experimental" (research:188, 437) | **VERIFIED** | https://nginx.org/en/docs/http/ngx_http_v3_module.html: "The ngx_http_v3_module module (1.25.0) provides experimental support for HTTP/3." The page https://nginx.org/en/docs/quic.html does not use the word "experimental". |
| 7 | `listen … http2` is deprecated; use `http2 on` (1.25.1) (research:177) | **VERIFIED** | core module `listen`: "The parameter is deprecated, the http2 directive should be used instead." https://nginx.org/en/docs/http/ngx_http_v2_module.html: `http2 on|off`, default `off`, "appeared in version 1.25.1". |
| 8 | `add_header_inherit merge` is available in stable 1.30 (research:237) | **VERIFIED** | Appeared in 1.29.3, so it is in 1.30.0+. Source: https://nginx.org/en/docs/http/ngx_http_headers_module.html |
| 9 | Defaults: `keepalive_requests 1000`, `keepalive_time 1h`, `sendfile_max_chunk 2m`, `tcp_nodelay on` (research:76-77) | **VERIFIED** (first three) | https://nginx.org/en/docs/http/ngx_http_core_module.html. I did not re-check `tcp_nodelay`. |
| 10 | Brotli and Zstd are not NGINX core modules (research:295) | **VERIFIED** | Neither appears in the module list at https://nginx.org/en/docs/. Brotli is packaged only for NGINX Plus (see C.3). |
| 11 | Security-fix list for 1.30.x (research:31-34) | **VERIFIED** | Matches `CHANGES-1.30` and the advisory list (see B). |

The repo's version facts and CVE facts are correct. The stale part is the
image digest. The CVE description also leaves out the "OpenSSL ≤ 3.5.0"
condition, which matters little because the fix is to upgrade either way.

---

## B. Release timeline and 2025-2026 security advisories

Source: https://nginx.org/news.html and https://nginx.org/en/security_advisories.html

| Date | Release | Security fixes |
|---|---|---|
| 2025-02-05 | 1.27.4 / 1.26.3 | CVE-2025-23419 (SSL session reuse across virtual servers with TLS 1.3 SNI). Vulnerable: 1.11.4–1.27.3 |
| 2025-04-23 | **1.28.0** stable | — |
| 2025-08-13 | 1.29.1 (1.28.1 on 2025-12-23) | CVE-2025-53859 (buffer overread in the mail SMTP module) |
| 2026-02-04 | 1.29.5 / 1.28.2 | CVE-2026-1642 (SSL upstream injection). Vulnerable: 1.3.0–1.29.4 |
| 2026-03-24 | 1.29.7 / 1.28.3 | CVE-2026-27654 (dav), CVE-2026-27784 and CVE-2026-32647 (mp4), CVE-2026-27651 and CVE-2026-28753 (mail), CVE-2026-28755 (stream OCSP bypass) |
| 2026-04-14 | **1.30.0** stable | — |
| 2026-05-13 | 1.31.0 / 1.30.1 | CVE-2026-42926 (HTTP/2 proxy injection via `proxy_set_body`), CVE-2026-42945 (rewrite), CVE-2026-42946 (scgi/uwsgi), CVE-2026-42934 (charset), CVE-2026-40460 (HTTP/3 address spoofing), CVE-2026-40701 (resolver use-after-free when `ssl_ocsp` is used) |
| 2026-05-22 | 1.31.1 / 1.30.2 | CVE-2026-9256 (rewrite heap overflow, "potentially resulting in arbitrary code execution") |
| 2026-06-17 | 1.31.2 / 1.30.3 | CVE-2026-42055 (proxy_v2/grpc), CVE-2026-48142 (charset). 1.31.2 also fixes CVE-2026-42530 (HTTP/3 use-after-free, 1.31.0–1.31.1 only) |
| 2026-07-15 | 1.31.3 / 1.30.4 | CVE-2026-42533 (map+regex overflow, **major**, vulnerable 0.9.6–1.31.2), CVE-2026-60005 (slice), CVE-2026-56434 (SSI) |
| 2026-09-15 | **1.31.6 / 1.30.5** | CVE-2026-90439 (HTTP/3 overflow, medium) |

Other releases:
- njs 1.0.1 (2026-09-02) fixes CVE-2026-18329, CVE-2026-78222 and
  CVE-2026-78689.
- nginx-acme 0.4.0 (2026-04-20) adds ACME Renewal Information (ARI).
- The legacy branch is 1.28.3, per download.html.

---

## C. Answers

### C.1 Config-relevant changes in 1.27.x–1.31.x

Sources are https://nginx.org/en/CHANGES plus the directive docs named in each
row. "Since" is the mainline version that introduced the change. Everything
from 1.29.x is in stable 1.30.0 and later.

| Topic | Since | Facts (fetched) |
|---|---|---|
| `add_header_inherit` / `add_trailer_inherit` | **1.29.3** | `on` (default) \| `off` \| `merge`. `merge` "appends values from the previous level". Contexts: http, server, location, if in location. Source: headers module doc. |
| `proxy_http_version` default is now 1.1 | **1.29.7** | CHANGES 1.29.7: "now ngx_http_proxy_module supports keepalive by default; the default value for "proxy_http_version" is "1.1"; the "Connection" proxy header is not sent by default anymore." Proxy doc: "Since 1.29.7, version 1.1 is used by default. Before 1.29.7, version 1.0". Value `2` was added in **1.29.4** (proxy to HTTP/2 backends; needs ngx_http_v2_module). **Doc inconsistency:** the `proxy_set_header` section of https://nginx.org/en/docs/http/ngx_http_proxy_module.html still lists `Default: proxy_set_header Host $proxy_host; proxy_set_header Connection close;`. CHANGES says Connection is not sent by default. Check what a 1.30.5 build actually sends before relying on either. |
| Upstream keepalive on by default | **1.29.7** | Upstream doc: `keepalive connections [local];`, **default `keepalive 32 local;`**. "Since 1.29.7, keepalive connections are enabled by default". The `local` parameter (1.29.7) stops cached connections from being shared across locations. Before 1.29.7, `proxy_http_version 1.1` plus `proxy_set_header Connection ""` were required. The doc example now shows both lines commented out with "# before version 1.29.7". Source: https://nginx.org/en/docs/http/ngx_http_upstream_module.html |
| Upstream `keepalive_requests` / `keepalive_time` / `keepalive_timeout` | unchanged | Defaults 1000 / 1h / 60s. |
| `keepalive_min_timeout` | **1.27.4** | Default `0`. Source: core module doc. |
| `ssl_certificate_cache` | **1.27.4** | `off` \| `max=N [inactive=] [valid=]`, default `off`. Matching `proxy_`, `grpc_` and `uwsgi_ssl_certificate_cache` directives also exist. Static certificates have been cached at start and reload since **1.27.2**. The new directive matters when certificates come from variables (for example ACME). |
| `ssl_object_cache_inheritable` | **1.27.4** | Main context, default `on`. Source: https://nginx.org/en/docs/ngx_core_module.html |
| Upstream `server … resolve` and `resolver` in open source | **1.27.3** | Upstream doc: "Prior to version 1.27.3, this parameter was available only as part of commercial subscription." `resolve` needs the group in a shared-memory `zone` plus a `resolver` (http or upstream level). `service=` (SRV records) is also open source since 1.27.3. |
| `sticky`, `route=`, `drain` in open source | **1.29.6** | Upstream doc: "Prior to version 1.29.6, available only as part of commercial subscription". 1.31.0 adds `--without-http_upstream_sticky_module`. |
| `least_time` in open source | **1.31.0** (mainline only) | Upstream doc. |
| `early_hints` | **1.29.0** | Passes 103 responses from proxy/gRPC backends. A 1.29.1 fix: 103 might be buffered with HTTP/2. A 1.29.8 fix in 103 handling. HTTP/2 docs list `http2_push` as obsolete since 1.25.1, "use early_hints". |
| Encrypted Client Hello | **1.29.4** | `ssl_ech_file file;`. Doc: "supported when using **OpenSSL 4.0 or higher**". CHANGES 1.29.4 originally said "when using OpenSSL ECH feature branch", and 1.29.8 added "OpenSSL 4.0 compatibility". The official alpine image ships OpenSSL 3.5.x (see C.1 PQ row), so **ECH is not usable in the official image**. |
| HTTP/3 status | 1.25.0 | v3 module doc still says "**experimental** support". quic.html recommends OpenSSL 3.5.1+; otherwise a compatibility layer is used that "does not support early data". QUIC is "included in Linux binary packages". |
| `quic_bpf` | old (1.25.0) | Main context, default off, Linux 5.7+, enables connection migration. No change found in 1.27–1.31. |
| `quic_gso`, `quic_retry`, `quic_host_key` | old | Defaults off, off, and a random key per reload. quic.html's example turns on `quic_retry on; ssl_early_data on; quic_gso on; quic_host_key <file>;` and recommends `listen 443 quic reuseport`. |
| QUIC changes | 1.27.5, 1.29.6, 1.31.6 | CUBIC congestion control (1.27.5). Size and rate limits on stateless reset packets (1.29.6, 1.28.3). QUIC transport parameters extension ignored on SSL connections (1.31.6 / 1.30.5). |
| 0-RTT with OpenSSL | **1.29.1** | "support for 0-RTT in QUIC when using OpenSSL 3.5.1 or newer". `ssl_early_data` default stays `off`. |
| `proxy_pass_trailers` | **1.27.2** | Default `off`. |
| `ssl_key_log` | 1.27.2 | **Commercial subscription only** (SSL module doc). Not usable in open source. |
| `ssl_certificate_compression` | **1.29.1** | TLS 1.3 certificate compression **disabled by default** from 1.29.1. New directive, default `off`, needs OpenSSL 3.2+. Since 1.29.3 it is disabled when OCSP stapling is on. |
| `http2 on` | 1.25.1 | Default `off`. `listen … http2` is deprecated. |
| `ssl_stapling` | — | No change to the directive (default off; needs `resolver` and the issuer certificate). Related changes: OCSP stapling and OCSP client-certificate checks in the **stream** module (1.27.2); CVE-2026-28755 (stream OCSP bypass, fixed 1.29.7/1.28.3); CVE-2026-40701 (resolver use-after-free with `ssl_ocsp`, fixed 1.31.0/1.30.1). See C.4. |
| `sendfile_max_chunk` | 1.21.4 | Default `2m` ("Prior to version 1.21.4, by default there was no limit"). |
| `keepalive_requests` (http) | 1.19.10 | Default `1000` (was 100). |
| `keepalive_timeout` (http) | — | Default `75s`. |
| `server_tokens` | — | Default `on`. Values `on\|off\|build\|string` (`string` is commercial per the docs). |
| `listen … multipath` (MPTCP) | **1.29.7** | Linux 5.6+. Doc: "Adding or removing this parameter will also enable the SO_REUSEPORT socket option, which may have its security implications." |
| `reuseport` | — | No change found. |
| `max_headers` | **1.29.8** | Default `1000`. |
| TLSv1 / TLSv1.1 disabled by default | **1.27.3** | `ssl_protocols` default is `TLSv1.2 TLSv1.3`. |
| HTTP/2 and HTTP/3 reject hop-by-hop headers | **1.31.0** (mainline) | Requests with Connection, Proxy-Connection, Keep-Alive, Transfer-Encoding or Upgrade, or a TE header other than "trailers", are rejected. |
| Request-line / Host / `:authority` validated per RFC 3986; bare LF in chunked body is an error | **1.29.4** | — |
| `$request_id` uses SipHash-2-4 | 1.31.2 | — |
| Mainline-only features (not in 1.30) | 1.31.x | Forward proxy / `ngx_http_tunnel_module` (1.31.0), `*_socket_sndbuf/rcvbuf` (1.31.3), PROXY protocol v2 in stream/mail (1.31.4), control API, predicate locations, `ngx_http_json_module`, `client_body_early_read` (1.31.5). |
| `ssl_ecdh_curve` default and post-quantum | — | Default `auto`. In `ngx_ssl_ecdh_curve()` (https://raw.githubusercontent.com/nginx/nginx/master/src/event/ngx_event_openssl.c), `auto` returns `NGX_OK` without calling `SSL_CTX_set1_curves_list`, so OpenSSL's built-in group list applies. OpenSSL 3.5 default (https://raw.githubusercontent.com/openssl/openssl/openssl-3.5/ssl/t1_lib.c): `"?*X25519MLKEM768 / ?*X25519:?secp256r1 / ?X448:?secp384r1:?secp521r1 / ?ffdhe2048:?ffdhe3072"`. So with OpenSSL ≥ 3.5, **`auto` already prefers X25519MLKEM768**. nginx docs do not mention ML-KEM. The official image is built `FROM alpine:3.24` (docker-nginx `stable/alpine-slim/Dockerfile`). Alpine v3.24 `openssl` is **3.5.9-r0** per https://pkgs.alpinelinux.org/package/v3.24/main/x86_64/openssl (built 2026-09-30, after the image push on 09-26, so the image probably has an earlier 3.5.x). **UNVERIFIED:** I could not run `nginx -V` or `openssl version` in the image. Note that OpenSSL 3.5.0 is still exposed to CVE-2026-90439 on older nginx versions. |

### C.2 Official ACME module

- Doc: https://nginx.org/en/docs/http/ngx_http_acme_module.html. The source is
  https://github.com/nginx/nginx-acme (Rust; build needs Rust 1.81+ and nginx
  1.22+ sources). The prebuilt package is **`nginx-module-acme`** from the
  nginx.org repositories. Plus users get `nginx-plus-module-acme`.
  https://nginx.org/en/linux_packages.html: "since version 1.29.1, the
  following module is shipped as a separate package: nginx-module-acme".
- Status: the repo's badge says "stable, usable state and is being actively
  developed". Releases are still 0.x: v0.1.1 (2025-08-12), v0.2.0
  (2025-10-08, adds TLS-ALPN-01), v0.3.0/0.3.1, v0.4.0 (2026-04-20, ARI),
  and v0.4.1 (2026-05-01). Source:
  https://api.github.com/repos/nginx/nginx-acme/releases
- Challenges: `http-01` (default) and TLS-ALPN-01. **No DNS-01.**
- **In the official Docker images:** yes. In the stable `alpine` and `debian`
  Dockerfiles, `ACME_VERSION 0.4.1` and the package list include
  `nginx-module-acme`. Sources:
  https://raw.githubusercontent.com/nginx/docker-nginx/master/stable/alpine/Dockerfile
  and `stable/debian/Dockerfile`. The `alpine-slim` image installs only `nginx`.
  It is shipped as a dynamic module, so you still need
  `load_module modules/ngx_http_acme_module.so;`. The `.so` filename is
  inferred from the module name; I did not check it inside the image.
- Minimal config, quoted from the official doc:

```nginx
resolver 127.0.0.1:53;

acme_issuer example {
    uri         https://acme.example.com/directory;
    contact     admin@example.test;
    state_path  /var/cache/nginx/acme-example;
    accept_terms_of_service;
}

acme_shared_zone zone=ngx_acme_shared:1M;

server {
    listen 443 ssl;
    server_name  .example.test;

    acme_certificate example;

    ssl_certificate       $acme_certificate;
    ssl_certificate_key   $acme_certificate_key;

    # do not parse the certificate on each request
    ssl_certificate_cache max=2;
}

server {
    # listener on port 80 is required to process ACME HTTP-01 challenges
    listen 80;

    location / {
        return 404;
    }
}
```

Other directives: `account_key`, `challenge`, `common_name_in_csr`,
`external_account_key`, `preferred_chain`, `profile`,
`ssl_trusted_certificate`, `ssl_verify`, and `acme_certificate … key=alg`.

### C.3 Brotli / Zstd, and the modules in the official image

- The nginx.org open-source packages
  (https://nginx.org/en/linux_packages.html#dynmodules) ship these dynamic
  modules: `nginx-module-geoip`, `-image-filter`, `-njs`, `-perl`, `-xslt`,
  `-otel` (1.25.3+) and `-acme` (1.29.1+). **There is no brotli or zstd.**
- Brotli exists only as **`nginx-plus-module-brotli`**, which is NGINX Plus
  only (https://docs.nginx.com/nginx/admin-guide/dynamic-modules/brotli/:
  "The Brotli module is exclusive to NGINX Plus"). I found no
  NGINX-maintained zstd package. Third-party sources (for example
  blendbyte/nginx-modules, openSUSE) are not official.
- The official Docker image, stable `alpine` / `debian` (1.30.5), ships
  `nginx-module-xslt`, `-geoip`, `-image-filter`, `-njs` (njs 1.0.1) and
  `-acme` (0.4.1). There is no otel, perl, brotli or zstd; perl is in the
  separate `*-perl` tags. `alpine-slim` ships no dynamic modules.

### C.4 Let's Encrypt OCSP

- https://letsencrypt.org/2024/12/05/ending-ocsp gives these dates:
  - **2025-01-30**: Must-Staple requests fail for new accounts.
  - **2025-05-07**: OCSP URLs dropped from certificates and every Must-Staple
    request fails.
  - **2025-08-06**: OCSP responders turned off.
- https://letsencrypt.org/2025/08/06/ocsp-service-has-reached-end-of-life:
  "Today we turned off our Online Certificate Status Protocol (OCSP)
  service… we will publish revocation information exclusively via
  Certificate Revocation Lists (CRLs)."
- Effect on nginx: Let's Encrypt certificates have no AIA OCSP URL, so
  `ssl_stapling on` does nothing. nginx logs at **warn**:
  `"ssl_stapling" ignored, no OCSP responder URL in the certificate "%s"`
  (from https://raw.githubusercontent.com/nginx/nginx/master/src/event/ngx_event_openssl_stapling.c).
  Recommendation: don't enable stapling by default for Let's Encrypt (or
  ACME-module) certificates. Keep it opt-in only for CAs that still run OCSP.
  Since 1.29.3, stapling also turns off certificate compression.

### C.5 Mozilla TLS recommendations (now TLSRef)

- https://ssl-config.mozilla.org/ now shows only: "Mozilla SSL Config
  Generator has moved to TLSRef Configurator" (https://configurator.tlsref.org/).
- https://wiki.mozilla.org/Security/Server_Side_TLS says the public
  guidelines moved to https://docs.tlsref.org/ (source:
  https://github.com/tlsref/docs).
- The current guideline is **v6.0** ("Remove Old configuration").
  https://ssl-config.mozilla.org/guidelines/latest.json points to 6.0.json.

| | Intermediate (recommended) | Modern |
|---|---|---|
| Protocols | TLSv1.2 TLSv1.3 | TLSv1.3 |
| TLS 1.2 ciphers | `ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305` | none |
| TLS 1.3 suites | TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256 | same |
| Curves / groups | **X25519MLKEM768:X25519:prime256v1:secp384r1** | same |
| Server cipher order | false → `ssl_prefer_server_ciphers off` | false |
| Certificate | ECDSA P-256 (preferred) or RSA 2048 | ECDSA |
| DH | `dh_param_size 2048` (ffdhe2048) in the JSON, but the cipher list has no DHE suites | null |
| HSTS | 63072000 | 63072000 |
| `ocsp_staple` | true (JSON field) | true |
| Max certificate lifetime | 366 days | 90 days |

The nginx output of the generator comes from
https://raw.githubusercontent.com/tlsref/configurator/master/src/js/helpers/nginx.js.
I read it through a summarizer, not verbatim:
- It always emits `ssl_ecdh_curve <curves joined by ':'>`.
- It emits `ssl_prefer_server_ciphers off`.
- For nginx ≥ 1.25.1 it emits `listen 443 ssl;` plus `http2 on;`.
- It emits `ssl_session_cache shared:MozSSL:10m;` and `ssl_session_timeout 1d;`.
  The timeout is commented out when the profile is TLS 1.3 only.
- It emits **`ssl_session_tickets off` only for nginx ≥ 1.5.9 and < 1.23.2**.
  For current nginx it leaves tickets at the default (on), because 1.23.2+
  rotates ticket keys in the shared cache.
- It emits `ssl_dhparam` only when the profile uses DHE. v6 intermediate has
  no DHE ciphers, so in practice there is no dhparam.
- It emits `ssl_stapling on; ssl_stapling_verify on;` plus
  `ssl_trusted_certificate` and `resolver` only when the OCSP option is
  ticked.
- It emits an HSTS `add_header … always`.

For nginx with OpenSSL 3.5, an explicit
`ssl_ecdh_curve X25519MLKEM768:X25519:prime256v1:secp384r1;` matches TLSRef v6.
`auto` gives the same post-quantum preference by inheriting OpenSSL's default
list. An explicit list fails at startup (`SSL_CTX_set1_curves_list failed`)
on OpenSSL < 3.5, which does not know the ML-KEM group (this is an inference
from the nginx code, not tested).

---

## D. Suggested actions for the repo (from the evidence above)

1. Update the Dockerfile digest to
   `sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94`
   (the 1.30.5-alpine index pushed 2026-09-26). First confirm it with
   `docker buildx imagetools inspect nginx:1.30.5-alpine`.
2. Add the "with OpenSSL ≤ 3.5.0" condition to the CVE-2026-90439 text.
3. Remove or explain any `proxy_http_version 1.1` /
   `proxy_set_header Connection ""` boilerplate. It is redundant on 1.29.7+
   (and so 1.30.x), but still harmless.
4. Upstream `keepalive` now defaults to `32 local`.
5. Leave `ssl_stapling` off by default because Let's Encrypt has no OCSP.
6. ECH (`ssl_ech_file`) needs OpenSSL 4.0, which the official image does not
   have.
7. `ssl_key_log` is commercial only.
8. Brotli/zstd: there is no official open-source module.
