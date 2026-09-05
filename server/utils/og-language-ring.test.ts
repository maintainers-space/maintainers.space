import { describe, expect, it } from 'vitest'
import { buildLanguageRing } from './og-language-ring'

describe('buildLanguageRing', () => {
  it('returns an empty array for no bytes', () => {
    expect(buildLanguageRing({})).toEqual([])
  })

  it('returns an empty array when every count is zero or negative', () => {
    expect(buildLanguageRing({ TypeScript: 0, JavaScript: -5 })).toEqual([])
  })

  it('converts byte counts into percentages that sum to 100', () => {
    const segments = buildLanguageRing({ TypeScript: 75, JavaScript: 25 })
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ name: 'TypeScript', percent: 75 })
    expect(segments[1]).toMatchObject({ name: 'JavaScript', percent: 25 })
  })

  it('sorts segments largest first', () => {
    const segments = buildLanguageRing({ Small: 10, Big: 90 })
    expect(segments.map((s) => s.name)).toEqual(['Big', 'Small'])
  })

  it('ignores zero and negative entries mixed in with real ones', () => {
    const segments = buildLanguageRing({ TypeScript: 100, Dead: 0, Negative: -1 })
    expect(segments.map((s) => s.name)).toEqual(['TypeScript'])
  })

  it('caps at 6 named segments and folds the rest into Other', () => {
    const bytes: Record<string, number> = {}
    for (let i = 0; i < 8; i++) bytes[`Lang${i}`] = 8 - i
    const segments = buildLanguageRing(bytes)
    expect(segments).toHaveLength(7)
    expect(segments.slice(0, 6).map((s) => s.name)).toEqual([
      'Lang0',
      'Lang1',
      'Lang2',
      'Lang3',
      'Lang4',
      'Lang5'
    ])
    const other = segments[6]
    expect(other?.name).toBe('Other')
    const total = Object.values(bytes).reduce((a, b) => a + b, 0)
    const expectedOtherBytes = (bytes.Lang6 ?? 0) + (bytes.Lang7 ?? 0)
    expect(other?.percent).toBeCloseTo((expectedOtherBytes / total) * 100)
  })

  it('does not add an Other segment when there is no long tail', () => {
    const segments = buildLanguageRing({ A: 1, B: 1, C: 1 })
    expect(segments.some((s) => s.name === 'Other')).toBe(false)
  })
})
