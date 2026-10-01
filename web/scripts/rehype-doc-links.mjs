import { posix } from 'node:path'

const REPO_BLOB = 'https://github.com/risan/nginx-config/blob/main/'
const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i

// docs/*.md links to other docs become /docs/<slug>/. Other relative links point at
// repository files, so they go to GitHub instead of a 404 on the site.
export function rewriteDocHref(href) {
  if (EXTERNAL.test(href)) {
    return href
  }

  const [pathPart, hash] = href.split('#')
  const resolved = posix.normalize(posix.join('docs', pathPart))
  const doc = /^docs\/([^/]+)\.md$/.exec(resolved)
  const suffix = hash === undefined ? '' : `#${hash}`
  if (doc !== null) {
    return `/docs/${doc[1]}/${suffix}`
  }

  return `${REPO_BLOB}${resolved}${suffix}`
}

export function rehypeDocLinks() {
  return (tree) => {
    const visit = (node) => {
      if (
        node.type === 'element' &&
        node.tagName === 'a' &&
        typeof node.properties?.href === 'string'
      ) {
        node.properties.href = rewriteDocHref(node.properties.href)
      }

      node.children?.forEach(visit)
    }

    visit(tree)
  }
}
