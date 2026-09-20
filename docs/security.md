# Security guide

Treat the generated file as a reviewed deployment artifact. It is a safe starting
point for common sites, not a complete application security policy. NGINX cannot
decide which cookies are private, which proxy addresses are trusted, or which
origins may frame an application.

The [NGINX research baseline](research-nginx.md) has the full source list. This
guide calls out the decisions that most often cause a real incident.

## Patch and inspect the running build

Use the newest patch in the stable 1.30 branch, currently 1.30.5 as checked on
2026-09-20. Keep OpenSSL, zlib, PCRE, the base image, and operating-system
packages patched too. Record:

~~~bash
nginx -v
nginx -V 2>&1
~~~

nginx -V shows the linked libraries and compile-time modules. A configuration
that mentions http_v3, gzip_static, or another optional module is not portable
until the target package proves that module is present. Third-party modules and
njs have their own security advisories.

Use the official [security advisory list](https://nginx.org/en/security_advisories.html)
and [release page](https://nginx.org/news.html) when updating a pinned
version. Rebuild an image after both NGINX and base-library fixes are available.

## Process and filesystem boundaries

Run workers as a dedicated unprivileged user. The master may need a small
privilege to bind ports or read a protected key, but worker processes should not
own application source, deployment credentials, or private keys.

Keep configuration and key files non-writable by the worker. Give certificate
private keys the narrowest readable permissions that the master and renewal
process require. Do not put .env, source maps, backups, VCS data, private keys,
or package metadata under a public document root.

A default server should serve no application content for an unknown host:

~~~nginx
server {
    listen 80 default_server;
    server_name _;
    return 444;
}
~~~

For a TLS listener, use a separate default TLS server and consider
ssl_reject_handshake on when the deployed NGINX build supports it. Test unknown
Host and unknown SNI values; an unknown name must not reach a real site.

## Request and file exposure

Keep the built-in request parsing protections unless an application requirement
has been documented and tested:

- ignore_invalid_headers on;
- underscores_in_headers off;
- merge_slashes on;
- a finite client_max_body_size;
- finite header, body, proxy, and FastCGI timeouts.

Protect dotfiles, source-control directories, editor backups, private keys, and
configuration dumps. Permit only the exact /.well-known/ paths needed by an
ACME or other challenge flow. A broad "allow hidden files" exception can expose
credentials.

The browser generator accepts a TCP `host:port` for PHP-FPM only. If the
service uses a Unix socket, export the file, replace `fastcgi_pass` with the
reviewed `unix:/run/...` path, and run `nginx -t`; the form rejects socket paths.
Do not route every URI ending in .php to PHP-FPM without checking the file:

~~~nginx
location ~ \.php$ {
    try_files $uri =404;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
~~~

The file check prevents a made-up script path from being interpreted by the
application. Keep PATH_INFO parsing off unless the framework needs it and its
split expression has tests.

## TLS

Use TLS 1.2 and TLS 1.3 with a current TLS library:

~~~nginx
listen 443 ssl;
http2 on;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
~~~

The current syntax is http2 on; the listen ... http2 parameter used by old
snippets is deprecated. Generated TLS profiles use a short ECDHE AEAD list for
TLS 1.2 compatibility; TLS 1.3 cipher selection remains with OpenSSL. Test
that list against the target OpenSSL policy and clients before changing it. In
hand-written configurations, let the current OpenSSL policy choose ciphers
unless a known compatibility requirement has a tested TLS 1.2 policy. Do not
re-enable TLS 1.0/1.1, old cipher lists, or blanket early data from a dated
blog post.

The shared session cache reduces repeat-handshake work. NGINX 1.23.2 and later
generate and rotate session-ticket keys when the shared cache is used. Keep
`ssl_session_tickets on` for that default behavior; only configure
`ssl_session_ticket_key` when every NGINX instance has a reviewed key-sharing
and rotation process. Never copy one permanent ticket key across a fleet.

OCSP stapling needs the issuer chain, a trusted CA file, a resolver, and
verification. Enable it only when all four are configured and tested. HSTS is
safe only after every affected host works over HTTPS. Start without
includeSubDomains or preload until that wider decision is complete.

HTTP/3 is still experimental in NGINX. It requires the module, UDP and TCP
reachability, TLS 1.3, a current security patch, and a real HTTP/3 client test.
Keep HTTP/2/HTTP/1.1 fallback. Do not enable 0-RTT for login, payments, uploads,
or other state-changing requests without an application replay design.

## Forwarded identity

At an internet-facing edge, overwrite identity headers so a client cannot choose
the address recorded by the backend:

~~~nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
~~~

$proxy_add_x_forwarded_for appends the incoming header. That is appropriate only
when the incoming hop is already trusted; at an untrusted edge it preserves
attacker-controlled values.

When NGINX is behind a load balancer, normalize the address only from exact
allowlisted ranges:

~~~nginx
set_real_ip_from 192.0.2.10;
set_real_ip_from 198.51.100.0/24;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
~~~

Replace the example ranges with the provider's documented addresses. Never use
0.0.0.0/0 or ::/0. Test both a request through the trusted hop and a direct
request that forges the header. The browser generator does not guess this policy.

## Upstream TLS

Certificate verification is off by default for proxied HTTPS. Turn it on with
the actual CA bundle and SNI name:

~~~nginx
proxy_ssl_server_name on;
proxy_ssl_name $host;
proxy_ssl_verify on;
proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
proxy_ssl_verify_depth 3;
~~~

Use a fixed upstream name when the certificate identity is different from the
public Host, and test a bad certificate before treating the route as secure.
Do not use proxy_ssl_verify off to get around a staging certificate without
marking that exception and its expiry.

## Caching and privacy

Keep proxy and FastCGI caching off unless the application has a cache contract.
For an explicitly public proxy cache:

- cache only GET/HEAD;
- include scheme, host, and URI in a shared key;
- bypass requests with authorization or session cookies;
- respect Cache-Control, Set-Cookie, and Vary;
- bound disk size and inactivity;
- define invalidation and stale-content behavior.

A cache hit can return one user's response to another if a key or bypass rule is
wrong. Never use proxy_ignore_headers or fastcgi_ignore_headers as a shortcut. A
response with a cookie is a product and privacy decision, not merely a
performance opportunity.

For browser caching, use public, immutable only for content-hashed assets. Keep
index.html, manifests, and service workers revalidated so a deployment can roll
forward.

## Headers and rate limits

server_tokens off reduces version disclosure in the standard response; it is not
a security boundary. X-Content-Type-Options: nosniff is broadly safe. CSP,
framing policy, referrer policy, cross-origin policy, permissions policy, and
HSTS must match the application's scripts, embeds, APIs, and subdomains. Test
them in report-only or staging mode before enforcing a strict policy.

Rate and connection limits protect capacity when they match an endpoint. A
per-IP limit treats many users behind one NAT as one client, and HTTP/2/HTTP/3
multiplexing changes what a concurrent-request limit means. Normalize real IPs
first, run dry-run measurements, and use a clear 429 policy. Do not treat a
copied number as a DDoS service.

## Logs and secrets

Keep error logs at warn or error in normal operation; debug logs are high-volume
and can reveal request data. Include request and upstream timing, status, bytes,
and a safe request ID for investigation. Do not log authorization headers,
cookies, tokens, query secrets, or request bodies.

Send container logs to stdout/stderr where the runtime collects them. Rotate
host logs and restrict readers. Treat generated configuration, expanded nginx -T
output, CI artifacts, and crash dumps as potentially sensitive when they contain
internal hostnames or certificate paths.

## Container checks

The generator image serves the browser UI; it does not deploy or execute the
configuration the UI exports. Run exported NGINX files in a separately reviewed
NGINX service.

For a production container, review these controls:

- run as the image's numeric non-root user;
- publish only the required high port;
- use a read-only root filesystem with a small writable /tmp;
- drop Linux capabilities and set no-new-privileges;
- mount custom files read-only;
- keep the image pinned and rebuild it for base-image security updates;
- use an HTTP health check, not only a process check.

Compose provides the local form of these controls. See [operations](operations.md)
for the release and runtime workflow.

## Security review before exposure

Run this short check after every profile change:

1. nginx -t and nginx -T succeed with the deployed package.
2. Unknown Host and SNI values do not serve application content.
3. Dotfiles, backups, source-control files, private keys, and made-up PHP paths
   return a safe error.
4. Forged forwarded headers cannot change the client identity at the edge.
5. An HTTPS upstream with an invalid certificate fails closed.
6. Authenticated and cookie-bearing responses bypass shared caches.
7. TLS 1.0/1.1 fail; TLS 1.2/1.3 and the intended HTTP protocol succeed.
8. The actual health request, logs, and graceful reload work under the container
   user and filesystem permissions.

Use [benchmarking and validation](benchmarking.md) for the repeatable runtime
checks and [migration](migration.md) when replacing an old configuration.
