Round 2 of the renderer verification. Your round-1 findings are in `.works/nginx-builder-v2/verify-renderer.md`. The fixes are in commit `ba30b6e` (diff: `git diff 7d8da7d..ba30b6e -- . ':(exclude)web' ':(exclude).works'`). The plan is `.works/nginx-builder-v2/plan.md` (including revisions R1–R23).

Check only:
1. Does each fix actually resolve its round-1 finding (1–10)? Read the code and tests, not just the commit message.
2. Did the fixes introduce any new Blocker or Major issue: NGINX correctness for 1.30.5 (plain-prefix ws/events locations vs other locations and regexes, ACME namespace reservation edge cases, certificate install/renew commands and file permissions, container `nginx -t` command, compose examples), validation holes, docs contradictions, or tests that do not prove their claim.
3. `derivedDefaults` purity and agreement with `defaultsFor`.

Read-only sandbox; cite file:line. Output numbered findings tagged Blocker / Major / Minor with evidence and fix, then a verdict APPROVE / APPROVE WITH CHANGES / REVISE. No praise; do not repeat resolved items.
