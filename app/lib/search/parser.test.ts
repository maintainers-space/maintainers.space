import { describe, expect, it } from 'vitest'
import { collectQualifiers, parseQuery } from './parser'

describe('parseQuery', () => {
  it('parses a single bare term', () => {
    const { root } = parseQuery('nuxt')
    expect(root).toEqual({ type: 'term', value: 'nuxt' })
  })

  it('joins bare terms with implicit AND', () => {
    const { root } = parseQuery('nuxt vite')
    expect(root).toEqual({
      type: 'and',
      nodes: [
        { type: 'term', value: 'nuxt' },
        { type: 'term', value: 'vite' }
      ]
    })
  })

  it('parses explicit OR, including the | shorthand', () => {
    const withWord = parseQuery('nuxt OR vite').root
    const withPipe = parseQuery('nuxt | vite').root
    const expected = {
      type: 'or',
      nodes: [
        { type: 'term', value: 'nuxt' },
        { type: 'term', value: 'vite' }
      ]
    }
    expect(withWord).toEqual(expected)
    expect(withPipe).toEqual(expected)
  })

  it('treats bare AND as a no-op join', () => {
    const { root } = parseQuery('nuxt AND vite')
    expect(root).toEqual({
      type: 'and',
      nodes: [
        { type: 'term', value: 'nuxt' },
        { type: 'term', value: 'vite' }
      ]
    })
  })

  it('parses NOT and the -term shorthand identically', () => {
    const withWord = parseQuery('NOT vite').root
    const withDash = parseQuery('-vite').root
    const expected = { type: 'not', node: { type: 'term', value: 'vite' } }
    expect(withWord).toEqual(expected)
    expect(withDash).toEqual(expected)
  })

  it('does not treat a lone dash or dash-before-space as negation', () => {
    const { root } = parseQuery('- foo')
    expect(root).toEqual({ type: 'term', value: 'foo' })
  })

  it('parses quoted phrase terms', () => {
    const { root } = parseQuery('"exact phrase"')
    expect(root).toEqual({ type: 'term', value: 'exact phrase', phrase: true })
  })

  it('parses a qualifier with a bare value', () => {
    const { root } = parseQuery('language:typescript')
    expect(root).toEqual({ type: 'qualifier', key: 'language', value: 'typescript' })
  })

  it('parses a qualifier with a quoted value', () => {
    const { root } = parseQuery('label:"good first issue"')
    expect(root).toEqual({ type: 'qualifier', key: 'label', value: 'good first issue' })
  })

  it('respects parentheses for grouping under OR', () => {
    const { root } = parseQuery('nuxt (vite OR webpack)')
    expect(root).toEqual({
      type: 'and',
      nodes: [
        { type: 'term', value: 'nuxt' },
        {
          type: 'or',
          nodes: [
            { type: 'term', value: 'vite' },
            { type: 'term', value: 'webpack' }
          ]
        }
      ]
    })
  })

  it('binds NOT tighter than AND, and AND tighter than OR', () => {
    const { root } = parseQuery('a b OR NOT c')
    expect(root).toEqual({
      type: 'or',
      nodes: [
        {
          type: 'and',
          nodes: [
            { type: 'term', value: 'a' },
            { type: 'term', value: 'b' }
          ]
        },
        { type: 'not', node: { type: 'term', value: 'c' } }
      ]
    })
  })

  it('extracts provider/forge qualifiers into meta.providers and strips them from the AST', () => {
    const parsed = parseQuery('provider:github forge:gh nuxt')
    expect(parsed.providers).toEqual(['github'])
    expect(parsed.root).toEqual({ type: 'term', value: 'nuxt' })
  })

  it('extracts type qualifiers into meta.resultTypes', () => {
    const parsed = parseQuery('type:issues nuxt')
    expect(parsed.resultTypes).toEqual(['issues'])
    expect(parsed.root).toEqual({ type: 'term', value: 'nuxt' })
  })

  it('extracts is:<kind> into resultTypes but keeps other is: values as qualifiers', () => {
    const asType = parseQuery('is:pr')
    expect(asType.resultTypes).toEqual(['issues'])
    expect(asType.root).toBeNull()

    const asState = parseQuery('is:open')
    expect(asState.resultTypes).toEqual([])
    expect(asState.root).toEqual({ type: 'qualifier', key: 'is', value: 'open' })
  })

  it('extracts sort/order qualifiers into meta', () => {
    const parsed = parseQuery('sort:stars order:asc nuxt')
    expect(parsed.sortKey).toBe('stars')
    expect(parsed.sortOrder).toBe('asc')
    expect(parsed.root).toEqual({ type: 'term', value: 'nuxt' })
  })

  it('defaults order to desc for any value other than asc', () => {
    const parsed = parseQuery('sort:stars order:whatever')
    expect(parsed.sortOrder).toBe('desc')
  })

  it('collapses to null when every node is stripped as a control qualifier', () => {
    const parsed = parseQuery('provider:github type:repos')
    expect(parsed.root).toBeNull()
  })

  it('round-trips the raw input untouched', () => {
    const parsed = parseQuery('  nuxt   vite  ')
    expect(parsed.raw).toBe('  nuxt   vite  ')
  })
})

describe('collectQualifiers', () => {
  it('collects qualifiers across AND/OR nodes with negation tracked', () => {
    const { root } = parseQuery('language:typescript -label:wontfix')
    const qualifiers = collectQualifiers(root)
    expect(qualifiers).toEqual([
      { key: 'language', value: 'typescript', negated: false },
      { key: 'label', value: 'wontfix', negated: true }
    ])
  })

  it('returns an empty array for a null root', () => {
    expect(collectQualifiers(null)).toEqual([])
  })
})
