# Container distribution and integrated verification

Status: ready
Type: feature
Route: bounded-change — the image, Compose flow, CI checks, runtime matrix, and release workflow form one distribution boundary.
Next: draft-spec

## Request
Build and verify the container/GHCR portion of [the parent initiative](../../brief.md).

## Goal
Offer a small ready-to-run image for the generator and automated evidence that rendered configurations work on the pinned latest stable free NGINX before release images can be published.

## Target
- `Dockerfile`, `.dockerignore`, `compose.yaml` — consume the canonical version from `lib/version.js`, provide local build/run, and support an optional TLS mount.
- `.github/workflows/` — PR/main validation and tag/manual GHCR publication.
- Integration scripts/tests — NGINX syntax, runtime, image, and release checks.
- Evidence: `../../scout-nginx-config.md` — Docker/Compose are available, host NGINX is absent, and the repository has no existing CI/container convention.

## Acceptance criteria
- [ ] The built image serves the production Vue application over local HTTP using the generated safe default config.
- [ ] Compose starts the image predictably and documents/makes available an optional mounted TLS configuration and certificates.
- [ ] The test matrix parses all generated profiles on the exact pinned stable free NGINX image and exercises representative HTTP/proxy/security/cache behavior.
- [ ] PR and `main` workflows test/build without publishing; only `v*` tags or manual dispatch publish multi-architecture GHCR images.
- [ ] Publication permissions are least privilege and image tags/labels/provenance are traceable to the source revision.

## Out of scope
- Automatically triggering a release or publishing during this work.
- Deploying the image to a hosting platform.
- Editing the renderer, Vue application, README, or branch refs.

## Assumptions
- Child 1 supplies the generated default config and version source; child 2 supplies the production application build, as recorded in `../../roadmap.md`.
