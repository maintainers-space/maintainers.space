import { z } from 'zod'

const querySchema = z.object({
  did: z
    .string()
    .min(1)
    .max(256)
    .refine((v) => v.startsWith('did:'), 'Must be a DID.')
})

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)

  const result = await resolveCommunityOwnership(query.did)
  if (!result.ok) {
    throw createError({
      statusCode: result.reason === 'unreachable' ? 502 : 404,
      statusMessage: describeCommunityFailure(result.reason, query.did)
    })
  }

  setCacheHeaders(event, CACHE_SHORT)
  return result.ownership
})
