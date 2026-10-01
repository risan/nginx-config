Round 2 of the web verification. Your round-1 findings are in `.works/nginx-builder-v2/verify-web.md`. The fixes are in the commits after `52d8515` that touch `web/` (`git log --oneline 52d8515..HEAD -- web` and `git diff 52d8515..HEAD -- web`). The renderer added `derivedDefaults` in `lib/options.ts`, which the UI now uses.

Check only:
1. Does each fix actually resolve its round-1 finding (1–11)? Read code and tests.
2. Any new Blocker or Major issue introduced: state/reducer bugs (edited-field tracking, derived defaults on every edit, hidden-field reset before validation, share links omitting derived fields), CSP (style-src-elem hashes, style-src-attr), accessibility, mobile sheet, tests that do not prove their claim.

Read-only sandbox; cite file:line. Output numbered findings tagged Blocker / Major / Minor with evidence and fix, then a verdict APPROVE / APPROVE WITH CHANGES / REVISE. No praise; do not repeat resolved items.
