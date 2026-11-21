// Signs that the caller administers a forge organisation, so they can set up the organisation's
// Community. Stateless: nothing is stored, and the signed proof goes into the caller's own
// `space.maintainers.community` record, where anyone can check it against our JWKS.
//
// Three things are checked before signing:
//
//   1. The forge account is the caller's. Their server-signed forge-account attestation binds the
//      account to their DID, and is re-verified here rather than trusted.
//   2. The token belongs to that same account. Attestations are public records, so without this
//      anyone could pair someone else's attestation with their own token.
//   3. That account administers the organisation, asked of the forge with the token. The token is
//      used for these two requests and never stored.
import { z } from 'zod'

const bodySchema = z.object({
  did: z.string().regex(/^did:[a-z]+:[\w.:%-]+$/),
  provider: z.string().min(1).max(64),
  host: z.string().max(253).optional(),
  owner: z.string().min(1).max(256),
  username: z.string().min(1).max(128),
  attestation: z.string().min(1).max(4096),
  attestedBy: z.string().min(1).max(512)
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const token = getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: `Connect your ${body.provider} account to set up a Community for an organisation.`
    })
  }

  const verdict = await verifyForgeAttestationServer(
    {
      provider: body.provider,
      username: body.username,
      attestation: body.attestation,
      attestedBy: body.attestedBy
    },
    body.did
  )
  if (verdict === 'no-trust-anchor') {
    throw createError({
      statusCode: 503,
      statusMessage:
        'This deployment trusts no attestation issuer. Set NUXT_PUBLIC_SITE_URL to the origin that signs them.'
    })
  }
  if (verdict !== 'ok') {
    throw createError({
      statusCode: 403,
      statusMessage: `Could not verify your ${body.provider} account. Reconnect it in Settings and try again.`
    })
  }

  const provider = getOAuthProvider(body.provider)
  if (!provider) {
    throw createError({
      statusCode: 422,
      statusMessage: `Organisation Communities aren't supported on ${body.provider} yet.`
    })
  }
  let login: string
  try {
    login = await provider.fetchUsername(token)
  } catch {
    throw createError({
      statusCode: 401,
      statusMessage: `Your ${body.provider} connection is no longer valid. Reconnect it in Settings.`
    })
  }
  if (login.toLowerCase() !== body.username.toLowerCase()) {
    throw createError({
      statusCode: 403,
      statusMessage: `Your ${body.provider} connection is signed in as ${login}, not ${body.username}.`
    })
  }

  const outcome = await verifyOwnerAdmin(body.provider, body.owner, token, body.host)
  if (outcome.result === 'unsupported') {
    throw createError({
      statusCode: 422,
      statusMessage: `Organisation Communities aren't supported on ${body.provider} yet.`
    })
  }
  if (outcome.result === 'denied') {
    throw createError({
      statusCode: outcome.reason === 'bad-token' ? 401 : 403,
      statusMessage: describeOrgDenial(outcome.reason, body.provider, body.owner)
    })
  }

  const signed = await signCommunityAdminAttestation({
    origin: getRequestURL(event).origin,
    did: body.did,
    provider: body.provider,
    owner: body.owner,
    host: body.host
  })
  if (!signed) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'This deployment has no signing key, so it cannot vouch for organisation admins.'
    })
  }
  return signed
})
