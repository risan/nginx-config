import { describe, expect, it } from 'vitest'

import { rehypeDocLinks, rewriteDocHref } from '../../scripts/rehype-doc-links.mjs'

describe('rewriteDocHref', () => {
  it('maps links between docs to site routes', () => {
    expect(rewriteDocHref('security.md')).toBe('/docs/security/')
    expect(rewriteDocHref('./tuning.md#gzip')).toBe('/docs/tuning/#gzip')
  })

  it('sends other repository paths to GitHub', () => {
    expect(rewriteDocHref('../sites-example/proxy.conf')).toBe(
      'https://github.com/risan/nginx-config/blob/main/sites-example/proxy.conf',
    )
  })

  it('leaves absolute, anchor and external links alone', () => {
    expect(rewriteDocHref('https://nginx.org/')).toBe('https://nginx.org/')
    expect(rewriteDocHref('#section')).toBe('#section')
    expect(rewriteDocHref('/docs/')).toBe('/docs/')
    expect(rewriteDocHref('mailto:a@b.c')).toBe('mailto:a@b.c')
  })
})

describe('rehypeDocLinks', () => {
  const tree = (href: string) => ({
    type: 'root',
    children: [{ type: 'element', tagName: 'a', properties: { href }, children: [] }],
  })

  it('rewrites links to existing repository files', () => {
    const root = tree('../web/wrangler.jsonc#assets')
    rehypeDocLinks()(root, { path: 'docs/x.md' })

    expect(root.children[0].properties.href).toBe(
      'https://github.com/risan/nginx-config/blob/main/web/wrangler.jsonc#assets',
    )
  })

  it('fails the build on a link to a missing file', () => {
    expect(() => rehypeDocLinks()(tree('missing.md'), { path: 'docs/x.md' })).toThrow(/Broken link/)
  })
})
