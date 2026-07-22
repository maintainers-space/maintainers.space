// Shared HTTP cache-header logic for public server routes. Emits three headers
// with rising lifetimes — Cache-Control (browser + generic shared caches),
// CDN-Cache-Control (most CDNs) and Netlify-CDN-Cache-Control (Netlify's durable
// edge) — each with a stale-while-revalidate window, so the closer-to-user tier
// expires first while the durable edge absorbs most requests.

import type { H3Event } from 'h3'

export interface CachePolicy {
  /** Private browser cache lifetime (`max-age`), seconds — the shortest tier. */
  browser: number
  /** Shared CDN cache lifetime (`s-maxage`), seconds — the middle tier. */
  cdn: number
  /** Netlify durable-edge lifetime, seconds — the longest tier. */
  netlify: number
  /** `stale-while-revalidate` window, seconds. */
  swr: number
}

/**
 * ~1 minute class. For data that changes often and where freshness matters:
 * PR/issue status, notifications, CI/pipeline runs.
 */
export const CACHE_SHORT: CachePolicy = { browser: 30, cdn: 60, netlify: 120, swr: 300 }

/**
 * ~5 minute class. For data where being a few minutes old is fine: timelines,
 * trending, following feeds, repo trees, profiles.
 */
export const CACHE_MEDIUM: CachePolicy = { browser: 120, cdn: 300, netlify: 900, swr: 1800 }

/** Effectively-immutable content (blobs at a pinned commit, etc.). */
export const CACHE_LONG: CachePolicy = { browser: 600, cdn: 3600, netlify: 86_400, swr: 86_400 }

/** Explicitly opt out of shared caching (authenticated / per-user responses). */
export function setNoStore(event: H3Event): void {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
}

/**
 * Emit rising browser / CDN / Netlify cache headers for the given policy.
 * Safe only for responses that are identical for every viewer (public reads).
 */
export function setCacheHeaders(event: H3Event, policy: CachePolicy): void {
  setResponseHeader(
    event,
    'Cache-Control',
    `public, max-age=${policy.browser}, s-maxage=${policy.cdn}, stale-while-revalidate=${policy.swr}`
  )
  setResponseHeader(
    event,
    'CDN-Cache-Control',
    `public, s-maxage=${policy.cdn}, stale-while-revalidate=${policy.swr}`
  )
  // `durable` keeps the entry across deploys on Netlify's edge.
  setResponseHeader(
    event,
    'Netlify-CDN-Cache-Control',
    `public, durable, s-maxage=${policy.netlify}, stale-while-revalidate=${policy.swr}`
  )
}

/**
 * Pick a cache policy for a Tangled/atproto XRPC method name (NSID). Frequently
 * changing subjects (issues, pulls, CI) get the short tier; browsing reads
 * (repos, trees, blobs, profiles, follows) get the medium tier.
 */
export function policyForNsid(nsid: string): CachePolicy {
  const n = nsid.toLowerCase()
  if (/(listissues|listpulls|querypipelines|getpipeline|notification|listcomments)/.test(n)) {
    return CACHE_SHORT
  }
  if (/(blob|\.tree|\.log|\.diff|getcommit)/.test(n)) return CACHE_LONG
  return CACHE_MEDIUM
}
