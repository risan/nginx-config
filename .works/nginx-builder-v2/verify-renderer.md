Reviewed `f4f9fa5..52d8515`, excluding `web/` and `.works/`.

1. **Major — Accepted custom paths can break ACME bootstrap.**  
   [options.ts:1113](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/options.ts:1113) and [options.ts:1217](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/options.ts:1217) do not reserve the challenge namespace emitted at [render.ts:556](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:556). Confirmed accepted inputs include `websocketPath: '/.well-known/acme-challenge/'`, which generates duplicate prefix locations, and `streamingPath: '/.well-known/acme-challenge/a'`, which takes over challenge tokens starting with `a`. Immutable paths can collide too. The longer prefix wins under [NGINX’s location rules](https://nginx.org/en/docs/http/ngx_http_core_module.html#location), violating R20.

   **Fix:** Reserve the entire challenge namespace across all three options. Add indexed validation assertions and runtime challenge coverage.

2. **Major — WebSocket and streaming paths bypass dotfile protection.**  
   The denial at [render.ts:740](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:740) cannot protect requests under the `^~` locations at [render.ts:917](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:917) and [render.ts:933](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:933). For example, `/ws/.git/config` and `/events/.env` reach the backend instead of receiving the edge denial. [NGINX skips regex locations after selecting a longest `^~` prefix](https://nginx.org/en/docs/http/ngx_http_core_module.html#location). This regresses the old renderer’s protection and contradicts B10.

   **Fix:** Use plain prefixes for these proxy locations, or preserve equivalent denial within them. Test dotfile requests beneath both paths.

3. **Major — Host certificate bootstrap uses the wrong lineage after canonicalization.**  
   Defaults use the raw server name at [options.ts:236](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/options.ts:236), while [render.ts:1126](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:1126) orders Certbot domains canonical-first. With `serverName: 'example.com'` and `wwwRedirect: 'to-www'`, NGINX expects `/etc/letsencrypt/live/example.com/…`, but the command at [render.ts:1167](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:1167) creates the `www.example.com` lineage on a fresh installation. [Certbot defaults the lineage name to the first domain](https://eff-certbot.readthedocs.io/en/stable/using.html#where-are-my-certificates). Switching HTTPS on therefore fails.

   **Fix:** Choose an explicit, consistent `--cert-name` and derive certificate paths from it. Cover both redirect directions with default paths.

4. **Major — Certificate deployment ignores accepted custom paths.**  
   [render.ts:1186](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:1186) always copies container certificates into `./tls/<serverName>/`, regardless of `certificatePath` and `certificateKeyPath`. An accepted configuration using `/etc/nginx/tls/fullchain.pem` and `/etc/nginx/tls/privkey.pem` therefore receives files in the wrong directory. The fixed mount at [render.ts:1141](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:1141) also cannot support accepted paths outside `/etc/nginx/tls`. Host custom paths receive no installation or renewal-copy step either.

   **Fix:** Derive installation destinations, mounts, and renewal commands from the configured paths, or explicitly constrain deployment-supported paths. Test that installed filenames equal the rendered directives.

5. **Major — The default container certificate bootstrap cannot complete as printed.**  
   [render.ts:1185](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:1185) runs Certbot without `-it` or noninteractive account-registration options. A fresh account needs registration input; the [official Docker instructions provide an interactive terminal](https://eff-certbot.readthedocs.io/en/stable/install.html#running-with-docker). Afterwards, the unprivileged `cp` at [render.ts:1196](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:1196) cannot read ordinary root-owned Certbot output: [its containing directories default to `0700` and private keys to `0600`](https://eff-certbot.readthedocs.io/en/stable/using.html#where-are-my-certificates). Changing the destination key to `644` also unnecessarily exposes it to other host users.

   **Fix:** Make first issuance explicitly interactive, then install and renew through a privileged helper with ownership/group permissions allowing UID 101 to read the key. Exercise the printed sequence from an empty certificate directory.

6. **Major — The container configuration test omits required runtime mounts.**  
   The command at [render.ts:1240](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:1240) mounts only `nginx.conf`. A manual TLS configuration fails this test even when its certificates exist under the documented host directory. It also tests as root rather than UID 101. Conversely, the HTTPS switch at [render.ts:1201](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:1201) removes the running container before validating the final TLS configuration.

   **Fix:** Test with the selected runtime mounts, identity, and writable paths, and require that test to succeed before replacing the running container.

7. **Major — The documented Compose mount example cannot start.**  
   [README.md:117](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/README.md:117) and [operations.md:61](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/docs/operations.md:61) mount `sites-example/container.conf` into the HTTP service with `NGINX_SERVER_NAME=localhost`. That example enables TLS for `example.com` and requires certificates at [container.conf:104](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/sites-example/container.conf:104). The HTTP service mounts no certificates at [compose.yaml:34](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/compose.yaml:34). Its health-check Host also disagrees with the example.

   **Fix:** Use a genuine HTTP-only container example for these commands, with a matching server name. Keep the TLS example with the TLS service and its required mounts.

8. **Minor — The WebSocket smoke test proves headers, not an upgrade.**  
   [smoke-proxy.mjs:80](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/scripts/smoke-proxy.mjs:80) calls an echo helper that requires HTTP 200; its backend always returns 200 at [smoke-kit.mjs:214](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/scripts/smoke-kit.mjs:214). No handshake, 101 response, or tunneled frame is exercised. NGINX’s tunnel requires [a backend 101 response](https://nginx.org/en/docs/http/websocket.html). This leaves the planned upgrade proof and the documented 101/echo acceptance check unfulfilled.

   **Fix:** Add a real WebSocket handshake and frame echo, retaining the existing ordinary-request keepalive assertions.

9. **Minor — HTTP/3 qualification still permits a successful reduced run.**  
   [smoke-http3.mjs:54](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/scripts/smoke-http3.mjs:54) returns successfully without a real HTTP/3 request when `ALLOW_NO_HTTP3_CLIENT` is set locally. CI rejects this situation, but the local qualification command still reports `PASS (REDUCED)`. Binding R22 requires stopping and reporting the blocker when the real request is impossible.

   **Fix:** Make missing-client qualification exit unsuccessfully. Put listener-only diagnostics in a separate command that cannot count as qualification.

10. **Minor — Operational documentation contradicts the implementation.**  
    [security.md:201](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/docs/security.md:201) says PROXY-protocol health checks require the proxy, contradicting R19’s plain loopback listener. [tuning.md:286](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/docs/tuning.md:286) claims an HTTP-level upstream resolver, contradicting the renderer and its next paragraph. [benchmarking.md:86](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/docs/benchmarking.md:86) attributes smoke-test timing to `valid=30s`, although [smoke-resolve.mjs:44](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/scripts/smoke-resolve.mjs:44) changes it to `1s`.

    **Fix:** Document the loopback probe exception, upstream-level resolver, and shortened test interval accurately.

Validation performed: **80 unit assertions passed**, strict TypeScript checking passed, all 13 generated files matched, and version-pin consistency passed. Docker syntax/runtime tests were **not executed** in this read-only review; the NGINX findings above follow from generated output and documented behavior.

**Verdict: REVISE.**

