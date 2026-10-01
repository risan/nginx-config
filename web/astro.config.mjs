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
      // Style elements stay hashed (Astro adds the hashes). Only style attributes, which
      // SSR output from React and Shiki contains and hashes cannot cover, are allowed inline.
      styleDirective: {
        // <style> elements that sonner and Radix Select inject at runtime. Their text is fixed
        // per package version, so a dependency upgrade that changes it shows up as a CSP
        // console error in the browser tests, which print the new hash.
        hashes: [
          { hash: 'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=', kind: 'element' },
          { hash: 'sha256-441zG27rExd4/il+NvIqyL8zFx5XmyNQtE381kSkUJk=', kind: 'element' },
          { hash: 'sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo=', kind: 'element' },
        ],
        resources: [
          { resource: "'self'", kind: 'element' },
          { resource: "'unsafe-inline'", kind: 'attribute' },
        ],
      },
      scriptDirective: { hashes: [themeScriptHash] },
    },
  },
  markdown: {
    // Astro 7 defaults to the Satteri processor; unified keeps the rehype plugin API.
    processor: unified({ rehypePlugins: [rehypeDocLinks] }),
    shikiConfig: {
      themes: { light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' },
      defaultColor: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
    // The docs collection reads ../docs, outside the project root.
    server: { fs: { allow: ['..'] } },
  },
})
