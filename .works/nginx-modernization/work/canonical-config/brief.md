# Canonical NGINX configuration and guides

Status: ready
Type: perf
Route: bounded-change — the profiles share one renderer and one validation/security contract.
Next: draft-spec

## Request
Implement the configuration and documentation portion of [the parent initiative](../../brief.md).

## Goal
Make one safe, documented source of truth produce complete configurations for the five supported deployment profiles and readable checked-in examples.

## Target
- `lib/config.js` — shared validation, profile metadata, defaults, and rendering API.
- `examples/`, root `nginx.conf`, and existing configuration directories — generated and compatibility examples.
- `scripts/generate-examples.mjs`, `tests/config.test.mjs` — drift checking and renderer behavior.
- `README.md` and configuration guides — owned by the documentation owner; explain the rendered profiles and safe tuning boundaries.
- Pattern to follow: `../../scout-nginx-config.md` — preserve the useful copy-and-customize model while replacing dated universal tuning claims.

## Acceptance criteria
- [ ] The locked API and option contract in `../../roadmap.md` is implemented without framework or Node-only runtime dependencies.
- [ ] Every profile renders a deterministic, complete configuration and all committed examples match renderer output.
- [ ] Strict validation blocks configuration injection and reports concise field-level errors.
- [ ] Defaults are safe for a small local deployment; costly, privacy-sensitive, irreversible, or origin-specific behaviors require a deliberate choice.
- [ ] Tests cover every profile, option applicability, unsafe input, deterministic output, and example drift.
- [ ] Documentation distinguishes portable defaults from measurements and tuning decisions an operator must make.

## Out of scope
- The Vue interface (`web-generator`).
- Containers, CI, GHCR, and integrated NGINX runtime checks (`container-verification`).
- Branch migration (`main-branch`).
