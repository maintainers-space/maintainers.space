// Registers "this community serves this forge owner" in the fast local index
// (see server/utils/chat-index.ts) once a community has been created and its
// space.maintainers.chat.repoBinding record written. The real authorization
// check happens here, server-side: re-verifies the caller's own server-signed
// forgeAccount attestation (the same one useForgeAttestations.ts checks
// client-side) rather than trusting the client's word for it, so an arbitrary
// caller can't squat the "official" chat slot for an owner they don't control.
//
// v1 scope: only lets someone bind a community to the owner matching their OWN
// verified forge username, i.e. personal repos. Org-repo admin verification
// (checking org membership/role via the forge's API) isn't implemented yet —
// see the "Enable Chat" gating note in useChatCommunity.ts.
import { z } from 'zod'

const bodySchema = z.object({
  provider: z.string().min(1).max(64),
  host: z.string().max(253).optional(),
  owner: z.string().min(1).max(256),
  ownerDid: z.string().min(1),
  username: z.string().min(1).max(128),
  attestation: z.string().min(1),
  attestedBy: z.string().min(1),
  communityDid: z.string().min(1),
  communityUri: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.owner.toLowerCase() !== body.username.toLowerCase()) {
    throw createError({
      statusCode: 403,
      statusMessage:
        'Chat can currently only be enabled for the owner matching your own linked forge account.'
    })
  }

  const verified = await verifyForgeAttestationServer(
    {
      provider: body.provider,
      username: body.username,
      attestation: body.attestation,
      attestedBy: body.attestedBy
    },
    body.ownerDid
  )
  if (!verified) {
    throw createError({
      statusCode: 403,
      statusMessage: "Could not verify that account's attestation."
    })
  }

  await setCommunityBinding({
    communityDid: body.communityDid,
    communityUri: body.communityUri,
    provider: body.provider,
    host: body.host,
    owner: body.owner,
    createdAt: new Date().toISOString()
  })

  return { ok: true }
})
