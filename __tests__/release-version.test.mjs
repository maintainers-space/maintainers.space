import { describe, expect, it } from 'vitest'

import { isVersionPromotion } from '../scripts/release-version.mjs'

describe('isVersionPromotion', () => {
  it('accepts stable and prerelease version increases', () => {
    expect(isVersionPromotion('0.1.0', '0.2.0-next.0')).toBe(true)
    expect(isVersionPromotion('0.2.0-next.0', '0.2.0-next.1')).toBe(true)
    expect(isVersionPromotion('0.2.0-next.1', '0.2.0')).toBe(true)
  })

  it('rejects unchanged versions and version decreases', () => {
    expect(isVersionPromotion('0.2.0', '0.2.0')).toBe(false)
    expect(isVersionPromotion('0.2.0', '0.2.0-next.1')).toBe(false)
    expect(isVersionPromotion('1.0.0', '0.9.0')).toBe(false)
  })
})
