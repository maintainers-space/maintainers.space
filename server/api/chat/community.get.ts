// Public read of the local owner -> community index (see chat-index.ts). The
// repo page calls this to decide whether to show the Chat tab and, if so,
// which community to load — cheap and cacheable versus resolving it from
// atproto on every page view.
import { z } from 'zod'

const querySchema = z.object({
  provider: z.string().min(1).max(64),
  host: z.string().max(253).optional(),
  owner: z.string().min(1).max(256)
})

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  const binding = await getCommunityBinding(query.provider, query.owner, query.host)
  setCacheHeaders(event, CACHE_SHORT)
  return { binding }
})
