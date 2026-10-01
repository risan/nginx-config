Read-only review; no runtime tests executed. `web/` changed during review, so original frontend references use HEAD `ff21d8a`. All requested `nginx -t` checks below must use the pinned 1.30.5 image.

1. **[Blocker] Part 1 — Immutable locations bypass security rules.**  
   `plan.md:204–205` uses `location ^~`, which skips the regex protections against dotfiles, backups, and PHP source. `/assets/.env`, `/build/config.sql`, or `/build/debug.php` could become downloadable. Evidence: [NGINX location selection](https://nginx.org/en/docs/http/ngx_http_core_module.html#location), current `lib/config.js:646–705`. **Fix:** preserve security matching inside asset locations or use ordinary prefixes with ordered regex protections. Add HTTP tests proving sensitive files and PHP source remain inaccessible.

2. **[Blocker] Part 1 — PHP matching becomes case-sensitive.**  
   `plan.md:209` changes the current `location ~* \.php$` to `~ \.php$`. An existing `debug.PHP` can fall through to static serving and disclose source. Evidence: `lib/config.js:714`, [location matching](https://nginx.org/en/docs/http/ngx_http_core_module.html#location). **Fix:** retain case-insensitive handling or explicitly deny unsupported case variants. Test `.php`, `.PHP`, and mixed-case filenames.

3. **[Major] Part 1 — QUIC and PROXY protocol are incompatible.**  
   `plan.md:176–179,246–247` independently enables both and adds PROXY protocol to listen lines. NGINX explicitly rejects `listen … quic proxy_protocol`. Evidence: [1.30.5 parser](https://raw.githubusercontent.com/nginx/nginx/release-1.30.5/src/http/ngx_http_core_module.c). Ordinary HTTP probes also cannot use a PROXY-protocol listener. **Fix:** reject this combination and define compatible health/challenge listeners. Run `nginx -t` for PROXY-only and QUIC-only configurations; test the combined input is rejected by validation.

4. **[Major] Part 1 — Zero burst needs special rendering; rate-limit scope is incomplete.**  
   `plan.md:102` accepts zero, but explicit `burst=0` fails parsing; zero means omit `burst`. The wording at `:225` also risks making limiting conditional on multiple backends, while WebSocket/SSE locations escape `location /` limits. Evidence: [1.30.5 burst validation](https://raw.githubusercontent.com/nginx/nginx/release-1.30.5/src/http/modules/ngx_http_limit_req_module.c). **Fix:** specify zero handling, preserve status 429, and apply the policy to every intended dynamic location. Run `nginx -t` with burst zero, one, and dry-run; exercise single-backend and special-path limits.

5. **[Major] Part 1 — Missing cross-option validation permits invalid configurations.**  
   `plan.md:78,89,107–109,120–127` lacks rules for hash balancing with backups, all-backup pools, duplicate locations, and `/` or dot segments in immutable prefixes. Hash plus backup is explicitly unsupported. Evidence: [upstream server parameters](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#server). **Fix:** define these relationships and recursively validate list entries and unknown nested keys. Reject conflicting paths before rendering; run `nginx -t` for each supported balancing/backup combination.

6. **[Major] Part 1 — `wwwRedirect` certificate ownership remains undecided.**  
   `plan.md:191–194` proposes listing both names in the redirect server, potentially conflicting with the application server. ACME identifiers and certificate variables belong to the server containing `acme_certificate`; they are not automatically shared between sibling servers. Evidence: [ACME certificate directive](https://nginx.org/en/docs/http/ngx_http_acme_module.html#acme_certificate). **Fix:** specify disjoint canonical/alias `server_name` blocks and explicit certificate identifiers covering both names in every relevant TLS server. Run `nginx -t`, then verify both SNI names and redirects without disabling certificate verification.

7. **[Major] Part 1 — Certificate deployment has no complete bootstrap contract.**  
   `plan.md:168–174,185–194,255–258` does not establish initial manual-certificate provisioning before `nginx -t`, challenge handling for both names, or UID-101 ownership of persistent ACME state. Missing manual certificates prevent configuration testing/startup. Evidence: `Dockerfile:27`, [SSL certificate loading](https://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_certificate), [ACME state storage](https://nginx.org/en/docs/http/ngx_http_acme_module.html#state_path). **Fix:** document an HTTP-only manual bootstrap and exact writable state mounts. Test native HTTP-01 issuance through the redirect server with a local ACME fixture, plus restart persistence; syntax checks alone cannot prove issuance.

8. **[Major] Part 1 — Public scheme and port handling is unfinished.**  
   `plan.md:113,220–245` hides `publicHttpsPort` when local HTTPS is off, although TLS termination upstream requires it. There is no public HTTP port, PHP still receives transport-local scheme/port parameters, and retaining `$scheme` in cache keys conflates externally HTTP/HTTPS requests arriving over HTTP. Evidence: `lib/config.js:734`, [realip original-peer variable](https://nginx.org/en/docs/http/ngx_http_realip_module.html#embedded_variables), [standard FastCGI parameters](https://raw.githubusercontent.com/nginx/nginx/master/conf/fastcgi_params). **Fix:** define one validated external scheme/port policy, gate XFP using `$realip_remote_addr`, and use it consistently in proxy metadata, PHP, cache keys, and redirects. Test trusted and untrusted senders, including malformed XFP.

9. **[Major] Part 1 — Upstream TLS cannot derive certificate identity from the first address.**  
   `plan.md:239–241` breaks common pools containing IP addresses, Unix sockets, or distinct DNS endpoints serving one logical certificate name. Evidence: [proxy SSL name](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ssl_name). **Fix:** add an explicit validated TLS server name and define compatible pool members. Keep verification enabled. Test successful failover with the intended identity and rejection of mismatched certificates; `nginx -t` cannot verify backend identity.

10. **[Minor] Part 1 — FastCGI parameters are duplicated.**  
    `plan.md:210–212` includes `fastcgi_params`, which already defines `DOCUMENT_ROOT`, then adds another value. This emits duplicate parameters rather than specifying one unambiguous override. Evidence: [official parameter file](https://raw.githubusercontent.com/nginx/nginx/master/conf/fastcgi_params). **Fix:** emit a complete parameter set with each overridden key once. Inspect PHP’s received values and test a symlink release switch with matching filesystem paths in NGINX and FPM.

11. **[Major] Part 2 — Astro CSP support does not fix the retained Workers header.**  
    `plan.md:369–371` suggests Astro hashes as a fallback, but Astro emits a CSP meta tag. The existing `script-src 'self'` response header still independently blocks inline island bootstrap scripts. Evidence: `web/public/_headers:6`, [Astro CSP](https://docs.astro.build/en/reference/configuration-reference/#securitycsp), [multiple-policy enforcement](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy#multiple_content_security_policies). **Fix:** put required hashes in the effective response policy, or deliberately split policy ownership without conflicting directives. Test the built site through `wrangler dev`; `astro preview` does not verify Workers `_headers`.

12. **[Major] Verification — “Every option once” misses the dangerous interactions.**  
    `plan.md:283–295` omits observable tests for DNS re-resolution, failover, realip spoofing, FastCGI cache privacy, symlink deployment, compression negotiation, and actual HTTP/3 requests. Header inheritance also needs response-level assertions: `merge` appends; it does not deduplicate. Evidence: [header inheritance](https://nginx.org/en/docs/http/ngx_http_headers_module.html#add_header_inherit), existing `scripts/smoke-php.mjs:92–101`. **Fix:** name mandatory interaction cases and assert outcomes, including one copy of each security header on HTML, assets, errors, and health responses. Run `nginx -t` with IPv4/IPv6 QUIC reject/application/alias servers, then perform an HTTP/3 request.

13. **[Major] Repo migration — Release CI still invokes deleted tests.**  
    `plan.md:377–378` updates only `ci.yml`; `.github/workflows/publish-image.yml:32` still invokes `tests/config.test.mjs`. Moving tests to `.ts` leaves releases broken. **Fix:** inventory every consumer of renamed modules/tests and update both workflows, scripts, and version checks. Run the complete release-validation command sequence.

14. **[Minor] Part 2 — Shared TypeScript coverage needs an explicit project boundary.**  
    `plan.md:59–61,364–367` uses Node type stripping, which performs no type checking. A web-root `astro check` need not include all root scripts/tests. The research also leaves TS7 compatibility unverified (`research-frontend.md:88`). **Fix:** establish and run explicit type-check coverage for `lib/`, `scripts/`, and `tests/`; lock the compatible compiler before the rewrite. Give Oxfmt and Prettier disjoint file coverage and verify formatting is idempotent.

15. **[Minor] Part 2 — Docs rewriting misses repository-file links.**  
    `plan.md:317–319` rewrites `.md` links only. Existing docs link to `../web/wrangler.jsonc` and `../.github/workflows/ci.yml`, which will resolve incorrectly from `/docs/…`. Evidence: `docs/operations.md:15,169–170`. **Fix:** rewrite repository-file links to GitHub URLs, preserve fragments, and check all built documentation links.

16. **[Minor] Verified facts/http globals — Evidence and default comments are inaccurate.**  
    `plan.md:26` claims `imagetools inspect` ran; `research-nginx-facts.md:9–13` says it did not. At `plan.md:140–142`, `client_body_timeout 60s` and `send_timeout 60s` are defaults, so comments cannot claim otherwise. Evidence: [body timeout](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_body_timeout), [send timeout](https://nginx.org/en/docs/http/ngx_http_core_module.html#send_timeout). **Fix:** correct provenance and distinguish retained defaults from changed settings; record actual pinned-image inspection before implementation qualification.

17. **[Minor] Part 1 — `gzip_static` is inhibited by the chosen proxy policy.**  
    `plan.md:206,251–253` enables precompressed assets but retains `gzip_proxied off`. Requests carrying `Via` can therefore miss `.gz` delivery. Evidence: [gzip_static dependencies](https://nginx.org/en/docs/http/ngx_http_gzip_static_module.html#gzip_static), [Via-based detection](https://nginx.org/en/docs/http/ngx_http_gzip_module.html#gzip_proxied). **Fix:** scope compression policy to public static locations and test gzip/identity negotiation with and without `Via`.

18. **[Minor] Scope/UX — Low-value controls crowd out deployment essentials.**  
    `plan.md:71–118` exposes extensive tuning while certificate bootstrap and backend TLS identity remain incomplete. **Fix:** defer status, connection limits, log buffering, gzip level, and COOP to advanced settings; group dynamic/precompressed compression together. Prioritize working HTTPS deployment, trusted-proxy handling, upload limits, and backend connection settings.

**Verdict: REVISE.**

