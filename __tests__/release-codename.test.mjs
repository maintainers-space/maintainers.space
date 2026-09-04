import { describe, expect, it } from 'vitest'

import {
  codenameForVersion,
  isMinorRelease,
  isVersionPromotion
} from '../scripts/release-codename.mjs'

describe('codenameForVersion', () => {
  it('assigns a stable space-themed name to a minor version', () => {
    expect(codenameForVersion('0.1.0')).toBe('Alpheratz')
    expect(codenameForVersion('0.2.0')).toBe('Caph')
    expect(codenameForVersion('0.2.0-next.0')).toBe('Caph')
    expect(codenameForVersion('1.1.0')).toBe('Jabbah')
  })

  it('rejects versions outside the release format', () => {
    expect(() => codenameForVersion('1.2')).toThrow('Invalid semantic version')
    expect(() => codenameForVersion('1.2.0-next.01')).toThrow('Invalid semantic version')
  })

  it('distinguishes minor releases from patches and majors', () => {
    expect(isMinorRelease('0.1.1', '0.2.0')).toBe(true)
    expect(isMinorRelease('0.1.1', '0.2.0-next.0')).toBe(true)
    expect(isMinorRelease('0.1.0', '0.1.1')).toBe(false)
    expect(isMinorRelease('0.9.0', '1.0.0')).toBe(false)
  })
})

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
