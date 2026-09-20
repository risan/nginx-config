# NGINX configuration toolkit

This repository is a small, copy-and-customize toolkit for the free, open-source
NGINX server. It contains a Vue + Vite configuration generator, readable
examples, and an optimized NGINX runtime image for user sites and services.
The generator is a separate client application; its Vue assets are not packaged
into the runtime image.

The defaults target **NGINX 1.30.5**, the stable release checked on 2026-09-20.
NGINX 1.31.6 is the current mainline release. Keep the stable patch release and
the OpenSSL, zlib, PCRE, base-image, and operating-system packages updated;
there is no single configuration switch that makes every workload faster.

The project covers NGINX Open Source. NGINX Plus features and third-party
modules such as Brotli are intentionally outside the default configuration.
See the [NGINX research notes](docs/research-nginx.md) and [proxy research
notes](docs/research-proxy.md) for source links and the evidence behind the
defaults.

## Choose a path

Use the browser generator when you want a complete `nginx.conf` from supported
choices. It runs entirely in the browser: it has no account, API, analytics, or
server-side configuration service. Select a profile, review the warnings, then
copy or download the file. The generated text is not executed by the app.
Deploy the built `web/` client separately through a Workers-compatible static
deployment; the UI downloads configuration files for a user-managed runtime.

Use the checked-in generated examples when you want a complete file to review
and copy into a deployment. Edit a deployment copy; regenerate repository
examples from the renderer. The five profiles are:

| Profile | Use it for |
| --- | --- |
| Static | Files such as HTML, CSS, JavaScript, images, and downloads |
| SPA | A Vite/React/Vue single-page app with a safe `index.html` fallback |
| PHP-FPM | A front-controller PHP application |
| Go | A Go HTTP service behind NGINX |
| Reverse proxy | A general HTTP application or service |

PHP-FPM, Go, and reverse proxy profiles use different upstream behavior. The
proxy switches are applied to the generated profile's one proxy location or
server. Split locations and move a setting when only one application route
needs it; see [tuning](docs/tuning.md) for the review points.

## Browser generator

From the repository root, install the locked dependencies and run Vite. Open its
printed URL; run the build from the repository root when you need production files:

```bash
npm --prefix web ci
npm --prefix web run dev
# In another shell from the repository root: npm --prefix web run build
```

The app imports [`lib/config.js`](lib/config.js), so the form, preview,
downloads, and checked-in examples use one option model. The renderer rejects
unknown fields and unsafe values; it does not accept raw NGINX directives.
Regenerate checked-in examples with:

```bash
node scripts/generate-examples.mjs
```

To connect the client manually in the Cloudflare Dashboard, import this
repository into a Workers project named `nginx-config-generator`, set the
project root to `web`, use
`npm run build` as the build command, and use `npx wrangler deploy`
as the deploy command. The repository's
[`web/wrangler.jsonc`](web/wrangler.jsonc) points Wrangler at `dist` and uses
explicit `404-page` handling. The checked-in `web/public/_headers` supplies
the browser security headers. Connect the operator's account and choose any
account-specific settings in the Dashboard; this repository does not promise a
particular deployment URL or include an automatic GitHub deployment workflow.

To preview or publish the client through Wrangler, run these commands from the
repository root. The deploy commands require the operator's Cloudflare
authentication:

```bash
npm --prefix web ci
npm --prefix web run workers:dev       # local Workers runtime; keep this running separately
```

For a build check and deployment, use separate commands or shells:

```bash
npm --prefix web run build
npm --prefix web run deploy:dry-run    # build and inspect without publishing
npm --prefix web run deploy            # build and publish after account review
```

The UI downloads configuration text; it does not install that text into the
NGINX runtime. The resulting site or service still needs a reviewed full
configuration and read-only content mount.

The focused checks below all run from the repository root:

```bash
# Install the locked UI dependencies in a clean checkout.
npm --prefix web ci
node scripts/generate-examples.mjs --check && node --test tests/config.test.mjs
npm --prefix web run test:unit && npm --prefix web run build
npm --prefix web exec -- playwright install --with-deps chromium  # Linux/CI
npm --prefix web run test:browser
node scripts/check-nginx-version.mjs && node scripts/verify-nginx-configs.mjs  # needs Docker
```

