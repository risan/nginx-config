# Final documentation and publication audit

Date: 2026-09-20
Candidate: the final uncommitted modernization worktree reviewed before the
release commit. Bind this verdict to the committed tree by rerunning the listed
checks and requiring a clean diff.

## Verdict

**PASS for commit, pull request, and the gated release workflow.** No remaining
documentation or publication blocker was found.

The user-facing guides now match the generator, Docker image, Compose profiles,
and release workflow. The release workflow builds and pushes a commit candidate,
pulls and exercises both AMD64 and ARM64 from its resolved digest, and creates
stable aliases only after those checks pass. Publication itself remains a
release-time operation: this verdict does not claim that a GHCR package or
`v2.0.0` image already exists.

## Final consistency review

- The documented Git tag is `v2.0.0`; the image tag is
  `ghcr.io/risan/nginx-config:2.0.0`, matching the workflow's removal of the
  leading `v`. Digest references are correctly described as immutable, while
  tags are described as movable names.
- README and operations guidance explain that a new GHCR package may be private.
  They require a visibility read-back and do not promise anonymous pulls before
  publication.
- Stable release tags must match exact `vMAJOR.MINOR.PATCH` syntax and point to
  the current `origin/main` commit. The publish job uses only `contents: read`
  and `packages: write`.
- The workflow publishes the multi-platform image under `sha-<12>`, resolves its
  digest, pulls and smoke-tests both `linux/amd64` and `linux/arm64`, and only
  then promotes the verified digest. A stable tag also moves `MAJOR.MINOR`,
  `MAJOR`, and `latest`; a manual run creates only SHA-derived traceable tags.
- The workflow requests BuildKit provenance and an SBOM and sets OCI source,
  revision, and version labels on the published candidate.
- Generator options are documented as service-wide profile choices. README and
  form copy tell users to split locations when WebSocket, response streaming,
  cache, or rate-limit behavior applies to only one route.
- Response streaming disables response buffering while keeping
  `proxy_request_buffering on`. Research and generated comments distinguish it
  from upload streaming, which remains a separately reviewed manual edit.
- The bounded PHP form accepts TCP `host:port`. README, migration, security, and
  tuning guidance consistently say that a Unix socket requires a reviewed
  manual replacement followed by `nginx -t`.
- TLS documentation matches the generated policy: TLS 1.2/1.3, the documented
  TLS 1.2 AEAD cipher list, shared session cache, automatically rotated session
  tickets, and early data off. The Compose TLS profile documents SNI and UID 101
  certificate-read requirements.
- Version maintenance lists every explicit update surface. The version checker
  verifies all Dockerfile NGINX arguments, both Compose occurrences, the pinned
  image used by runtime smoke scripts, and the shell smoke default. The guide
  correctly calls it a guard rather than a complete update procedure.
- Browser commands are root-relative and include `npm --prefix web ci` for a
  clean checkout. Research notes describe the current generator and actual
  Docker Official Image choice rather than a future implementation.
- The patched Vitest 5.0.1 dependency is compatible with the pinned Node 24
  builder and has no reported moderate-or-higher npm advisory in the reviewed
  lockfile.

One harmless wording shorthand remains: README and operations say a manual run
publishes “a traceable commit-SHA tag,” while the workflow retains the
`sha-<12>` candidate and also creates `manual-<12>`. Both are SHA-derived,
movable traceability tags; no stable alias is moved. This does not change the
documented safety property or release behavior.

## Fresh evidence run

The following checks were executed against the final reviewed files:

- `node --test tests/config.test.mjs`: 14/14 passed.
- `node scripts/generate-examples.mjs --check`: 12 generated files current.
- `node scripts/check-nginx-version.mjs`: `NGINX_VERSION=1.30.5` passed.
- `npm --prefix web run test:unit`: 11/11 passed on Vitest 5.0.1.
- `npm --prefix web run build`: passed on Vite 7.3.6.
- `npm --prefix web audit --audit-level=moderate`: zero vulnerabilities.
- `docker compose config`: passed.
- `docker compose --profile tls config`: passed.
- `git diff --check`: passed.

Earlier in this audit, a temporary clean copy without `node_modules` or
`web/dist` passed `npm ci`, all renderer and Vue tests, the production build,
two Playwright tests, generated-example drift, and the version check. All ten
static, SPA, PHP, Go, and proxy HTTP/TLS profiles also parsed in pinned NGINX
1.30.5. The exact pinned NGINX image was inspected and contains the `wget` and
`curl` clients used by its health checks and UID/GID 101 used by the runtime.

All 33 local Markdown links and anchors and 53 external links were checked in
the final documentation pass. Critical version, directive, container, registry,
and security claims were compared with primary NGINX, Docker, GitHub, and RFC
sources. Official NGINX material listed stable 1.30.5 on the audit date.

## Release-time evidence gate

After the pull request merges, the release operator must still record these
facts from the live remote and registry:

1. The merged commit equals `origin/main`, and annotated Git tag `v2.0.0`
   points to that exact commit.
2. Pull-request CI and the tag-triggered publish workflow both succeed.
3. `2.0.0`, `2.0`, `2`, `latest`, and `sha-<12>` resolve to the verified
   published digest.
4. The manifest contains both `linux/amd64` and `linux/arm64`; OCI source,
   revision, and version labels identify the reviewed release; provenance and
   SBOM attestations exist.
5. A container pulled by digest becomes healthy. Package visibility is read
   back explicitly; an unauthenticated pull is required only after the package
   is confirmed public.

GitHub-hosted workflow execution and the registry checks cannot be proved from
the local uncommitted worktree. A successful local review must not be used as a
substitute for those post-merge receipts.
