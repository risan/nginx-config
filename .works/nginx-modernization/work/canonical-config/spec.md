# Canonical NGINX configuration and guides

Status: ready
Scout: ../../scout-nginx-config.md

## Goal
One safe, documented source of truth must produce complete runnable configurations for static, SPA, PHP-FPM, Go, and generic reverse-proxy deployments.

## In scope
- Pure ESM renderer, normalized options, strict validator, profile metadata, and stable schema version.
- Complete generated profile examples and a useful default root configuration.
- Concise comments and documentation grounded in stable free NGINX behavior.

## Out of scope
- Browser UI, container packaging, provider publication, production sizing, and third-party modules.

## Requirements
- R1 — Stable API: `lib/config.js` implements the exact exports, return shapes, flat option set, ownership, and allowed profile IDs in `../../roadmap.md`.
- R2 — Complete output: each accepted input produces a deterministic `nginx.conf` with top-level `events` and `http` contexts, required MIME/logging/network settings, and a complete selected server/profile configuration.
- R3 — Strict validation: validation rejects unknown or inapplicable keys, invalid types and ports, unsafe host/path/upstream characters, schemes or paths in a TCP upstream, and any value that could escape into a new directive.
- R4 — Profile behavior: static serves files; SPA falls back navigational routes to its entry document; PHP sends only intended script requests to PHP-FPM; Go and proxy profiles pass requests through a named upstream with correct fixed forwarding headers and keepalive support.
- R5 — Conservative optimization: worker auto-detection, event capacity, sendfile/TCP behavior, keepalive, timeouts, gzip, proxy buffering, and caches use portable defaults; comments identify workload-dependent settings instead of claiming universal speedups.
- R6 — Security: generated configs hide version tokens, restrict hidden files while preserving a documented ACME exception if present, set broadly safe response headers, constrain request/time limits, and never treat client-provided forwarding headers as trusted origin identity.
- R7 — Explicit options: TLS uses separate HTTP/HTTPS ports and modern stable syntax; HSTS is valid only with TLS; asset/proxy caches, rate limiting, WebSockets, and streaming are opt-in and emitted only where meaningful.
- R8 — Safe caching: static asset caching does not apply immutable caching to arbitrary names; proxy caching never stores or serves authenticated/private responses and remains off by default.
- R9 — Explainability: generated comments and README explain what each option changes, when to enable it, important tradeoffs, and how to validate before production.
- R10 — Reproducible examples: a script writes or checks fixtures for all five profiles from the same renderer; hand-edited drift is detectable.

## Interfaces and data
```js
export const SCHEMA_VERSION = 1;
export const PRESETS = [
  { id: 'static' | 'spa' | 'php' | 'go' | 'proxy', label, description },
];
export const DEFAULT_OPTIONS = {
  profile, serverName, listenPort, httpsPort, documentRoot, upstream,
  tls, certificatePath, certificateKeyPath, gzip, assetCache,
  websocket, streaming, proxyCache, rateLimit, hsts,
};
export function validateOptions(input) {
  return { valid, errors: { field: 'plain correction' }, options: normalizedOrNull };
}
export function generateConfig(input) { /* complete nginx.conf or validation throw */ }
```

`upstream` is one `host:port` endpoint (including localhost), without a scheme or URL path. Profile metadata may supply profile-specific defaults, but normalization accepts only the listed keys.

## Edge cases and failures
- Unknown profile/key or inapplicable option → invalid with a field-level correction; no output.
- Unsafe newline, control, quote, brace, semicolon, whitespace, scheme, traversal, or non-absolute filesystem path where prohibited → invalid; no partial output.
- TLS without both safe certificate paths, HSTS without TLS, or equal HTTP/HTTPS ports → invalid.
- Proxy streaming enabled → buffering is disabled deliberately; the comment warns about the resource tradeoff.
- Proxy cache enabled → bypass/no-store rules protect authorization, cookies, upgrade traffic, and upstream private/no-store responses.
- A directive unavailable in the pinned official stable free image → integrated validation fails and the version cannot advance.

## Must not change
- Generated examples and browser output must use this renderer rather than maintain copies — parent roadmap shared contract.
- Free/open-source NGINX and stock official-image module compatibility — parent brief AC2.

## Acceptance criteria
- [ ] AC1 [R1, R2, R4] — unit tests generate complete parseable-looking output for all five profiles and assert their distinct routing behavior.
- [ ] AC2 [R3] — a table of boundary and injection inputs is rejected with the expected field errors; valid hostname/IP/upstream/path boundaries normalize predictably.
- [ ] AC3 [R5, R6, R7, R8] — tests prove option defaults and on/off output, private proxy-cache bypass, modern TLS/HTTP2 form, streaming/buffering behavior, and forwarding-header policy.
- [ ] AC4 [R9] — README and generated comments explain each supported control and link stable primary NGINX references without unmeasured performance claims.
- [ ] AC5 [R10] — generation check succeeds cleanly, and changing a committed example makes it fail.
