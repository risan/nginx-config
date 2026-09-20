# Final independent configuration security and correctness review

Status: **PASS — no open high- or medium-severity configuration finding**

Reviewed on 2026-09-20 against the delivery brief, the repository research, and
real free NGINX 1.30.5 containers. The review was read-only apart from this
report. One legacy-snippet issue found during the final pass was returned to the
core owner, fixed, and independently retested before this verdict.

## Frozen identity

- Base commit: `9a2acdc327f6c2cea42540653768043b4cde99c6`
- `lib/config.js` SHA-256:
  `c375fc4714f00d6ddba1c27c4f30184d5f5ffb986acc73b0e9ebda7633a128b8`
- `snippets/basic.conf` SHA-256:
  `7f8e25abd7e48223e76c480af13c7f0c959eb610aad39cda03ddde21af5f3e52`
- `snippets/location/cache-control.conf` SHA-256:
  `1f20205139081a764ecfc319eb211212f98e2ea9cb1c39dc8cc0e66bb3918ddb`
- `tests/config.test.mjs` SHA-256:
  `2e5c124016abe4d6dbd5329382e28e39d62be66fd8c906e23e049fc441829bcb`
- Core review digest over `lib/`, `tests/config.test.mjs`,
  `scripts/generate-examples.mjs`, `nginx.conf`, `mime.types`, all
  `sites-example/`, and all `snippets/` files:
  `46fc049eed8e5e890409ed46b18ac9bdc9dc440d8e5a0fce3225dafbae6caeee`
- Combined digest of the 12 checked-in examples and all reusable snippets:
  `e264f7b3e5a4e919d095a216e835d19e96f5fc45e31dda3e49248e4b7529b88d`
- Worktree footprint at review: 18 tracked files modified and 15 top-level
  untracked entries. `git diff --check` passed.

The verdict covers the renderer, renderer tests, generated examples, legacy
snippets, and their NGINX behavior. Browser and production-image conclusions
belong to their separate final reviews.

## Finding disposition

| ID | Severity | Original failure | Final disposition |
| --- | --- | --- | --- |
| F1 | High | Non-root read-only startup tried `/var/cache/nginx` | Fixed: every enabled temporary path is under `/tmp`; live UID 101/read-only startup passed. |
| F2 | High | Proxy/Go `.html` requests were handled as local files | Fixed: asset locations are absent from proxy profiles; live `/page.html` reached the backend. |
| F3 | High | A forged RFC `Forwarded` field reached the backend | Fixed: standard and common legacy identity variants are cleared or rebuilt; the live echo backend received no attacker values. |
| F4 | High | Child `add_header` locations lost HSTS | Fixed: generated child locations repeat the option-aware header set; legacy cache locations use `add_header_inherit merge`; live TLS coverage passed. |
| F5 | High | Dynamic responses were gzip-compressed by default | Fixed: PHP/Go/proxy presets default off; explicit opt-in is labeled with BREACH risk; both live modes passed. |
| F6 | Medium | Validation threw on typed input and accepted malformed IPv6 | Fixed: structured failures, complete group checks, compressed IPv6, and IPv4-embedded IPv6 passed the matrix. |
| F7 | Medium | Request `no-cache` did not bypass and request `no-store` could be stored | Fixed: request controls feed both cache bypass and no-cache write guards; live counter tests passed. |
| F8 | Medium | `.well-known` exception exposed more than ACME | Fixed: only the ACME prefix is allowed; other `.well-known` and nested dotfiles were denied live. |
| F9 | Medium | WebSocket mode forwarded arbitrary Upgrade protocols | Fixed: exact case-insensitive WebSocket is normalized; `h2c` is cleared live. |
| F10 | Medium | SPA `^~ /assets/` bypassed sensitive-file regexes | Fixed: ordinary prefix selection lets denial regexes win; live `/assets/.env` and `/assets/config.yml` returned 403. |
| F11 | Medium | Missing assets received one-year immutable caching | Fixed: the immutable header no longer uses `always`; existing asset was immutable and missing asset was 404 without that header. |
| F12 | Medium | Default logs recorded query and Referer secrets | Fixed: logs use method, normalized `$uri`, and protocol and omit Referer; live marker values did not appear. |
| F13 | Low | Gzip level and repeated defaults were presented as universal tuning | Fixed/accepted: gzip uses level 1 and comments describe measurement and intent. |
| F14 | High | Legacy cache regex preceded dotfile denial and child cache headers dropped parent headers | Fixed during final review: protection is included first and both cache locations merge parent headers; live secret denial/header inheritance passed. |

## Repository checks

Commands and results on the frozen identity:

```text
$ sha256sum lib/config.js
c375fc4714f00d6ddba1c27c4f30184d5f5ffb986acc73b0e9ebda7633a128b8  lib/config.js

$ node --test tests/config.test.mjs
tests 14; pass 14; fail 0

$ node scripts/generate-examples.mjs --check
generated examples are up to date (12 files)

$ node scripts/verify-nginx-configs.mjs
PASS static
PASS static TLS
PASS spa
PASS spa TLS
PASS php
PASS php TLS
PASS go
PASS go TLS
PASS proxy
PASS proxy TLS

$ node scripts/smoke-php.mjs
PASS PHP-FPM execution and missing-script denial

$ git diff --check
(no output; exit 0)
```

