import { unified } from '@astrojs/markdown-remark'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

import { checkLinks } from './scripts/check-links.mjs'
import { rehypeDocLinks } from './scripts/rehype-doc-links.mjs'
import { themeScriptHash } from './scripts/theme-script.mjs'

export default defineConfig({
  site: 'https://nginx-config.risanb.com',
  output: 'static',
  integrations: [react(), sitemap({ filter: (page) => !page.endsWith('/404/') }), checkLinks()],
  security: {
    // Hash-based script policy emitted as a <meta> tag. Header-only directives
    // (frame-ancestors, object-src, base-uri, form-action) stay in public/_headers.
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
      ],
      // React and Shiki render style attributes, which hashes cannot cover.
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
      scriptDirective: { hashes: [themeScriptHash] },
    },
  },
  markdown: {
    // Astro 7 defaults to the Satteri processor; unified keeps the rehype plugin API.
    processor: unified({ rehypePlugins: [rehypeDocLinks] }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
    // The docs collection reads ../docs, outside the project root.
    server: { fs: { allow: ['..'] } },
  },
})
