import { describe, expect, it } from 'vitest'
import { parseQuery } from '~/lib/search/parser'
import { astToGitHubQuery } from './github'

describe('astToGitHubQuery', () => {
  it('renders a null AST as an empty query', () => {
    expect(astToGitHubQuery(null)).toEqual({ query: '', dropped: [] })
  })

  it('renders bare and phrase terms', () => {
    const { root } = parseQuery('nuxt "exact phrase"')
    expect(astToGitHubQuery(root)).toEqual({ query: 'nuxt "exact phrase"', dropped: [] })
  })

  it('maps a known qualifier through GH_KEYS, quoting values with spaces', () => {
    const { root } = parseQuery('language:typescript label:"good first issue"')
    expect(astToGitHubQuery(root)).toEqual({
      query: 'language:typescript label:"good first issue"',
      dropped: []
    })
  })

  it('drops unknown qualifiers and reports them once, deduplicated', () => {
    const { root } = parseQuery('unknownkey:foo unknownkey:bar nuxt')
    expect(astToGitHubQuery(root)).toEqual({ query: 'nuxt', dropped: ['unknownkey'] })
  })

  it('renders NOT over a term/qualifier as a bare -prefix', () => {
    const { root } = parseQuery('-vite')
    expect(astToGitHubQuery(root)).toEqual({ query: '-vite', dropped: [] })

    const { root: rootQ } = parseQuery('-language:javascript')
    expect(astToGitHubQuery(rootQ)).toEqual({ query: '-language:javascript', dropped: [] })
  })

  it('renders NOT over a group by wrapping the (already-parenthesized) OR render', () => {
    // The `-` shorthand only attaches to bare words/phrases, not to `(`, so
    // negating a group requires the explicit `NOT` keyword.
    const { root } = parseQuery('NOT (vite OR webpack)')
    expect(astToGitHubQuery(root)).toEqual({ query: 'NOT ((vite OR webpack))', dropped: [] })
  })

  it('joins OR branches with parentheses, but leaves a single surviving branch bare', () => {
    const { root } = parseQuery('vite OR webpack')
    expect(astToGitHubQuery(root)).toEqual({ query: '(vite OR webpack)', dropped: [] })

    const { root: rootDropped } = parseQuery('vite OR unknownkey:x')
    expect(astToGitHubQuery(rootDropped)).toEqual({ query: 'vite', dropped: ['unknownkey'] })
  })
})
