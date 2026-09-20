# Vue browser configuration generator

Status: ready
Scout: ../../scout-nginx-config.md

## Goal
Users can create a complete supported configuration in a clear client-only workflow and export exactly what the canonical renderer produced.

## In scope
- Vue + Vite single page UI in `web/`.
- Profile selection, relevant inputs/toggles, help text, error display, live preview, copy, and file download.
- Responsive, keyboard-accessible interactions and focused tests.

## Out of scope
- Raw directives, multi-upstream editing, custom headers, server-side storage, accounts, hosting, or a second renderer.

## Requirements
- R1 — Canonical behavior: the app imports `PRESETS`, `DEFAULT_OPTIONS`, `validateOptions`, and `generateConfig` from `../lib/config.js`; it contains no NGINX directive templates.
- R2 — Guided form: all five profiles are selectable, descriptions are plain, only applicable controls are enabled/shown, and dependent controls such as certificate paths and HSTS follow TLS state.
- R3 — Safe feedback: validation errors are associated with their fields, summarized accessibly, and prevent copy/download while preserving the user's editable values.
- R4 — Exact preview/export: valid changes update a readable preview; clipboard text and downloaded `nginx.conf` bytes exactly equal `generateConfig` output.
- R5 — Recovery: clipboard denial/failure yields a useful message without losing state; download works through browser-native behavior; refresh resets to documented defaults.
- R6 — Accessibility/responsiveness: every control has a label/help relationship, status changes are announced, focus is visible, and the form/preview remain usable on a narrow phone viewport without sideways page scrolling.
- R7 — Client-only privacy: generation occurs locally and the production build makes no application/runtime network request beyond loading its own static files.

## Interfaces and data
The app submits only the flat option shape defined in `../../roadmap.md`. It treats normalized options returned by validation and rendered text as derived state; no config is uploaded or persisted.

## Edge cases and failures
- Switching profile → preserve shared safe values, reset or omit inapplicable values, and revalidate before output.
- Invalid input → keep the last editable input visible but remove/disable export actions and clearly mark the problem.
- Clipboard API unavailable/rejected → show failure guidance; download remains available.
- Very long valid config → preview scrolls inside its region while the page controls remain reachable.

## Must not change
- Renderer output, defaults, and validation messages remain owned by `lib/config.js` — parent roadmap shared contract.

## Acceptance criteria
- [ ] AC1 [R1, R2] — tests exercise each profile and verify the expected relevant controls with no duplicated directive source.
- [ ] AC2 [R3, R4] — an invalid form blocks both exports; a valid form's preview, clipboard payload, and downloaded file equal renderer output.
- [ ] AC3 [R5] — clipboard rejection is handled visibly and download still succeeds.
- [ ] AC4 [R6] — keyboard interaction and narrow viewport checks show labelled controls, visible focus, announced errors/status, and no page-level horizontal overflow.
- [ ] AC5 [R7] — production build succeeds and an automated/local runtime check observes no external application requests.
