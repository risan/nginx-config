# Follow-up default-port review

Status: **PASS — no open finding in the follow-up diff**

Reviewed the frozen eight-file follow-up diff on `fix-go-upstream-default`.

## Evidence

- `node --test tests/config.test.mjs`: 17/17 passed.
- `node scripts/generate-examples.mjs --check`: 12 generated files current.
- `git diff --check`: passed.
- Focused validator probes reject `127.0.0.1`, all tested `127/8` forms,
  decimal/hex/octal numeric aliases, `localhost`, expanded `::1`, and
  IPv4-mapped loopback addresses when they reuse the HTTP or enabled HTTPS
  listener. They allow `backend:8080`, private IPv4, and global IPv6 hosts at
  the same numeric port as intended.
- `validateOptions({ profile: 'go', listenPort: 8080, upstream: '0.0.0.0:8080' })`
  and the equivalent `[::]:8080` case are now rejected, as are numeric and
  IPv4-mapped unspecified aliases even when they use a different port.
- A temporary listener bound to `0.0.0.0:<port>` accepted a connection made
  to `0.0.0.0:<port>` on this runner, confirming why the new rejection is
  needed for same-network namespace safety.

## Finding

The wildcard-address gap from the first pass is resolved by
`isUnspecifiedHost`, which rejects IPv4/IPv6 unspecified literals and their
numeric or mapped aliases before the loopback collision check. The default
change to `127.0.0.1:8081`, numeric loopback coverage, same-namespace Go
smoke, examples, tests, and operations documentation pass review. Separate
DNS/private/global hosts at the same port remain accepted, and no arbitrary
DNS resolution is introduced.
