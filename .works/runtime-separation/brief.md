# Separate the NGINX runtime from the browser generator

Status: ready
Type: migration
Route: quick-change — the corrected product boundary and documentation targets are explicit; runtime command names will follow the final worker-owned files.
Next: implement

## Request

The Docker image is an optimized NGINX runtime for user sites and services. The
Vue + Vite generator is a separate client-only application deployed through
Cloudflare Workers. Correct the README and documentation without claiming a
Cloudflare account, URL, or deployment that has not been verified.

## Goal

Make the image contract, local Compose usage, mounted user content/configuration,
and separate Workers generator path unambiguous. Preserve the stable NGINX
baseline and historical audit/spec evidence.

## Target

- `README.md` — product paths, runtime quick start, and Workers generator handoff.
- `docs/*.md` — operations, security, tuning, research, migration, and validation claims.
- `.works/nginx-modernization/runtime-separation.md` — concise corrected contract.
- Final worker-owned Docker/Compose/runtime files — source of exact commands and paths.

## Acceptance criteria

- [ ] No user-facing documentation says the Docker image serves Vue/Vite assets or the generator UI.
- [ ] Image behavior documents pinned NGINX 1.30.5, UID 101, port 8080, `Host: localhost`, unknown-host 444, and the small welcome page.
- [ ] Read-only mounts for `/usr/share/nginx/html` and `/etc/nginx/nginx.conf` cover site/service use, including the generated profiles.
- [ ] Workers generator instructions stay generic, explain downloaded configuration artifacts, and contain no invented production URL or deployment result.
- [ ] Commands, service names, paths, and links match the final worker-owned files; historical audits/specs remain identifiable as historical.
- [ ] Markdown/link/whitespace checks pass.

## Out of scope

- Dockerfile, Compose, runtime script, workflow, web source, Cloudflare account, deployment, Git operations, and release execution.
- Universal performance or security guarantees for a user's workload.

## Assumptions

- The release line for this changed image is `v3.0.0`; existing tags remain untouched — request.
- The Cloudflare Workers project/account and public URL are not known — parent preflight; document generic setup only.
- Final mount syntax and Compose service names come from the worker-owned runtime files — coordination constraint.
