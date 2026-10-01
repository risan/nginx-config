# nginx-config web app

Static NGINX config builder. Astro 7, React 19 island, Tailwind 4, shadcn/ui (new-york, Radix).
Deployed as static assets on Cloudflare Workers (no adapter).

## Stack

- Astro 7 (`output: 'static'`), `@astrojs/react`, `@astrojs/sitemap`
- Tailwind CSS 4 via `@tailwindcss/vite`, shadcn/ui, lucide-react, IBM Plex (fontsource)
- TypeScript 6 strict (`@astrojs/check` does not support TypeScript 7 yet)
- Oxlint, Oxfmt (Prettier with `prettier-plugin-astro` only for `*.astro`)
- Vitest (unit), Playwright + axe-core (browser, against `wrangler dev`)

## Layout

- `src/lib/engine.ts` is the only import path to the option schema and renderer.
- `src/components/builder/` is the builder island. `src/components/ui/` is shadcn output.
- `src/lib/state.ts` holds preset switching and the share-link hash. `src/lib/tokenize.ts` is the
  NGINX syntax tokenizer for the preview.
- `docs/*.md` at the repository root is rendered at `/docs/<slug>/` through a content collection.
- CSP: `security.csp` in `astro.config.mjs` emits a hash-based `script-src` meta policy. `public/_headers` keeps only header-only directives. `scripts/check-links.mjs` fails the build on broken internal links.

## Scripts

| Script                              | What it does                                         |
| ----------------------------------- | ---------------------------------------------------- |
| `npm run dev`                       | Astro dev server                                     |
| `npm run build`                     | `astro check` then `astro build` into `dist/`        |
| `npm run preview`                   | Serve `dist/`                                        |
| `npm run lint`                      | Oxlint over `web/`, `lib/`, `scripts/` and `tests/`  |
| `npm run fmt` / `npm run fmt:check` | Oxfmt and Prettier (Astro files)                     |
| `npm run test:unit`                 | Vitest                                               |
| `npm run test:browser`              | Builds, then runs Playwright against `astro preview` |
| `npm run workers:dev`               | `wrangler dev` on `dist/`                            |
| `npm run deploy`                    | Build, then `wrangler deploy`                        |
| `npm run deploy:dry-run`            | Build, then `wrangler deploy --dry-run`              |

First run of the browser tests needs `npx playwright install chromium`.
`SCREENS=1 npx playwright test screens` writes review screenshots to `test-results/screens/`.

## Deploy

`wrangler.jsonc` serves `./dist` as Workers static assets with a 404 page. `public/_headers` sets
security headers and immutable caching for `/_astro/*`. Run `npx wrangler login` once, then
`npm run deploy`.

`no-control-regex` is off: the option validators in `lib/options.ts` reject control characters on purpose.
