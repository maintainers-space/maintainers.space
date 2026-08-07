// Registers "this community serves this forge owner" in the fast local index
// (see server/utils/chat-index.ts), for a community that was either just created
// or is an existing one the caller is linking. Two independent authorization
// checks happen here, server-side, rather than trusting the client:
//
//   1. The caller controls the forge owner. Re-verifies their own server-signed
//      forgeAccount attestation (the same one useForgeAttestations.ts checks
//      client-side), so an arbitrary caller can't squat the "official" chat slot
//      for an owner they don't control.
//   2. The caller owns the community. Reads the community repo's protected Owner
//      role and its holder straight from its PDS (see chat-community.ts), so
//      nobody can bind somebody else's community to their own repo pages.
//
// The community AT-URI is derived from the DID rather than accepted from the
// client, since social.colibri.community is a `literal:self` singleton.
//
// Check 1 has two shapes. For a personal repo the attested forge username IS
// the owner, so the attestation alone settles it. For an org-owned repo it
// cannot: an OAuth app has no standing to inspect an org, and the attestation
// only ever proves which forge account the caller controls. So the caller also
// forwards their forge token and chat-org-admin.ts asks the forge the only
// question it will answer, namely what *this user's* role in that org is, requiring
// owner/admin. The token is used for that one request and never stored.
import { z } from 'zod'

const bodySchema = z.object({
  provider: z.string().min(1).max(64),
  host: z.string().max(253).optional(),
  owner: z.string().min(1).max(256),
  ownerDid: z.string().min(1),
  username: z.string().min(1).max(128),
  attestation: z.string().min(1),
  attestedBy: z.string().min(1),
  communityDid: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  const verdict = await verifyForgeAttestationServer(
    {
      provider: body.provider,
      username: body.username,
      attestation: body.attestation,
      attestedBy: body.attestedBy
    },
    body.ownerDid
  )
  if (verdict === 'no-trust-anchor') {
    throw createError({
      statusCode: 503,
      statusMessage:
        'This deployment trusts no attestation issuer, so none can be checked. Set NUXT_PUBLIC_APP_URL to the origin that signs them.'
    })
  }
  if (verdict === 'untrusted-issuer') {
    throw createError({
      statusCode: 403,
      statusMessage: `That account was attested by ${body.attestedBy}, which this deployment does not trust. Reconnect your ${body.provider} account here to get one it does.`
    })
  }
  if (verdict !== 'ok') {
    throw createError({
      statusCode: 403,
      statusMessage: "Could not verify that account's attestation."
    })
  }

  const isPersonalRepo = body.owner.toLowerCase() === body.username.toLowerCase()
  if (!isPersonalRepo) {
    const forgeToken = getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '')
    if (!forgeToken) {
      throw createError({
        statusCode: 401,
        statusMessage: `Connect your ${body.provider} account to enable chat for an organisation.`
      })
    }

    const outcome = await verifyOwnerAdmin(body.provider, body.owner, forgeToken, body.host)
    if (outcome.result === 'unsupported') {
      throw createError({
        statusCode: 403,
        statusMessage: `Organisation repos aren't supported on ${body.provider} yet. Chat can still be enabled for your own repos.`
      })
    }
    if (outcome.result === 'denied') {
      throw createError({
        statusCode: outcome.reason === 'bad-token' ? 401 : 403,
        statusMessage: describeOrgDenial(outcome.reason, body.provider, body.owner)
      })
    }
  }

  const result = await resolveCommunityOwnership(body.communityDid)
  if (!result.ok) {
    throw createError({
      statusCode: result.reason === 'unreachable' ? 502 : 404,
      statusMessage: describeCommunityFailure(result.reason, body.communityDid)
    })
  }
  const ownership = result.ownership
  if (ownership.ownerDid !== body.ownerDid) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You are not the owner of that community.'
    })
  }

  await setCommunityBinding({
    communityDid: ownership.communityDid,
    communityUri: ownership.communityUri,
    provider: body.provider,
    host: body.host,
    owner: body.owner,
    createdAt: new Date().toISOString()
  })

  return { ok: true }
})
