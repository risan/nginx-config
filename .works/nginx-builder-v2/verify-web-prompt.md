You are the tech lead who signed off on `.works/nginx-builder-v2/plan.md` Part 2 (plus revisions R11, R14, R15, R18). The web app is built. Verify it.

Scope: `git diff f4f9fa5..HEAD -- web .github` and the files under `web/` (ignore `web/node_modules`, `web/dist`, `web/test-results`, `web/.astro`). The app imports `lib/options.ts` / `lib/render.ts` (renderer is reviewed separately; only check how the UI uses them).

Check:
1. Plan items not built or built differently without reason (stack, pages/SEO, builder UX, visual design rules, tooling, tests, CI).
2. Correctness bugs in the builder: state handling on profile/target switch, URL-hash share parsing of hostile input (prototype pollution, huge input, unknown keys), copy/download of an invalid config, error display, list editors, the hand-written NGINX tokenizer (XSS: is generated or user text ever injected as HTML?), theme script.
3. Security of the deployed static site: `web/public/_headers`, Astro `security.csp` config, inline scripts, the CSP split (header vs meta; note `frame-ancestors` is ignored in meta), any `dangerouslySetInnerHTML` / `set:html`, external requests, dependency choices.
4. Docs pages: link rewriting and the build-time link check.
5. Accessibility basics and responsive behavior claimed by tests; tests that do not prove what they claim.
6. CI workflows for the web job: correctness, pinned actions, permissions.

Read-only sandbox; cite file:line. Output numbered findings tagged Blocker / Major / Minor with evidence and a concrete fix, then a verdict: APPROVE / APPROVE WITH CHANGES / REVISE. No praise.
