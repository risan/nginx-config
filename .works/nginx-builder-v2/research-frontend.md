# Frontend stack research (2026-10-01)

Versions: from `npm view` (registry). Docs: WebFetch of official pages. Note: Bash was blocked mid-session (worktree cwd guard), so some size/peer data came from registry via WebFetch or was not obtained; marked UNVERIFIED.

## Versions (npm latest)
| pkg | version |
|---|---|
| astro | 7.3.5 (node >=22.12.0; dep vite ^8.0.13) |
| @astrojs/react | 7.0.0 (peers react/react-dom ^17/^18/^19, @types/react ^17-^19; optional oxc-transform-react ^0.145.0; `babel` option removed, use @rolldown/plugin-babel) |
| @astrojs/cloudflare | 14.3.3 (NOT needed for static) |
| react / react-dom | 19.3.0 ; @types/react, @types/react-dom 19.3.0 |
| wrangler | 4.145.0 |
| tailwindcss / @tailwindcss/vite | 4.3.3 (vite peer ^5.2 .. ^8) |
| shadcn (CLI) | 4.21.0 |
| tw-animate-css | 1.4.0 |
| radix-ui | 1.6.7 ; @base-ui/react 1.8.0 |
| lucide-react 1.49.0, clsx 2.1.1, tailwind-merge 3.7.0, class-variance-authority 0.7.1 |
| oxlint | 1.86.0 |
| oxfmt | 0.71.0 (node ^20.19 or >=22.12) |
| vite | 8.3.1 (previous tag 7.3.6) |
| vitest | 5.0.3 (peer vite ^6.4 || ^7 || ^8; V4 tag 4.1.11) |
| @playwright/test | 1.63.0 |
| typescript | 7.0.2 (native Go port "tsgo"; 6.x is the last JS one) |
| @astrojs/check | 0.9.10 |
| prettier 3.9.9, prettier-plugin-astro 1.1.0 |
| shiki 4.5.0, @shikijs/langs 4.5.0, highlight.js 11.12.0, prismjs 1.30.0 |
| @types/node 26.6.3 |

Node: Astro 7 needs >=22.12. Node 24 (Krypton) is the safe LTS choice; v26 released May 2026 and becomes LTS ~Oct 2026; v22 is at/near EOL. Recommend Node 24 (`.nvmrc` 24). (nodejs.org/en/about/previous-releases; fetch summary was messy, verify.)

## 1. Astro + React
```
npm create astro@latest        # or: npx astro add react
npm i @astrojs/react react react-dom
npm i -D @types/react @types/react-dom
```
astro.config.mjs: `import react from '@astrojs/react'; export default defineConfig({ integrations: [react()] })`
tsconfig: `"jsx": "react-jsx", "jsxImportSource": "react"` (extends astro/tsconfigs/strict).
Default output is static (`output: 'static'` is default); use `<Component client:load />`.
Source: https://docs.astro.build/en/guides/integrations-guide/react/

## 2. Cloudflare Workers static assets
No adapter for static sites ("adapter only needed for on-demand rendering").
wrangler.jsonc:
```jsonc
{
  "name": "nginx-config",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "./dist" }
}
```
Optional `not_found_handling`: "404-page" | "single-page-application". Deploy: `astro build && wrangler deploy`; preview `wrangler dev`. `npm i -D wrangler`.
`_headers`: plain file named `_headers` in the assets dir (put in `public/_headers` so it lands in dist/). Not served itself. Syntax: URL pattern line, then indented `Header: value` lines; splats `*`/`:splat`, placeholders `:name`, remove with `! Header`. Max 100 rules, 2000 chars/line. Applies to static assets only (not Worker-generated responses). Default Cache-Control is `public, max-age=0, must-revalidate`; Astro hashed files are in `/_astro/*` so add `Cache-Control: public, max-age=31536000, immutable` there.
Sources: https://docs.astro.build/en/guides/deploy/cloudflare/ , https://developers.cloudflare.com/workers/static-assets/ , https://developers.cloudflare.com/workers/static-assets/headers/

## 3. Tailwind v4
`npx astro add tailwind` or `npm i tailwindcss @tailwindcss/vite`.
```js
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ vite: { plugins: [tailwindcss()] } });
```
src/styles/global.css: `@import "tailwindcss";` (plus `@import "tw-animate-css";`, `@theme inline {...}` from shadcn). Import it in the layout. No tailwind.config.js, no @astrojs/tailwind.
Source: https://docs.astro.build/en/guides/styling/#tailwind

