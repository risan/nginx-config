# Migration from the old repository

The original repository was a 2017 collection of Debian-oriented snippets. The
modernized repository has one canonical renderer and full generated profiles.
It targets stable free NGINX 1.30.5 as checked on 2026-09-20 and keeps workload
choices explicit.

The runtime-purpose change is released as `v3.0.0`; existing image tags remain
unchanged. Use the v3 runtime contract when adopting the image for a site or
service.

Read this guide before replacing a live /etc/nginx directory.

## What moved

The root nginx.conf is now a complete standalone template for the selected
baseline. It is generated from lib/config.js and is the useful starting point
for a whole NGINX configuration; it is not a file that automatically discovers
your application's settings.

The client-only browser app lives under `web/` and is hosted separately through
the operator's Workers deployment. Its downloads are text artifacts. The NGINX
runtime image does not package the Vue app: mount a reviewed complete config at
`/etc/nginx/nginx.conf` and user content at `/usr/share/nginx/html`, both
read-only, when running a site or service.

Use the generated root nginx.conf and sites-example/*.conf files for repeatable
examples, or use the Vue form for bounded choices:

- static for ordinary files;
- spa for a client-side Vue/React/Vite application;
- php for PHP-FPM;
- go for a Go HTTP service;
- proxy for a general HTTP backend.

The old sites-example/*.conf recipes are now regenerated as complete profile
examples; treat them as renderer output rather than hand-editing them. The
snippets/ directory remains a legacy, hand-editable collection and is not
automatically included by the new root template. If a future checkout removes
or relocates a file you customized, recover it from the old checkout or git
history before upgrading. Do not assume that a familiar filename remains
valid.

Regenerate checked-in examples from the renderer:

~~~bash
node scripts/generate-examples.mjs
~~~

Do not hand-edit a generated example and expect the next generation to retain
it. Put reusable behavior in the renderer or keep a clearly named deployment
recipe outside generated output.

## Safe replacement

Create a backup and capture the running build before touching the host:

~~~bash
sudo nginx -V 2>&1 | tee /tmp/nginx-build-before-migration.txt
sudo cp -a /etc/nginx /etc/nginx.backup.$(date +%Y%m%d%H%M%S)
~~~

Stage the new file and every include, certificate, log path, and module package.
Then use the same package and user that will run it:

~~~bash
sudo nginx -t -c /etc/nginx/nginx.conf
sudo nginx -T -c /etc/nginx/nginx.conf > /tmp/nginx-expanded-after-migration.conf
sudo nginx -s reload
~~~

Keep a real health request and the previous directory available while checking
static files, application routes, PHP, upstream errors, TLS, and logs. Do not
follow the old README's advice to move /etc/nginx and clone this repository over
it without first preserving distribution-managed files.

## Directive changes to review

### Workers and limits

The old file hard-coded www-data, worker_rlimit_nofile 8192, and
worker_connections 8000. The worker user differs between distributions and
containers. worker connections include client and upstream sockets, and the
file-descriptor limit must match. Start with worker_processes auto and a modest
connection value, inspect peak descriptors and concurrency, then raise all
matching limits together.

Remove explicit use epoll, accept_mutex tuning, CPU affinity, and reuseport
copied from old guides unless a benchmark proves a gain on this host. NGINX
selects the event method automatically.

### Static files and caching

Keep sendfile for ordinary local files and use tcp_nopush only with it when the
platform benefits. tcp_nodelay is already on for keep-alive connections.

Use try_files $uri =404 for a static tree. For an SPA, fall back to index.html
only for application routes and keep /assets/ on a strict 404 path. The modern
asset-cache option targets Vite-style hashed names and /assets/ files; inspect
the generated matcher before enabling it. Apply public, immutable, long caching
only to content-hashed assets. Revalidate index.html, manifests, and service
workers.

open_file_cache is an opt-in setting. It consumes descriptors and can delay
file replacement visibility; size it from the hot tree and deployment process.

### Gzip

The old global level 5 and gzip_proxied any are not universal optimizations.
Start with low-CPU text compression, a size threshold, and gzip_vary. Dynamic
PHP, Go, and proxy responses are off by default; an explicit opt-in needs a
BREACH and reflected-secret review. Do not compress images, archives, or
secret-reflecting responses. Confirm the actual gzip_static module before using
precompressed files.

### TLS and HTTP/2

Replace old listen 443 ssl http2 lines with:

~~~nginx
listen 443 ssl;
http2 on;
~~~

Keep TLS 1.2 and TLS 1.3. Remove TLS 1.0/1.1 and dated cipher/curve snippets.
Do not enable early data for state-changing requests. OCSP stapling needs a
working issuer chain, trusted CA, resolver, and verification; remove incomplete
placeholders rather than calling them secure. HSTS, especially includeSubDomains
or preload, needs a deliberate HTTPS-only rollout.

HTTP/3 remains an experimental opt-in and requires a matching module and UDP
path. It is not a drop-in replacement for the standard TLS examples.

### PHP-FPM

The browser generator accepts a TCP `host:port` for PHP-FPM only. Update it to
the installed PHP version or container address. If the old deployment uses a
Unix socket, export the generated file, replace `fastcgi_pass` manually with
the reviewed socket path, and run `nginx -t`; the form rejects Unix socket
paths. Before fastcgi_pass, check the requested script:

~~~nginx
location ~ \.php$ {
    try_files $uri =404;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
~~~

Keep PATH_INFO off unless the framework needs it. Keep FastCGI buffering for
ordinary responses. Add FastCGI keep-alive or caching only after checking
PHP-FPM capacity, authentication, cookies, and invalidation.

### Reverse proxy and Go

Go needs the normal HTTP reverse-proxy profile; no special NGINX module is
required. Keep ordinary response and request buffering on. Use route-specific
settings for SSE, WebSockets, and streaming uploads.

At an internet-facing edge, overwrite forwarded identity headers. Do not copy an
attacker's X-Forwarded-For chain with proxy_add_x_forwarded_for unless the
incoming hop is already trusted. If a load balancer sits in front, allowlist its
exact CIDRs and test the real-IP path.

For an HTTPS upstream, configure SNI and certificate verification with the actual
CA bundle. The old default of accepting an unverified backend is not a security
baseline.

### Timeouts, retries, and caches

The old SSL example's long keep-alive is not automatically better. Keep the
current NGINX defaults or choose a value from measured connection reuse and
memory. Proxy send/read timeouts measure inactivity gaps, not whole request
duration.

Retry only safe idempotent requests and bound multi-server retries. Do not add
non_idempotent as a generic flag.

Proxy and FastCGI caches remain off unless the application has a public-cache
contract. A shared cache must bypass authorization and session cookies, respect
Set-Cookie and Vary, include host in a shared key, and define invalidation.
Never use ignore_headers to hide a privacy signal.

## Package and module differences

The old snippets assume a Debian layout and PHP 7.1 socket. Distribution and
official images differ in:

- worker user and PID path;
- certificate and CA bundle path;
- MIME file and include directories;
- log ownership and service manager;
- HTTP/2, HTTP/3, gzip_static, real-IP, and other compiled modules;
- PHP-FPM socket or upstream address.

Run nginx -V on the exact target. Keep the upstream mime.types file current
instead of replacing it with a short custom list. When a module is absent,
remove the dependent directive or install the package that owns it; do not
silence a syntax error by copying an unrelated binary.

## Rename master to main

The repository's development branch is main. For a local checkout that still
uses master:

~~~bash
git fetch origin
git branch -m master main
git push -u origin main
~~~

A repository administrator must set main as the provider's default branch before
removing the old remote reference. Update branch protection, Actions triggers,
badges, deployment rules, and links first:

~~~bash
git push origin --delete master
~~~

Do not run the final delete until the provider default and all required checks
point at main. Existing clones should switch with git fetch and git switch main.

## Rollback

If nginx -t fails, keep serving the known-good workers and fix the candidate.
If a valid reload causes an application regression, restore the last reviewed
file or directory, run nginx -t again, and reload. Record the failure and add a
regression check before retrying the migration.

Use [security](security.md), [tuning](tuning.md), and [benchmarking](benchmarking.md)
for the checks behind each setting. The MIT license and historical attribution
remain in [LICENSE](../LICENSE).
