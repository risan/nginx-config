export interface FieldErrors {
  // A message about the whole field.
  own?: string
  // Messages about single list items, by zero-based index.
  items: Record<number, string>
}

const KEY = /^([A-Za-z0-9_]+)(?:\.(\d+))?(?:\..*)?$/

// The validator reports list items as `upstreams.0.address` or `immutablePaths.1`.
// This folds them back onto the schema field they belong to.
export function groupErrors(errors: Record<string, string>): Map<string, FieldErrors> {
  const grouped = new Map<string, FieldErrors>()
  for (const [key, message] of Object.entries(errors)) {
    const match = KEY.exec(key)
    const field = match?.[1] ?? key
    const entry = grouped.get(field) ?? { items: {} }
    if (match?.[2] === undefined) {
      entry.own = entry.own ?? message
    } else {
      const index = Number(match[2])
      entry.items[index] = entry.items[index] ?? message
    }
    grouped.set(field, entry)
  }

  return grouped
}

export function errorCount(errors: Record<string, string>): number {
  return Object.keys(errors).length
}
