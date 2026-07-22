import { cached, TTL } from '~/lib/cache'
import { getJson } from './proxied-fetch'

const CONSTELLATION = 'https://constellation.microcosm.blue'

export interface Backlink {
  did: string
  collection: string
  rkey: string
}

interface BacklinksResponse {
  records?: Backlink[]
  cursor?: string | null
}

/**
 * Reverse-resolve atproto backlinks via microcosm's constellation index: every
 * record whose `source` field (`<nsid>:<path>`) points at `subject`. Public,
 * CORS-enabled and cached; returns [] on any failure so callers degrade cleanly.
 */
export function getBacklinks(
  subject: string,
  source: string,
  opts: { cap?: number, force?: boolean } = {}
): Promise<Backlink[]> {
  const cap = opts.cap ?? 100
  return cached(`constellation:${source}|${subject}`, async () => {
    const out: Backlink[] = []
    let cursor: string | undefined
    for (let page = 0; page < 5; page++) {
      const body = await getJson<BacklinksResponse>(
        `${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinks`,
        { subject, source, limit: Math.min(100, cap - out.length), cursor }
      ).catch(() => null)
      if (!body) break
      out.push(...(body.records ?? []))
      cursor = body.cursor ?? undefined
      if (!cursor || out.length >= cap) break
    }
    return out
  }, { ttl: TTL.MEDIUM, force: opts.force })
}
