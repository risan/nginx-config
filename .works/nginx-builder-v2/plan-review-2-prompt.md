You are the tech lead doing round 2 of a plan review. Repo: current directory. Your round-1 review is `.works/nginx-builder-v2/plan-review.md`. The plan `.works/nginx-builder-v2/plan.md` now ends with "Revisions after Codex review round 1", which overrides earlier sections.

Check only:
1. Does each revision R1–R18 actually fix the round-1 finding it cites? Is any fix itself wrong for NGINX 1.30.5 (official alpine image, OpenSSL 3.5.8)? Pay special attention to: plain-prefix immutable locations vs regex order (R1), `limit_req` in websocket/streaming locations (R4), alias server + ACME `acme_certificate` per server (R6), the geo/map `$forwarded_proto` / `$forwarded_port` design using `$realip_remote_addr` (R8), the inline FastCGI parameter list (R10), CSP split between `_headers` and Astro's meta CSP (R11; note `frame-ancestors` is ignored in meta), `gzip_proxied any` (R17).
2. Any new Blocker or Major issue introduced by the revisions.

You run in a read-only sandbox. Output: numbered findings tagged Blocker / Major / Minor with evidence and fix, then a verdict APPROVE / APPROVE WITH CHANGES / REVISE. Be concise; no praise; do not repeat resolved round-1 findings.
