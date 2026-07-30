// Mints a fresh PDS account for a new chat community, using the PDS admin
// credentials (server-only secret). Returns one-time bring-your-own-PDS
// credentials to the caller, who is about to become that community's Owner by
// calling social.colibri.community.create with them — see
// app/composables/useChatCommunity.ts for the full "Enable Chat" flow this is
// step one of.
//
// This route deliberately does NOT verify forge-admin rights: minting an empty,
// unclaimed account has no consequence on its own (nobody's repo page points at
// it yet). The real gate is register-binding.post.ts, which only lets a caller
// attach a community to an owner's repo pages once it can verify — via their
// own already-attested space.maintainers.forgeAccount record — that they
// actually own that forge account.
import { z } from 'zod'

const bodySchema = z.object({
  provider: z.string().min(1).max(64),
  host: z.string().max(253).optional(),
  owner: z.string().min(1).max(256)
})

function sanitizeHandleSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
    .slice(0, 40)
}

function randomPassword(): string {
  return crypto.randomUUID() + crypto.randomUUID()
}

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const config = useRuntimeConfig()
  const pdsLoc = config.chat.pdsLoc as string
  const pdsAdminPass = config.chat.pdsAdminPass as string
  const handleDomain = config.chat.appviewHandleDomain as string

  if (!pdsAdminPass) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Chat is not configured on this deployment (missing NUXT_CHAT_PDS_ADMIN_PASS).'
    })
  }

  const providerTag = sanitizeHandleSegment(body.provider)
  const ownerTag = sanitizeHandleSegment(body.owner)
  const suffix = crypto.randomUUID().slice(0, 8)
  const handle = `${providerTag}-${ownerTag}-${suffix}.${handleDomain}`
  const password = randomPassword()

  const inviteRes = await fetch(`${pdsLoc}/xrpc/com.atproto.server.createInviteCode`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Basic ${Buffer.from(`admin:${pdsAdminPass}`).toString('base64')}`
    },
    body: JSON.stringify({ useCount: 1 })
  })
  if (!inviteRes.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `PDS invite creation failed: ${await inviteRes.text()}`
    })
  }
  const { code: inviteCode } = (await inviteRes.json()) as { code: string }

  const accountRes = await fetch(`${pdsLoc}/xrpc/com.atproto.server.createAccount`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handle, password, inviteCode })
  })
  if (!accountRes.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `PDS account creation failed: ${await accountRes.text()}`
    })
  }
  const account = (await accountRes.json()) as { did: string; handle: string }

  return {
    did: account.did,
    handle: account.handle,
    pds: pdsLoc,
    identifier: account.handle,
    password
  }
})
