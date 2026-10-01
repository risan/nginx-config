import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function fileForRoute(outDir, pathname) {
  const clean = decodeURIComponent(pathname)
  const candidates = clean.endsWith('/')
    ? [join(outDir, clean, 'index.html')]
    : [join(outDir, clean), join(outDir, `${clean}.html`), join(outDir, clean, 'index.html')]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

export function checkLinks() {
  return {
    name: 'check-links',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir)
        const pages = new Map()
        for (const file of await htmlFiles(outDir)) {
          pages.set(file, await readFile(file, 'utf8'))
        }

        const ids = new Map()
        for (const [file, html] of pages) {
          ids.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])))
        }

        const problems = []
        for (const [file, html] of pages) {
          for (const match of html.matchAll(/\shref="([^"]*)"/g)) {
            const href = match[1].replaceAll('&amp;', '&')
            if (!/^(\/(?!\/)|#)/.test(href)) {
              continue
            }

            const [target, fragment] = href.split('#')
            const pathname = target.split('?')[0]
            const targetFile = pathname === '' ? file : fileForRoute(outDir, pathname)
            if (targetFile === null) {
              problems.push(`${file.replace(outDir, '')}: ${href} points to a missing page`)
            } else if (fragment && pages.has(targetFile) && !ids.get(targetFile)?.has(fragment)) {
              problems.push(`${file.replace(outDir, '')}: ${href} points to a missing #${fragment}`)
            }
          }
        }

        if (problems.length > 0) {
          throw new Error(`Broken internal links:\n${[...new Set(problems)].join('\n')}`)
        }

        logger.info(`Links: checked ${pages.size} pages, no broken internal links`)
      },
    },
  }
}
