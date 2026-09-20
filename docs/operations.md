# Operations, containers, and releases

The `web/` directory is a client-only configuration helper. Deploy its built
assets separately through a Workers-compatible static deployment; the UI
downloads configuration text and does not run it. The container is an optimized
NGINX runtime for user sites and services. It ships a small welcome page, uses
port 8080, accepts `Host: localhost`, and rejects unknown hosts with 444.

## Workers generator deployment

Connect the repository manually in the Cloudflare Dashboard. Use the Worker
name `nginx-config-generator`, project root `web`, `npm run build` as the build
command, and
`npx wrangler deploy` as the deploy command. The repository's
[`web/wrangler.jsonc`](../web/wrangler.jsonc) is the deployment configuration:
it publishes `web/dist`, uses explicit `404-page` handling, and does not contain
an account-specific URL or zone binding. The checked-in `web/public/_headers`
supplies browser security headers. Do not add a GitHub Actions deployment
workflow for this client.

For the same flow from a checked-out repository:

~~~bash
cd web
npm ci
npm run build
npm run deploy:dry-run
npm run deploy
~~~

`npm run workers:dev` starts the local Workers runtime. The deploy command
requires the operator's Cloudflare authentication; this repository records no
deployment result or public URL. The UI only downloads generated configuration
text. A user still validates and mounts that file into the NGINX runtime.

## Local container

Build and start the local image:

~~~bash
docker compose config
docker compose up --build nginx
~~~

Confirm the default page and health endpoint with the intended Host header:

~~~bash
docker compose ps nginx
curl -i --header 'Host: localhost' http://localhost:8080/
curl -i --header 'Host: localhost' http://localhost:8080/healthz
~~~

The image should report a healthy HTTP response. Stop it with Ctrl-C or:

~~~bash
docker compose down
~~~

For a direct image build:

~~~bash
docker build -t nginx-config:local .
docker run --rm -p 8080:8080 nginx-config:local
~~~

The image includes the generated default `/etc/nginx/nginx.conf` and a small
site under `/usr/share/nginx/html`. For a real workload, mount the complete
reviewed configuration and the site or service content read-only:

~~~bash
NGINX_CONFIG=./path/to/nginx.conf \
NGINX_CONTENT=./path/to/public \
NGINX_SERVER_NAME=localhost \
docker compose up --build nginx
~~~

The mounted configuration must listen on 8080 and use
`/usr/share/nginx/html` for static content. The two mounts replace the image
defaults at `/etc/nginx/nginx.conf` and `/usr/share/nginx/html`. Set
`NGINX_SERVER_NAME` to the mounted configuration's `server_name`; `localhost`
is the local example used by the health check.

Compose also has an opt-in TLS service. Create a configuration that listens on
8443 and uses certificate paths under /etc/nginx/tls, then mount it and its
certificate directory. Set `NGINX_TLS_SERVER_NAME` to the same name as the
configuration's `server_name`; this lets the local health check send the right
TLS SNI. The mounted directory and files must be readable by UID 101:

~~~bash
NGINX_TLS_CONFIG=./nginx.tls.conf \
NGINX_TLS_CERTS=./ssl \
NGINX_TLS_SERVER_NAME=example.com \
docker compose --profile tls up --build nginx-tls
~~~

The default HTTP service stays on 8080. Do not mount production private keys
unless the host permissions and the TLS configuration have been reviewed.

Use Compose's read-only root filesystem, a small tmpfs for /tmp, dropped
capabilities, and no-new-privileges settings when exposing the image beyond a
developer laptop. Keep the published port narrow. Do not mount a user's
production NGINX directory into the runtime container.

The runtime image contains no Node toolchain, Vue assets, `dist/` tree, or
generator source. It uses the Docker Official `nginx:1.30.5-alpine` image and
its shipped numeric UID 101:101, with port 8080 and writable temporary paths
under `/tmp`. The canonical renderer generates the default config and checked-in
profiles; validate a downloaded or edited full config before mounting it. Do
not mix these paths or entrypoint assumptions with the separate nginxinc
unprivileged image.

## Exported configurations

The browser download is text. Before installing it:

1. Replace placeholders for the server name, document root, upstream, and
   certificate paths.
2. Check that the installed NGINX package contains the modules the file uses.
3. Run nginx -t and inspect nginx -T with the same user, paths, and mounts as
   the service.
4. Test unknown hosts, static assets, application routes, upstream failures,
   TLS, and health endpoints.
5. Reload gracefully and make a real request before declaring the change live.

The generated HTTP listener defaults to port 8080. The Go profile's loopback
upstream defaults to `127.0.0.1:8081`, keeping the application listener separate
from NGINX; the validator rejects loopback upstreams that reuse either enabled
NGINX listener port. A named service such as `backend:8080` may use the same
numeric port because it runs in a different network namespace.

The renderer and Workers UI cannot configure your service manager, DNS, firewall,
certificate renewal, trusted load balancer CIDRs, upstream CA, or cache
invalidation. Keep those decisions in deployment configuration and review them
separately.

## Logs and health

