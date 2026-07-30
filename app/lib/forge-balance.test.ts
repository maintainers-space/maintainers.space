import { describe, expect, it, vi } from 'vitest'
import type { ForgeId } from '~/types/forge'

const DOMINANCE: Record<string, number> = { a: 1, b: 1, c: 3 }

vi.mock('./forges', () => ({
  getForge: (id: string) => {
    const dominance = DOMINANCE[id]
    return dominance == null ? undefined : { dominance }
  }
}))

const { balanceByDominance } = await import('./forge-balance')

interface Item {
  provider: ForgeId
  id: string
}

function item(provider: string, id: string): Item {
  return { provider: provider as ForgeId, id }
}

describe('balanceByDominance', () => {
  it('returns an empty list unchanged', () => {
    expect(balanceByDominance([])).toEqual([])
  })

  it('returns the same list (and reference) when only one provider is present', () => {
    const items = [item('a', '1'), item('a', '2'), item('a', '3')]
    expect(balanceByDominance(items)).toBe(items)
  })

  it('strictly alternates two equal-dominance providers', () => {
    const items = [
      item('a', '1'),
      item('a', '2'),
      item('a', '3'),
      item('b', '1'),
      item('b', '2'),
      item('b', '3')
    ]
    const out = balanceByDominance(items).map((i) => `${i.provider}${i.id}`)
    expect(out).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3'])
  })

  it('gives a lower-dominance (higher-weight) provider more frequent draws via SWRR', () => {
    const items = [
      item('a', '1'),
      item('a', '2'),
      item('a', '3'),
      item('c', '1'),
      item('c', '2'),
      item('c', '3')
    ]
    const out = balanceByDominance(items).map((i) => `${i.provider}${i.id}`)
    // a (dominance 1) is drawn 3x more often than c (dominance 3).
    expect(out).toEqual(['a1', 'a2', 'c1', 'a3', 'c2', 'c3'])
  })

  it('preserves each provider’s own relative order', () => {
    const items = [
      item('a', '1'),
      item('c', '1'),
      item('a', '2'),
      item('c', '2'),
      item('a', '3'),
      item('c', '3')
    ]
    const out = balanceByDominance(items)
    const aOrder = out.filter((i) => i.provider === 'a').map((i) => i.id)
    const cOrder = out.filter((i) => i.provider === 'c').map((i) => i.id)
    expect(aOrder).toEqual(['1', '2', '3'])
    expect(cOrder).toEqual(['1', '2', '3'])
  })

  it('falls back to the default dominance for an unregistered provider', () => {
    const items = [item('unknown', '1'), item('unknown', '2'), item('b', '1'), item('b', '2')]
    expect(() => balanceByDominance(items)).not.toThrow()
    expect(balanceByDominance(items)).toHaveLength(4)
  })
})
