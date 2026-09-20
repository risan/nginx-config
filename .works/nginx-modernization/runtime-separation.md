# Runtime and generator separation

Status: **READY FOR INDEPENDENT DOC REVIEW**

The product has two separate deliverables:

- `web/` is a client-only Vue + Vite configuration generator. It downloads
  reviewed text; it does not install or execute NGINX configuration. Cloudflare
  Workers is an operator-connected hosting target. The Dashboard setup uses
  Worker name `nginx-config-generator`, project root `web`, build command
  `npm run build`, deploy command
  `npx wrangler deploy`, and [`web/wrangler.jsonc`](../../web/wrangler.jsonc).
  Its assets use explicit `404-page` handling; `web/public/_headers` supplies
  browser security headers. No account-specific URL, zone binding, or
  deployment receipt is recorded.
- The Docker image is an optimized NGINX Open Source runtime for user sites and
  services. It contains no Node, Vue, or `dist/` assets. The reviewed default is
  NGINX 1.30.5, UID `101:101`, port `8080`, `Host: localhost`, unknown-host
  status `444`, and a small welcome page. The runtime default is generated from
  the canonical renderer and checked by example drift checks.

Runtime mounts are read-only and replace the image defaults:

- complete configuration: `/etc/nginx/nginx.conf`;
- user site or service content: `/usr/share/nginx/html`.

Generated profiles cover static, SPA, PHP-FPM, Go, and reverse proxy workloads.
Their values are reviewed starting points; no profile or tuning choice is a
universal best setting. Validate the generated file against the target modules,
paths, upstream, certificates, and workload before mounting it.

Local Compose uses service `nginx` and optional TLS service `nginx-tls` under the
`tls` profile. The changed image purpose is handed off as release `v3.0.0`;
existing tags remain untouched. This report records preparation only: the user
connects the Cloudflare account and chooses the eventual deployment URL.

Evidence reviewed: `Dockerfile`, `compose.yaml`, `docker/nginx.conf`,
`docker/default/index.html`, `scripts/generate-examples.mjs`,
`web/package.json`, `web/wrangler.jsonc`, and the owned README and operations,
security, tuning, research, and migration documentation.
