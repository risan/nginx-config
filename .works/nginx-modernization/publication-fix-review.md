# Multi-architecture publication fix review

Status: **PASS — child-platform verification now gates original-index promotion**

Reviewed the frozen three-file delta on `fix-multiarch-publication`:

- `.github/workflows/publish-image.yml`
- `README.md`
- `docs/operations.md`

## Evidence

- The extracted post-push workflow block passes `bash -n`.
- `git diff --check` passes.
- Against the public candidate index
  `sha256:48d2b1e53ba1aa57a5332c24f783fe61b8c731469a320110ad70c9fc00b36223`,
  credential-free registry inspection returned the same raw-byte SHA-256.
- The workflow's `jq` selector found exactly one Linux child per requested
  platform and ignored the two `unknown/unknown` attestation descriptors:

  - `linux/amd64` ->
    `sha256:4ac502aac8d1a4a68935e08017cba8d42928442e2ae972e4eb13cf5d5e65abc8`
  - `linux/arm64` ->
    `sha256:73c40d24ba5313c7ebfcf0cf1e00e240166e18601cf5235ac9aaef1bc8876d94`

- Registry HEAD checks returned HTTP 200, OCI image-manifest media types, and
  matching `docker-content-digest` values for both child manifests.
- The worker's isolated-Docker receipt reports both child pulls passing and the
  AMD64 smoke passing. ARM64 execution stopped locally at `exec format error`
  because this runner lacks QEMU; the workflow's publish job installs arm64
  QEMU before it runs the same smoke.
- The loop pulls and smoke-tests each child digest with its explicit platform;
  `set -eu`, exact-one checks, digest-format validation, pull failure, or smoke
  failure exits before either `imagetools create` promotion step. Promotion
  uses the original multi-architecture index digest, preserving attestations.
- README and operations release examples consistently point to `2.0.1`; the
  existing `v2.0.0` tag is not changed by this source delta.

## Finding disposition

The prior failure was caused by pulling both platforms through the same
multi-architecture index digest in Docker's classic image store. The workflow
now resolves each platform child from the exact pushed index, tests both child
images, and promotes the original index only after both checks pass. No open
workflow or user-facing documentation finding remains.

The local ARM64 execution limitation is environmental, not a workflow failure.
Release CI remains the authoritative runtime gate for both AMD64 and ARM64;
this limitation does not weaken the workflow's fail-closed ordering or the
registry digest selection evidence above.
