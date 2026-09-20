# Rename the default branch to main

Status: ready
Type: chore
Route: quick-change — this is a bounded repository/provider ref update with direct read-back checks.
Next: implement

## Request
Rename `master` to `main` as part of [the parent initiative](../../brief.md).

## Goal
Use `main` locally and as the remote default branch without losing commits or leaving authoritative automation on `master`.

## Target
- Local Git branch refs — rename the checked-out branch while preserving its commit.
- Remote repository refs/default setting — publish `main`, switch default, and remove obsolete `master` only when the provider permits it safely.
- Workflow/docs branch filters — use `main` where the name is authoritative.
- Evidence: `../../scout-nginx-config.md` — the initial checkout tracked `origin/master` at `9a2acdc` and the provider default was `master`.

## Acceptance criteria
- [ ] Local `main`, remote `main`, and the provider default branch point to the intended commit.
- [ ] Upstream tracking uses `origin/main` and authoritative automation contains no stale `master` trigger.
- [ ] Remote `master` is removed only after `main` is verified as the default and commit-equivalent branch.

## Out of scope
- Committing or publishing unrelated source changes.
- Merging a pull request or triggering GHCR publication.

## Completion evidence
- Local `main`, remote `main`, upstream tracking, and the remote default/HEAD were read back at commit `9a2acdc327f6c2cea42540653768043b4cde99c6`.
- The obsolete remote `master` ref was removed only after the default branch switch was verified.