See [benchmarking and validation](docs/benchmarking.md) for runtime checks.

## NGINX runtime quick start

Build and start the NGINX runtime locally with Compose:

```bash
docker compose config
docker compose up --build nginx
```

The image ships a small welcome page, listens on port 8080, and accepts
`Host: localhost`. Unknown hosts receive 444. Check the page and health
endpoint, then stop it with `Ctrl-C` or `docker compose down`:

```bash
curl -i -H 'Host: localhost' http://localhost:8080/
curl -i -H 'Host: localhost' http://localhost:8080/healthz
```

The image contains no Node, Vue assets, or generator build. Mount a reviewed
complete configuration and the user site or service content read-only when
running a workload:

```bash
NGINX_CONFIG=./path/to/nginx.conf \
NGINX_CONTENT=./path/to/public \
NGINX_SERVER_NAME=localhost \
docker compose up --build nginx
```

The configuration must listen on 8080 and use `/usr/share/nginx/html` when it
serves the mounted content. The full file replaces `/etc/nginx/nginx.conf`;
the content mount replaces `/usr/share/nginx/html`. Set `NGINX_SERVER_NAME` to
the mounted configuration's `server_name`; `localhost` is the local example.

```bash
docker build -t nginx-config:local .
docker run --rm -p 8080:8080 nginx-config:local
```

The container is designed for an unprivileged user. In production keep its root
filesystem read-only, give only `/tmp` writable space, drop capabilities, and
enable `no-new-privileges`; see [operations](docs/operations.md).

The GitHub Actions workflow builds pull requests and `main` without publishing,
then publishes to GHCR only for an exact stable `vMAJOR.MINOR.PATCH` tag or an
explicit manual run using `GITHUB_TOKEN`. Manual runs publish traceable
SHA-derived tags only; tags can move, so only a digest is immutable. They never
move `latest`, major, or minor aliases. This checkout does not publish
automatically. The changed runtime purpose is released as `v3.0.0`; after that
release has a recorded digest, pull it as follows:

```bash
docker pull ghcr.io/risan/nginx-config:3.0.0
# Use the digest recorded after publishing when an immutable reference is needed.
docker pull ghcr.io/risan/nginx-config@sha256:<published-digest>
```

The package may start private. Read back its package visibility after the
workflow and change it deliberately; anonymous pulls work only after it is
public, otherwise authenticate to `ghcr.io` first. Review the workflow under
[`.github/workflows/`](.github/workflows/) before tagging.

## Use a generated configuration

Treat a generated file as a reviewed starting point. It contains placeholders
for host names, paths, upstreams, and certificates; replace them with values
from your deployment and inspect every optional block.

1. Save the current configuration and record the running build:

   ```bash
   sudo nginx -V 2>&1 | tee /tmp/nginx-build.txt
   sudo cp -a /etc/nginx /etc/nginx.backup.$(date +%Y%m%d%H%M%S)
   ```

2. Put the reviewed file in a staging path and check it with the same NGINX
   package, modules, paths, and user that will run it:

   ```bash
   sudo nginx -t -c /etc/nginx/nginx.conf
   sudo nginx -T -c /etc/nginx/nginx.conf > /tmp/nginx-expanded.conf
   ```

3. Reload only after the test succeeds:

   ```bash
   sudo nginx -s reload
   ```

   A failed reload should leave the old workers serving traffic, but always
   check the error log and a real request after a change.

Do not replace `/etc/nginx` blindly. Preserve distribution-managed includes,
certificate permissions, log ownership, and module packages. Use a separate
`sites-available` file and symlink it into `sites-enabled` when that is how the
distribution is laid out.

## Generator options and their limits

The generator exposes bounded choices rather than arbitrary directives:

