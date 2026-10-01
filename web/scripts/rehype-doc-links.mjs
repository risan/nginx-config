import { existsSync } from 'node:fs'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_BLOB = 'https://github.com/risan/nginx-config/blob/main/'
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i

// Path of a relative link, from the repository root, or null for links that are not
// relative file links (absolute URLs, anchors, site routes).
export function repoPathOf(href) {
  if (EXTERNAL.test(href)) {
    return null
  }

  return posix.normalize(posix.join('docs', href.split('#')[0]))
}

// docs/*.md links to other docs become /docs/<slug>/. Other relative links point at
// repository files, so they go to GitHub instead of a 404 on the site.
export function rewriteDocHref(href) {
  const resolved = repoPathOf(href)
  if (resolved === null) {
    return href
  }

  const hash = href.split('#')[1]
  const suffix = hash === undefined ? '' : `#${hash}`
  const doc = /^docs\/([^/]+)\.md$/.exec(resolved)
  if (doc !== null) {
    return `/docs/${doc[1]}/${suffix}`
  }

  return `${REPO_BLOB}${resolved}${suffix}`
}

export function rehypeDocLinks() {
  return (tree, file) => {
    const visit = (node) => {
      if (
        node.type === 'element' &&
        node.tagName === 'a' &&
        typeof node.properties?.href === 'string'
      ) {
        const href = node.properties.href
        const repoPath = repoPathOf(href)
        if (repoPath !== null && !existsSync(`${REPO_ROOT}${repoPath}`)) {
          throw new Error(
            `Broken link "${href}" in ${file?.path ?? 'a docs page'}: ${repoPath} does not exist`,
          )
        }

        node.properties.href = rewriteDocHref(href)
      }

      node.children?.forEach(visit)
    }

    visit(tree)
  }
}