`verify-nginx-configs.mjs` used the pinned official image
`nginx:1.30.5-alpine@sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c`.
All five profiles parsed in plain HTTP and TLS form.

## Independent validation matrix

A direct ESM matrix called `validateOptions()` and `generateConfig()` for 25
invalid and 13 valid inputs.

Invalid cases covered non-object input, unknown keys, directive injection,
invalid hostnames, non-string and dot-segment paths, upstream schemes, malformed
IPv6, invalid ports, non-boolean toggles, HSTS without TLS, proxy-only features
on static profiles, asset caching on proxy profiles, missing required
upstreams/certificates, and equal HTTP/HTTPS ports.

Valid cases covered all five presets, compressed and IPv4-embedded IPv6,
WebSocket plus proxy cache, streaming plus proxy cache, explicit dynamic gzip,
PHP static-asset caching, and TLS plus HSTS. Every valid configuration was
deterministic and contained neither `undefined` nor an object stringification.
When streaming and cache were both requested, the documented safety precedence
emitted `proxy_cache off` and no active cache directive.

Result:

```text
PASS validation matrix invalid=25 valid=13 deterministic and safe optional precedence
```

## Independent live SPA and static checks

The probe generated a SPA configuration with asset caching, mounted controlled
fixtures, and started the pinned NGINX image with:

```text
--read-only --user 101:101 --cap-drop ALL
--security-opt no-new-privileges:true
--tmpfs /tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777
```

Observed results:

```text
PASS spa-fallback status=200                    (HTML had Cache-Control: no-cache)
PASS hashed-asset status=200                   (one-year immutable; gzip worked)
PASS missing-asset status=404                  (no immutable header)
PASS asset-dotfile status=403
PASS asset-sensitive-extension status=403
PASS nested-dotfile status=403
PASS acme status=200
PASS non-acme-well-known status=403
PASS nonroot-readonly user=101:101 and secret-safe-access-log
```

The log probe requested `?supersecret=1` with a Referer containing
`refsecret=1`; neither marker appeared in container logs.

## Independent proxy and cache checks

An isolated NGINX echo/origin container and two generated edge configurations
ran on a dedicated Docker network. Backend responses included a changing origin
timestamp so cache behavior was observable rather than inferred from generated
text.

Observed results:

```text
PASS proxy html routing and forwarding-header normalization
PASS WebSocket allowlist and arbitrary-upgrade clearing
PASS dynamic gzip default off
PASS proxy cache hit, request no-cache/no-store, auth, cookie, private,
     Set-Cookie, no-store, and Vary guards
PASS explicit dynamic gzip opt-in
```

The forwarding request supplied forged `Forwarded`, `X-Forwarded-*`,
`X-Real-IP`, `X-Forwarded-Ssl`, `X-Url-Scheme`, `Front-End-Https`,
`X-Client-IP`, `Client-IP`, and `Proxy` values. None reached the backend.
Controlled Host, client address, and scheme values did.

Cache assertions distinguished reads from writes:

- a public response produced a stable hit;
- request `no-cache` bypassed the hit without replacing it;
- request `no-store` was neither read from nor written to the shared cache;
- the next ordinary response stored normally;
- Authorization and Cookie requests did not share cached responses;
- upstream private, no-store, Set-Cookie, and Vary responses remained uncached.

## Independent TLS checks

A generated TLS+HSTS SPA configuration ran unprivileged with a disposable
certificate. Results:

```text
PASS fixed-host HTTP 308 redirect
PASS HSTS and safe headers on root, HTML, asset, 404, and health
PASS unknown HTTP Host and TLS SNI rejected
```

The redirect preserved the request URI and used the configured hostname and
HTTPS port. The unknown HTTP server returned 444 behavior, and
`ssl_reject_handshake` rejected an unknown SNI before application handling.

## Legacy snippet and example checks

Every reusable snippet was inspected in context. A combined configuration used
`basic.conf`, the cache and sensitive-location snippets, normal proxy,
WebSocket, FastCGI/PHP, and TLS directive snippets, plus
`sites-example/no-default.conf`. The exact pinned image checked it as UID 101
with a read-only root:

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
PASS every legacy snippet and no-default example in real 1.30.5 contexts as UID 101/read-only
```

A live legacy `basic.conf` server then proved:

- `/.secret.abcdefgh.js` returned 403 even though it also matched the immutable
  asset filename pattern;
- a normal hashed asset returned 200 with immutable caching;
- the normal asset retained the parent `X-Content-Type-Options` header.

The final include order and `add_header_inherit merge` behavior are compatible
with the pinned 1.30.5 baseline.

## Evidence note

Early parallel invocations of the repository proxy/cache/TLS smoke scripts were
discarded because they collided with another active review's Docker names and,
for cache/TLS, attempted the first request before NGINX was ready. They are not
counted as product failures or passing evidence. The unique-container probes
above completed cleanly, removed their resources, and exercised the missing
cases. Readiness hardening was sent to the Docker/CI owner for its separate
final review.

## Final verdict

The frozen renderer, generated configurations, and corrected legacy snippets
pass this security and correctness review. There are no open high- or
medium-severity findings in this scope and no further configuration change is
required.
