# Web and documentation product review

Status: pass — no product blocker; one low documentation follow-up
Reviewed: 2026-09-20
Scope: final targeted refresh of the files changed for the five prior findings

## Verdict

The five product findings are resolved in the current candidate:

- The preview is capped at `min(65vh, 48rem)`, scrolls internally, and the download/copy actions are now above it. The current 375 px screenshot shows a usable single-column flow with no horizontal overflow.
- Search metadata no longer says the output is production-ready.
- README describes the connection setting as a portable starting point tied to service file limits.
- The app now says “No external requests.”
- Operations documentation accurately says the runtime contains both built web assets and its generated internal `nginx.conf`, while user-exported configurations remain separate.

No schema labels remain in the product UI. The current default ports remain 8080/8443.

## Remaining low finding

### F1 — Low — The validation guide does not list the Playwright command

`docs/benchmarking.md` now lists the renderer, example-drift, Vitest, Vite build, version, NGINX matrix, and diff checks. It calls these “browser” checks but omits `npm --prefix web run test:browser`, the runtime suite that verifies downloads and narrow viewport behavior.

Add that command after the build command and mention its Chromium dependency. This is a documentation completeness issue; CI already runs the suite and the builder reports it passing.

## Changed-file snapshot

- Base HEAD: `9a2acdc327f6c2cea42540653768043b4cde99c6`; reviewed worktree is uncommitted.
- `web/src/App.vue`: `2c75f1bfe7d8a068848626e8be1d664a386d2a2d43e06b106a2da9cb71664dcf`
- `web/src/style.css`: `b20d482c981ecadfedf718df850a1bac3244ffd0f05c4bf66bf3162d6a57bf57`
- `web/src/App.test.js`: `f2d6e4b8a39f60f75329cbd6583e91ba2b11495f2252804e42cf27dca58cb3c6`
- `web/tests/generator.spec.js`: `c5c720cb57b2ca8ae3350b971bdad513d2e9815aff8e140340af0e70639364ad`
- `web/index.html`: `b9d27f76a871b9a8edcbe565326ed488815c4cdec15e5d12f4eb3e0bbf69b4c8`
- `README.md`: `12604c373005da664d16e35be0c9dabd7e784c147c5815df69c807a262f74b91`
- `docs/benchmarking.md`: `9d5ae99cd74de0d3fd6075281007bf1205b241cb341dd627f46e53ef05380a84`
- `docs/operations.md`: `43e4e6f200cf980f4e5ad32b754fc27318e2492fd6975b62c4cc7d2a5302b605`

## Evidence

- Builder receipt: 11 unit tests, 2 Chromium browser tests, and production build passed after the focused fixes.
- Targeted inspection confirms export actions precede the bounded preview and the browser test asserts the frame scrolls while the top export action remains visible.
- `git diff --check -- web README.md docs/benchmarking.md docs/operations.md`: passed in this refresh.
- Current mobile screenshot: `/tmp/nginx-config-review-mobile-final.png` (375 × 1000 viewport, full page).
- Browser readback: document width 375 px, preview client height 648 px, preview scroll height 2110 px. The code is contained within its own scroll region.
