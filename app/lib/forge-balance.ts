import { getForge } from './forges'
import type { ForgeId } from '~/types/forge'

const DEFAULT_DOMINANCE = 1

function weightOf(id: ForgeId): number {
  return 1 / (getForge(id)?.dominance ?? DEFAULT_DOMINANCE)
}

/**
 * Interleaves a pooled, cross-forge list so one dominant forge (GitHub) doesn't
 * crowd out smaller ones, without hardcoding any provider by name. Each
 * provider's own relative order is preserved (callers pass an already-ranked
 * list); providers are then drawn from using "smooth weighted round robin"
 * (the algorithm nginx uses for weighted load balancing), where each forge's
 * draw weight is the inverse of its configured `dominance` — so a forge with
 * dominance 12 is drawn ~12x less often per round than one with dominance 1,
 * giving weaker forges outsized (but not exclusive) representation. Once a
 * provider's items run out it simply drops out of the rotation.
 */
export function balanceByDominance<T extends { provider: ForgeId }>(items: T[]): T[] {
  const buckets = new Map<ForgeId, T[]>()
  for (const item of items) {
    const bucket = buckets.get(item.provider)
    if (bucket) bucket.push(item)
    else buckets.set(item.provider, [item])
  }
  if (buckets.size <= 1) return items

  const current = new Map<ForgeId, number>()
  const out: T[] = []

  for (let remaining = items.length; remaining > 0; remaining--) {
    let totalWeight = 0
    let picked: ForgeId | null = null
    for (const [id, bucket] of buckets) {
      if (!bucket.length) continue
      const w = weightOf(id)
      totalWeight += w
      const next = (current.get(id) ?? 0) + w
      current.set(id, next)
      if (picked === null || next > current.get(picked)!) picked = id
    }
    if (picked === null) break
    out.push(buckets.get(picked)!.shift()!)
    current.set(picked, current.get(picked)! - totalWeight)
  }
  return out
}
