You are the tech lead who signed off on `.works/nginx-builder-v2/plan.md` (including the binding "Revisions after Codex review round 1" R1–R18 and "round 2" R19–R23 sections). The renderer half is now built. Verify the implementation against the plan.

Scope: everything outside `web/` changed since commit `f4f9fa5`: run `git diff f4f9fa5..HEAD -- . ':(exclude)web' ':(exclude).works'` and read `lib/*.ts`, `tests/*.test.ts`, `scripts/*`, `sites-example/*.conf`, `nginx.conf`, `docker/nginx.conf`, `snippets/**`, `Dockerfile`, `compose.yaml`, `.github/workflows/*.yml`, `README.md`, `docs/*.md`.

Target: NGINX 1.30.5 (official alpine image, OpenSSL 3.5.8). Check:
1. Plan items not built, or built differently without a sound reason.
2. NGINX correctness bugs in generated output: directive contexts, inheritance (add_header_inherit merge duplicates, proxy_set_header), location matching order (immutable prefixes vs regex protections, PHP `~*`), listen/quic/reuseport/proxy_protocol combinations, realip/geo/map logic for `$forwarded_proto` / `$forwarded_port` / `$forwarded_port_suffix`, redirect Location values, ACME module usage, upstream `resolve` with in-block resolver, fastcgi param list, gzip/gzip_static, limit_req placement, stub_status port selection, cache bypass/no_cache maps.
3. Validation holes: any string that reaches the output without validation (header injection, `;`, `{`, `$`, newlines, quotes), list items, cross-option rules (R3, R5).
4. Security regressions vs the old `lib/config.js` (see `git show f4f9fa5:lib/config.js`).
5. Tests that do not actually prove what they claim, and missing tests for plan items.
6. Docs claims that contradict the renderer or NGINX docs.

Read-only sandbox: read and reason; cite file:line. Output numbered findings tagged Blocker / Major / Minor with evidence and a concrete fix, then a verdict: APPROVE / APPROVE WITH CHANGES / REVISE. No praise.
