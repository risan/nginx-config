import { getCollection, render, type CollectionEntry } from 'astro:content'

const ORDER = ['security', 'tuning', 'operations', 'migration', 'benchmarking']

export interface DocSummary {
  entry: CollectionEntry<'docs'>
  slug: string
  title: string
  description: string
}

function firstParagraph(markdown: string): string {
  const paragraph = markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block !== '' && !/^(#|```|[-*|>]|\d+\.)/.test(block))

  const text = (paragraph ?? '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '')
  const flat = text.replace(/\s+/g, ' ')

  return flat.length > 155 ? `${flat.slice(0, 152).trimEnd()}...` : flat
}

export async function loadDocs(): Promise<DocSummary[]> {
  const entries = await getCollection('docs')
  const summaries = await Promise.all(
    entries.map(async (entry) => {
      const { headings } = await render(entry)

      return {
        entry,
        slug: entry.id,
        title: headings.find((heading) => heading.depth === 1)?.text ?? entry.id,
        description: firstParagraph(entry.body ?? ''),
      }
    }),
  )

  const rank = (slug: string) => {
    const index = ORDER.indexOf(slug)

    return index === -1 ? ORDER.length : index
  }

  return summaries.sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug))
}