| Choice | What it changes | Review before enabling |
| --- | --- | --- |
| TLS | HTTPS listener, certificate paths, TLS 1.2/1.3, and HTTP/2 | Certificate chain, key permissions, DNS, and redirect behavior |
| Gzip | Compressible text responses at a low CPU level | Static/SPA may enable it; PHP/Go/proxy are off by default and need a BREACH review |
| Asset cache | Long cache for Vite-style hashed assets and `/assets/` files | Enable only when every matched URL is immutable; missing assets remain 404 |
| WebSocket | Upgrade headers for the generated proxy service | Idle timeout and backend ping behavior; split routes manually when needed |
| Streaming | Response buffering for the generated proxy service | Heartbeats, timeout gaps, memory, and upload behavior; request buffering stays on |
| Public proxy cache | Cache only explicitly public responses in the generated proxy service | Auth, cookies, `Vary`, invalidation, and privacy; split routes manually when needed |
| Rate limit | A bounded per-IP limit for the whole generated server | NAT users, IPv6, HTTP/2 concurrency, and dry-run results; split routes manually when needed |
| HSTS | Browser HTTPS enforcement | Enable only after every affected host is HTTPS-ready |

TLS, HSTS, proxy caching, WebSockets, streaming, and rate limits are opt-in.
The generator cannot know your identity model, trusted load balancer addresses,
backend TLS CA, upload-streaming safety, cache invalidation policy, or endpoint
capacity. Configure those deployment-specific policies manually and test them.
In particular, do not trust `X-Forwarded-For` from arbitrary clients, and do
not enable a shared cache for authenticated responses. The WebSocket, streaming,
proxy-cache, and rate-limit switches apply to the generated service-wide proxy
location or server. Edit the output into separate locations when only one route
needs a behavior.

## Safe baseline ideas

The canonical configuration starts with `worker_processes auto`, a portable
`worker_connections` starting point, `sendfile` for ordinary files, buffered
proxy/FastCGI responses, public static text gzip, and long caching only for
hashed assets. Match service file limits before increasing connection capacity;
dynamic gzip is off by default. Open-file caches, upstream caches, AIO, large
buffers, affinity, `reuseport`, and aggressive limits remain measured opt-ins.
Keep logs useful without logging cookies or secrets. See [tuning](docs/tuning.md) and
[benchmarking](docs/benchmarking.md) before changing values globally.

## Important security defaults

Use the newest patched stable NGINX and inspect `nginx -V` so the running build
matches its modules. Run dedicated unprivileged workers, protect private keys,
deny unknown hosts and sensitive files, bound request bodies, and hide the
version. CSP, HSTS preload, cross-origin policy, and permissions policy must
match the application. For HTTPS upstreams enable SNI and CA verification; for
load balancers trust only exact `set_real_ip_from` CIDRs. These deployment
policies are outside the flat browser form.

HTTP/3 remains experimental: it needs UDP/TCP reachability, TLS 1.3, module
support, and a current security patch. Keep it off until a real client and TCP
fallback are tested.

## Layout

```text
lib/config.js                 canonical renderer and option validation
scripts/generate-examples.mjs generated checked-in examples
nginx.conf + sites-example/   profiles produced by the renderer
web/                          Vue + Vite browser generator
snippets/                     small reusable directives and locations
docs/                         tuning, security, operations, migration, research
Dockerfile / compose.yaml     NGINX runtime image and Compose quick start
```

Keep `mime.types` from the upstream package current when adding a type; do not
replace it with a short hand-written list. Distribution package layouts and
optional modules vary, so validate this repository with the actual image or
package you deploy. The PHP form accepts a TCP `host:port` upstream only. If
PHP-FPM uses a Unix socket, replace `fastcgi_pass` in the downloaded file with a
reviewed `unix:/run/...` value and run `nginx -t`; a Unix path cannot be entered
in the form.

## Further reading

- [Performance and configuration tuning](docs/tuning.md)
- [Security checklist and deployment recipes](docs/security.md)
- [Container, release, and operations guide](docs/operations.md)
- [Benchmarking and validation](docs/benchmarking.md)
- [Migration from the old repository](docs/migration.md)
- [NGINX baseline research](docs/research-nginx.md)
- [Proxy, container, and GHCR research](docs/research-proxy.md)
- [Official NGINX downloads](https://nginx.org/en/download.html)
- [Official NGINX documentation](https://nginx.org/en/docs/)

The project remains under the [MIT license](LICENSE). Historical attribution:
[NGINX documentation](https://nginx.org/en/docs/) and [h5bp server
configs](https://github.com/h5bp/server-configs-nginx); current behavior is
checked against official documentation.
