import { unified } from '@astrojs/markdown-remark'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

import { cspHashes } from './scripts/csp-hashes.mjs'
import { rehypeDocLinks } from './scripts/rehype-doc-links.mjs'

export default defineConfig({
  site: 'https://nginx-config.risanb.com',
  output: 'static',
  integrations: [react(), sitemap({ filter: (page) => !page.endsWith('/404/') }), cspHashes()],
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