## 4. shadcn/ui on Astro
Official guide: https://ui.shadcn.com/docs/installation/astro
Prereqs: Tailwind + React integration set up, `@/*` -> `./src/*` alias in tsconfig (`"baseUrl": ".", "paths": {"@/*": ["./src/*"]}`).
Commands:
```
npx shadcn@latest init -t astro        # new project scaffold
npx shadcn@latest init                 # existing project (interactive)
npx shadcn@latest init --preset <CODE> --template astro   # from ui.shadcn.com/create
npx shadcn@latest add button card textarea
```
Use in .astro: `import { Button } from "@/components/ui/button"` then `<Button client:load>`.
components.json: `default` style deprecated -> `new-york`; tailwind.config blank for v4; css = src/styles/global.css; cssVariables true; rsc false for Astro; iconLibrary lucide. Radix vs Base UI: the CLI/docs now offer both bases (npm has `radix-ui` 1.6.7 and `@base-ui/react` 1.8.0); the choice is picked at init/preset in the create tool. UNVERIFIED which is default: choose explicitly at init and check components.json. tw-animate-css replaces tailwindcss-animate (installed by init, imported in CSS).
Docs: https://ui.shadcn.com/docs/components-json

## 5. Oxlint / Oxfmt
- Oxlint 1.86.0 stable. `npm i -D oxlint`; `oxlint` / `oxlint --fix`. Config `.oxlintrc.json` (from memory; docs page did not name it). Built-in react/typescript/etc. native plugins. .astro: lints only `<script>` blocks (doc-confirmed). Type-aware linting via tsgo.
- Oxfmt 0.71.0 (pre-1.0 version number, but docs present as production-ready; passes 100% Prettier JS/TS conformance). `oxfmt`, `oxfmt --check`. Config `.oxfmtrc.json`(c) (from memory, UNVERIFIED; docs cite `ignorePatterns`). Supports JS/TS/JSX/TSX, JSON, YAML, TOML, CSS/SCSS/Less, GraphQL natively; HTML/Vue/Svelte/MD/MDX via Prettier-backed. **.astro NOT supported.**
- Fallback: Prettier 3.9.9 + prettier-plugin-astro 1.1.0 only on `**/*.astro` (`prettier --check "src/**/*.astro"`), oxfmt for the rest. Add `.astro` files to oxfmt ignore.
Sources: https://oxc.rs/docs/guide/usage/linter , https://oxc.rs/docs/guide/usage/formatter , .../formatter/language-support.html

## 6/7. Compatibility
- Astro 7 -> Vite 8 (^8.0.13). @tailwindcss/vite 4.3.3 supports Vite 8. Vitest 5 supports Vite 6.4/7/8. All consistent; use vitest via `getViteConfig` from `astro/config` if testing Astro components.
- @astrojs/react 7 supports React 17-19, so React 19.3 fine. shadcn works with React 19 + Tailwind v4 (official). 
- TypeScript 7.0.2 is the native port; `@astrojs/check` (0.9.10) runs on the volar/TS language tools which may still need the JS `typescript` API: UNVERIFIED, test `astro check`; fallback pin `typescript@^6` if it breaks. Some tooling (typescript-eslint not used here) lags.
- Node >=22.12 for Astro 7 and @astrojs/react 7.

## 8. nginx highlighting in the UI
Options (UNVERIFIED sizes except where cited):
- Shiki fine-grained (`shiki/core` + `@shikijs/engine-javascript` + `@shikijs/langs/nginx` + one theme): works client-side, but TextMate grammar + engine runs to tens of KB gz (full web bundle is 695 KB gz per shiki docs; fine-grained far smaller but still bigger than needed). Shiki's Oniguruma WASM engine avoided; JS regex engine ok.
- highlight.js: use `highlight.js/lib/core` + `highlight.js/lib/languages/nginx` only (full lib is 307 KB gz per bundlephobia; core+nginx is a few KB gz, estimate ~6-8 KB). Simple, sync, token classes styled by our own CSS with theme vars (dark mode free).
- Prism: also small, but nginx grammar is lighter/less maintained; no advantage.
- Custom tiny tokenizer (regex for comments, directive names, `$vars`, strings, numbers, `{}`): ~1 KB, works since we generate the config; best size, a bit more code to own.
Recommendation: highlight.js core + nginx language (client-side, in the React island, lazy-render on output change); if bundle must be minimal, hand-rolled tokenizer. Skip Shiki since it is optimized for build-time.
Sources: https://shiki.style/guide/bundles , bundlephobia highlight.js@11.12.0
