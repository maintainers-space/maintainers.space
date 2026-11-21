import { describe, expect, it } from 'vitest'

import { renderCard, type OgThreadCard } from './cards'
import { compact, esc, shortDate } from './html'

const forge = { color: '#8b949e', id: 'github', label: 'GitHub' }

describe('renderCard', () => {
  it('escapes everything that comes from a forge', () => {
    const card: OgThreadCard = {
      author: '"><img src=x onerror=alert(1)>',
      forge,
      kind: 'issue',
      number: '1',
      owner: 'octo',
      repo: 'alerts',
      state: 'open',
      title: '<script>alert(1)</script> & friends'
    }
    const html = renderCard(card, { logo: 'data:image/svg+xml,', seed: 'test' })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; friends')
  })

  it('shows the merged state on a merged pull request', () => {
    const html = renderCard(
      { forge, kind: 'pull', number: '2', owner: 'o', repo: 'r', state: 'merged', title: 'x' },
      { logo: '', seed: 'test' }
    )
    expect(html).toContain('Merged')
  })
})

describe('formatting', () => {
  it.each([
    [999, '999'],
    [1000, '1k'],
    [61_234, '61.2k'],
    [125_000, '125k'],
    [1_400_000, '1.4M']
  ])('compacts %d as %s', (value, text) => {
    expect(compact(value)).toBe(text)
  })

  it('dates in UTC so every crawler sees the same card', () => {
    expect(shortDate(new Date('2026-11-20T23:30:00Z'))).toBe('20 Nov 2026')
    expect(shortDate(undefined)).toBe('')
  })

  it('escapes quotes for attributes', () => {
    expect(esc(`a"b'c`)).toBe('a&quot;b&#39;c')
  })
})
