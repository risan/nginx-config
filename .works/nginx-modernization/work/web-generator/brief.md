# Vue browser configuration generator

Status: ready
Type: feature
Route: bounded-change — the application is one client-only workflow with validation, preview, copy, and download behavior.
Next: draft-spec

## Request
Build the Vue + Vite browser generator portion of [the parent initiative](../../brief.md).

## Goal
Let a user choose a supported deployment profile and safe options, understand each choice, and copy or download the exact complete configuration produced by the shared renderer.

## Target
- `web/` — all application, package, styling, accessibility, and browser/unit-test files.
- Pattern to follow: `../../../lib/config.js` contract in `../../roadmap.md` — sole source of validation and generated directives.
- Evidence: `../../scout-nginx-config.md` — no existing frontend toolchain or competing application convention exists.

## Acceptance criteria
- [ ] The application supports all five profiles and only displays relevant fields/options.
- [ ] Field errors are clear, copy/download is blocked when invalid, and output updates deterministically when valid.
- [ ] Copy and download produce the exact renderer output as `nginx.conf`.
- [ ] The layout works with keyboard and touch on narrow and wide screens and never requires a backend.
- [ ] Build and focused interaction tests pass.

## Out of scope
- Renderer/directive logic (`canonical-config`).
- Container and CI packaging (`container-verification`).
- Hosting/deployment of the application.

## Assumptions
- Child 1 provides the exact framework-free ESM contract recorded in `../../roadmap.md`; the app may scaffold against it before the child is complete.
