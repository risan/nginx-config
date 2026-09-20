# Release execution receipt

Date: 2026-09-20 (Asia/Jakarta)

## Prepublication gate

The commit and pull-request gate is open after the independent performance and
documentation audits passed and the frozen candidate validation lane passed its
local matrix. The reviewed product candidate contains 66 non-ignored files and
has audit fingerprint
`sha256:9bba2faac194b22bc83d98ae6caddaf2c569ab51105a31ec533bfaf880775d45`.
The saved per-file manifest was rechecked against the current worktree with no
per-file differences; the local recomputation uses a different line
canonicalization and is therefore not used as a competing fingerprint.

The local `final-validation.md` receipt is treated as historical, precommit
baseline evidence. The authoritative frozen-commit evidence for this release
will come from successful pull-request CI, exact-head and tree checks, main
branch CI after merge, and the tag-triggered publication workflow.

The intended commit includes the modernization source, generated examples,
documentation, tests, workflows, Docker/Compose files, and review receipts.
Ignored dependency, build, browser-report, test-result, and private certificate
artifacts remain excluded. Publication is gated on exact merged identity,
multi-architecture image verification, OCI revision/runtime checks, and an
anonymous pull/readback where package visibility permits it.
