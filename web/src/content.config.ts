import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

// The docs stay in the repository root as the source of truth.
const docs = defineCollection({
  loader: glob({ pattern: '*.md', base: '../docs' }),
})

export const collections = { docs }
