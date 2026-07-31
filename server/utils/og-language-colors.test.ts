import { describe, expect, it } from 'vitest'
import { languageColor } from './og-language-colors'

describe('languageColor', () => {
  it('returns the curated color for a known language', () => {
    expect(languageColor('TypeScript')).toBe('#3178c6')
    expect(languageColor('Go')).toBe('#00ADD8')
  })

  it('returns a deterministic hsl fallback for an unmapped language', () => {
    const first = languageColor('SomeObscureLanguage')
    const second = languageColor('SomeObscureLanguage')
    expect(first).toBe(second)
    expect(first).toMatch(/^hsl\(\d+, 55%, 55%\)$/)
  })

  it('gives different unmapped languages different fallback hues', () => {
    expect(languageColor('Foo')).not.toBe(languageColor('Bar'))
  })
})
