import { describe, expect, it } from 'vitest'

import { rewriteDocHref } from '../../scripts/rehype-doc-links.mjs'

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