The runtime image should write access and error logs to stdout/stderr so the
container runtime can collect them. A health check must make an HTTP request to
the local health endpoint; checking only that an nginx process exists can miss a
broken listener or configuration.

On a host, keep request and upstream timing fields in access logs and rotate
them. Use error level warn or error during normal operation. Debug logging is
temporary, expensive, and may expose request data.

## Image tags and repeatability

Use a full stable NGINX version for the runtime base and update it when the
security advisory or base-image status changes. Pin a digest for a release
when reproducibility matters, then refresh it through a reviewed update. A
permanent digest misses fixes; a floating tag changes silently.

Tag images with the source commit and release version. The changed runtime
purpose is released as `v3.0.0`; use its image tag after the release workflow
records the digest. A `sha-<commit>` tag is traceable to a source commit but
remains a mutable registry tag; only a digest reference is immutable:

~~~bash
docker pull ghcr.io/risan/nginx-config:3.0.0
docker pull ghcr.io/risan/nginx-config@sha256:<published-digest>
~~~

The runtime image's NGINX version is not proof that another host package can run
an exported configuration; inspect each deployment separately.

## GitHub Container Registry

The repository uses [CI](../.github/workflows/ci.yml) for pull requests and
main, and [publish-image](../.github/workflows/publish-image.yml) for releases.
Their release policy is:

- Pull requests and main pushes build and test without registry login.
- Publishing occurs only for an exact stable `vMAJOR.MINOR.PATCH` tag or an
  explicitly requested workflow dispatch. Leading zeroes and suffixes are
  rejected.
- A manual dispatch publishes only traceable SHA-derived tags; tags can move,
  so only a digest is immutable. It never moves
  latest, major, or minor aliases. Only a pushed stable release may move those
  aliases.
- The publish job uses the repository GITHUB_TOKEN with only `contents: read`
  and `packages: write` permissions.
- Third-party actions are pinned to full commit SHAs.
- Each image receives a commit-SHA tag and standard OCI source, revision, and
  version labels. latest moves only during an intentional stable release.
- Buildx attaches OCI provenance and an SBOM to published multi-architecture
  images.

GitHub may create a new GHCR package as private. An owner must deliberately
change package visibility and access policy. After publishing, read the package
visibility and published manifest back from GitHub, then pull the recorded
digest. Do not infer public pull access from repository visibility. Publishing
is configured here; this checkout does not publish an image by itself.

A release handoff is:

~~~bash
git switch main
git pull --ff-only
git tag -a v3.0.0 -m "Release v3.0.0"
git push origin v3.0.0
~~~

Review the generated image, digest, labels, health check, package visibility,
and manifest platforms after the workflow finishes. The release workflow builds
`linux/amd64` and `linux/arm64`; the published digest is the artifact to
inspect, not the earlier local single-platform build. For example:

~~~bash
docker buildx imagetools inspect ghcr.io/risan/nginx-config:3.0.0
docker pull ghcr.io/risan/nginx-config@sha256:<published-digest>
docker image inspect ghcr.io/risan/nginx-config@sha256:<published-digest> \
  --format '{{json .Config.Labels}}'
docker run --rm -d --name nginx-config-release -p 8080:8080 \
  ghcr.io/risan/nginx-config@sha256:<published-digest>
curl -fsS --header 'Host: localhost' http://127.0.0.1:8080/healthz
docker stop nginx-config-release
~~~

The explicit `Host: localhost` header is required here because the image's
default server intentionally rejects unknown host names with status 444.

Confirm the manifest lists both platforms, OCI source/revision/version labels
match the reviewed commit, the digest pull is healthy on a native runner, and
the package visibility is the intended value. Record those receipts with the
release; a multi-architecture build alone is not post-push proof.

## Updating NGINX

When a stable patch is released:

1. Read the official release and security advisory notes.
2. Update `lib/version.js`, the `NGINX_VERSION` arguments in `Dockerfile` and
   both Compose services, smoke-test defaults, generated examples, and dated
   documentation. `lib/version.js` is canonical for generated text, but these
   build and release pins are explicit interfaces and must stay in sync.
3. Refresh the pinned base-image digest and lockfile as applicable. Verify the
   digest belongs to the intended multi-platform tag.
4. Run `node scripts/check-nginx-version.mjs` and the full renderer, browser,
   NGINX syntax, runtime, and container checks; the version checker is a guard,
   not a substitute for reviewing every pin and example.
5. Compare the expanded configuration and test TLS, static, proxy, PHP, and
   error paths before tagging.

Do not call a version "latest" in a long-lived document without recording the
date and linking the official download page. The free stable and mainline
branches have different change rates; choose stable by default and test
mainline separately.

## Graceful host reload

A safe host update keeps a known-good configuration:

~~~bash
sudo cp -a /etc/nginx /etc/nginx.backup.$(date +%Y%m%d%H%M%S)
sudo nginx -t
sudo nginx -T > /tmp/nginx-expanded.conf
sudo nginx -s reload
curl -fsS https://example.com/healthz
~~~

If the test fails, do not reload. If a post-reload request fails, inspect the
error log and restore the last known-good file using the host's normal service
procedure. Keep certificates, ownership, and distribution-managed includes
intact while rolling back.
