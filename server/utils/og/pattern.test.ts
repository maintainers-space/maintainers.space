import { describe, expect, it } from 'vitest'

import { patternSvg, seedOf } from './pattern'

describe('patternSvg', () => {
  it('draws the same honeycomb for the same route every time', () => {
    const options = { seed: '/_og/github/nuxt/nuxt.png', tint: '#3178c6' }
    expect(patternSvg(options)).toBe(patternSvg(options))
  })

  it('gives different routes different honeycombs', () => {
    const a = patternSvg({ seed: '/_og/github/nuxt/nuxt.png', tint: '#3178c6' })
    const b = patternSvg({ seed: '/_og/github/vuejs/core.png', tint: '#3178c6' })
    expect(a).not.toBe(b)
  })

  it('fills some cells and keeps them clear of nothing it was not asked to avoid', () => {
    const svg = patternSvg({ seed: '/_og/index.png', tint: '#facc15' })
    const filled = svg.match(/<polygon[^>]+fill="rgba?\(/g) ?? []
    expect(filled.length).toBeGreaterThan(5)
  })

  it('only writes real colours, also for grey and near-black tints', () => {
    for (const tint of ['#555555', '#1f2328', '#000000', '#ffffff', '#facc15']) {
      const svg = patternSvg({ seed: tint, tint })
      expect(svg).not.toContain('NaN')
      expect(svg).not.toContain('undefined')
    }
  })

  it('keeps avoided areas faint', () => {
    const everywhere = { height: 630, width: 1200, x: 0, y: 0 }
    const svg = patternSvg({ avoid: [everywhere], seed: '/_og/index.png', tint: '#facc15' })
    const fills = new Set(
      [...svg.matchAll(/<polygon[^>]+fill="(rgba?\([^"]+\))"/g)].map((match) => match[1])
    )
    expect(fills.size).toBe(1)
  })
})

describe('seedOf', () => {
  it('is stable and spreads nearby strings', () => {
    expect(seedOf('/_og/github/a/b.png')).toBe(seedOf('/_og/github/a/b.png'))
    expect(seedOf('/_og/github/a/b.png')).not.toBe(seedOf('/_og/github/a/c.png'))
  })
})
