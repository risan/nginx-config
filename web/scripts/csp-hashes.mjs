import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Astro emits small inline scripts (island bootstrap, our theme bootstrap). The CSP in
// public/_headers must not use 'unsafe-inline', so after the build we hash every inline
// classic script and add the hashes to script-src. The union is global because the
// scripts are identical across pages; Cloudflare allows 2000 characters per header line.
const INLINE_SCRIPT = /<script(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/script>/g

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        return htmlFiles(path)
      }

      return entry.name.endsWith('.html') ? [path] : []
    }),
  )

  return nested.flat()
}

export function inlineScriptHashes(html) {
  const hashes = new Set()
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const { attrs, body } = match.groups
    const isDataBlock = /type\s*=\s*["']?(application\/(ld\+)?json|importmap)/i.test(attrs)
    if (/\ssrc\s*=/.test(attrs) || isDataBlock || body.trim() === '') {
      continue
    }

    hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`)
  }

  return hashes
}

export function cspHashes() {
  return {
    name: 'csp-hashes',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir)
        const hashes = new Set()
        for (const file of await htmlFiles(outDir)) {
          for (const hash of inlineScriptHashes(await readFile(file, 'utf8'))) {
            hashes.add(hash)
          }
        }

        const headersPath = join(outDir, '_headers')
        const headers = await readFile(headersPath, 'utf8')
        if (!headers.includes("script-src 'self'")) {
          throw new Error("public/_headers must contain script-src 'self'")
        }

        const sources = ["'self'", ...[...hashes].sort()].join(' ')
        await writeFile(headersPath, headers.replace("script-src 'self'", `script-src ${sources}`))
        logger.info(`CSP: allowed ${hashes.size} inline script hash(es)`)
      },
    },
  }
}
