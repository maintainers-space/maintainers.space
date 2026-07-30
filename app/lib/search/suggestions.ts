// Dynamic filter-badge suggestions shown under the search box: qualifiers the
// viewer probably wants next, given what's already in the query, so they never
// need to know the `key:value` syntax by heart.
import { collectQualifiers, type ParsedQuery } from './parser'

export interface FilterSuggestion {
  id: string
  label: string
  icon: string
  /** Qualifier text appended to the query, e.g. 'stars:>100' or 'owner:'. */
  insert: string
  /** The inserted value is a stub the viewer should type over (owner/language) — focus + select it after inserting rather than searching immediately. */
  placeholder?: boolean
}

const TYPE_CHIPS: Array<{ type: string; label: string; icon: string }> = [
  { type: 'repos', label: 'Repositories', icon: 'i-lucide-book-marked' },
  { type: 'issues', label: 'Issues & PRs', icon: 'i-lucide-circle-dot' },
  { type: 'code', label: 'Code', icon: 'i-lucide-code' }
]

const MAX_SUGGESTIONS = 6

/** Build the ranked suggestion row for the current query. Empty query = no chips yet. */
export function buildSuggestions(query: string, parsed: ParsedQuery): FilterSuggestion[] {
  if (!query.trim()) return []

  const qualifiers = collectQualifiers(parsed.root)
  const hasKey = (...keys: string[]) => qualifiers.some((q) => keys.includes(q.key))
  // Qualifiers beyond provider/type/sort only reach a real query on forges with
  // a rich search DSL (currently just GitHub) — hide them once scoped to a
  // forge that would silently drop them.
  const dslAware = !parsed.providers.length || parsed.providers.includes('github')

  const suggestions: FilterSuggestion[] = []

  if (!hasKey('stars') && dslAware) {
    suggestions.push({
      id: 'stars',
      label: '100+ stars',
      icon: 'i-lucide-star',
      insert: 'stars:>100'
    })
  }

  if (!parsed.sortKey) {
    suggestions.push({
      id: 'sort:updated',
      label: 'Recently updated',
      icon: 'i-lucide-clock',
      insert: 'sort:updated'
    })
  }

  if (!hasKey('owner', 'user', 'org', 'workspace', 'ws', 'from', 'author')) {
    suggestions.push({
      id: 'owner',
      label: 'Owner',
      icon: 'i-lucide-building-2',
      insert: 'owner:',
      placeholder: true
    })
  }

  if (!hasKey('language', 'lang') && dslAware) {
    suggestions.push({
      id: 'language',
      label: 'Language',
      icon: 'i-lucide-braces',
      insert: 'language:',
      placeholder: true
    })
  }

  if (!parsed.resultTypes.length) {
    for (const t of TYPE_CHIPS) {
      suggestions.push({
        id: `type:${t.type}`,
        label: `Only ${t.label}`,
        icon: t.icon,
        insert: `type:${t.type}`
      })
    }
  }

  return suggestions.slice(0, MAX_SUGGESTIONS)
}
