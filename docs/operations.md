# Operations, containers, and releases

This repository publishes a browser configuration helper. Its container serves the
Vue build; it does not deploy an exported NGINX configuration and it does not
proxy a user's application. Run generated files in a separately reviewed NGINX
service.

## Local container

Build and start the local image:

~~~bash
docker compose config
docker compose up --build
~~~

Visit http://localhost:8080 and confirm the page loads. In another shell:

~~~bash
docker compose ps
curl -i http://localhost:8080/
~~~

The image should report a healthy HTTP response. Stop it with Ctrl-C or:

~~~bash
docker compose down
~~~

For a direct image build:

~~~bash
docker build -t nginx-config-generator:local .
docker run --rm -p 8080:8080 nginx-config-generator:local
~~~

Compose also has an opt-in TLS service. Create a configuration that listens on
8443 and uses certificate paths under /etc/nginx/tls, then mount it and its
certificate directory. Set `NGINX_TLS_SERVER_NAME` to the same name as the
configuration's `server_name`; this lets the local health check send the right
TLS SNI. The mounted directory and files must be readable by UID 101:

~~~bash
NGINX_TLS_CONFIG=./nginx.tls.conf \
NGINX_TLS_CERTS=./ssl \
NGINX_TLS_SERVER_NAME=example.com \
docker compose --profile tls up --build generator-tls
~~~

The default HTTP service stays on 8080. Do not mount production private keys
into the generator unless the host permissions and the TLS configuration have
been reviewed.

Use Compose's read-only root filesystem, a small tmpfs for /tmp, dropped
capabilities, and no-new-privileges settings when exposing the image beyond a
developer laptop. Keep the published port narrow. Do not mount a user's
production NGINX directory into the generator container.

The multi-stage build should compile the web app with Node and copy only web
dist/ plus the generated internal nginx.conf into the NGINX runtime. That
internal file only serves the generator UI; downloaded application
configurations remain separate artifacts. This repository uses the Docker
Official `nginx:1.30.5-alpine` image and switches to its shipped numeric UID
101:101, with port 8080 and writable temporary paths under `/tmp`. It does not
use the separate nginxinc unprivileged image, so do not mix their paths or
entrypoint assumptions. A runtime image should not include npm, source files,
package caches, a shell used only for debugging, or credentials.

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

The generator cannot configure your service manager, DNS, firewall, certificate
renewal, trusted load balancer CIDRs, upstream CA, or cache invalidation. Keep
those decisions in deployment configuration and review them separately.

## Logs and health

The generator image should write access and error logs to stdout/stderr so the
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

Tag images with the source commit and release version. The selected release is
`ghcr.io/risan/nginx-config:2.0.0`. A `sha-<commit>` tag is traceable to a
source commit but remains a mutable registry tag; only a digest reference is
immutable:

~~~bash
docker pull ghcr.io/risan/nginx-config:2.0.0
docker pull ghcr.io/risan/nginx-config@sha256:<published-digest>
~~~

Do not assume the browser image's NGINX version is the same as the NGINX package
that will run an exported configuration; inspect each image separately.

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
git tag -a v2.0.0 -m "Release v2.0.0"
git push origin v2.0.0
~~~

Review the generated image, digest, labels, health check, package visibility,
and manifest platforms after the workflow finishes. The release workflow builds
`linux/amd64` and `linux/arm64`; the published digest is the artifact to
inspect, not the earlier local single-platform build. For example:

~~~bash
docker buildx imagetools inspect ghcr.io/risan/nginx-config:2.0.0
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
3. Refresh the pinned base-image digest, Node builder digest, and lockfile as
   applicable. Verify each digest belongs to the intended multi-platform tag.
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
