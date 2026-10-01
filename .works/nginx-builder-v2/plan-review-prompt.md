You are the tech lead reviewing an implementation plan before work starts. Repo: current directory (an NGINX config toolkit + browser config builder). Read `.works/nginx-builder-v2/plan.md` and its evidence files `.works/nginx-builder-v2/research-*.md`, plus the current code it changes (`lib/config.js`, `sites-example/*.conf`, `web/`, `scripts/`, `tests/`, `Dockerfile`).

Target: NGINX Open Source 1.30.5 stable in the official `nginx:1.30.5-alpine` image (OpenSSL 3.5.8; http_v3, gzip_static, realip modules; ships ngx_http_acme_module.so).

Review adversarially. Focus on:
1. NGINX correctness: any directive, context, inheritance rule, or default the plan gets wrong for 1.30.5 (add_header_inherit merge semantics, proxy_set_header inheritance, quic/reuseport, ACME module directives and HTTP-01 handling with a redirect server, realip + geo/map for X-Forwarded-Proto, upstream `resolve`/zone, limit_req placement, fastcgi with $realpath_root, wwwRedirect + certificates, stub_status, absolute_redirect, gzip_static, removed "restated defaults" that are actually NOT defaults).
2. Security regressions vs the current renderer (header injection, validation gaps, unsafe defaults).
3. Scope/UX: options that should be cut or merged to avoid overwhelming users; anything missing that a reverse-proxy/static/PHP user needs most.
4. Feasibility risks in the frontend stack (Astro 7 static + React islands on Workers static assets, CSP with Astro islands, content collection loading ../docs, oxfmt/prettier split, TS 7).
5. Verification gaps.

You run in a read-only sandbox: read files only. Where a claim needs a runtime test, say which `nginx -t` check the implementer must run.

Output: a numbered list of findings, each tagged Blocker / Major / Minor, with the plan section, the problem, evidence (cite nginx.org doc URLs or file:line), and the concrete fix. End with a verdict: APPROVE, APPROVE WITH CHANGES, or REVISE. Be concise; no praise.
