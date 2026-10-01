1. **Major — Customizing only one host certificate path can delete a Certbot live symlink (finding 4).**  
   [render.ts:1181](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:1181) skips installation only when **both** paths match their defaults; otherwise it installs both files. Accepted input with only `certificateKeyPath: '/srv/site.key'` therefore emits `install …/fullchain.pem …/fullchain.pem`. GNU install’s [unlink-before-copy implementation](https://raw.githubusercontent.com/coreutils/coreutils/master/src/copy.c) removes that destination symlink before opening the now-missing source. Bootstrap fails and damages the lineage; [render.ts:1213](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/render.ts:1213) repeats it during renewal. [render.test.ts:917](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/tests/render.test.ts:917) covers only the case where both paths are customized.  
   **Fix:** Decide whether to install each file independently. Test certificate-only and key-only overrides, including preservation of Certbot’s live symlinks.

2. **Minor — The Compose file’s printed HTTP example still produces an unhealthy service (finding 7).**  
   [compose.yaml:30](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/compose.yaml:30) sets `NGINX_SERVER_NAME=example.com`, but the newly HTTP-only example uses `localhost` at [container.conf:72](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/sites-example/container.conf:72). The health probe consequently hits the catch-all and receives 444. [smoke-compose.mjs:51](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/scripts/smoke-compose.mjs:51) substitutes `localhost`, so it misses this printed command.  
   **Fix:** Change the Compose comment to `localhost` and check consistency across the printed examples.

3. **Minor — `derivedDefaults` omits profile-dependent defaults.**  
   [options.ts:256](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/options.ts:256) claims to return every dependent default but omits `gzip`, `gzipStatic`, `immutablePaths`, and `clientMaxBodySize`, which vary in [defaultsFor:305](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/lib/options.ts:305). Applying it after changing a static profile to PHP leaves compression enabled, immutable paths empty, and uploads limited to `1m` instead of `16m`. [options.test.ts:413](/home/risan/projects/code/nginx-config/.claude/worktrees/astro-builder-audit/tests/options.test.ts:413) compares only returned keys, so it cannot detect omissions. Purity probes found no input mutation or shared upstream objects.  
   **Fix:** Include the missing dependent defaults and test transitions between profiles against `defaultsFor`.

Validation: 88 unit tests passed; type checking, 14 generated-example comparisons, and version-pin checks passed. Docker runtime checks were not executed.

**Verdict: REVISE.**

