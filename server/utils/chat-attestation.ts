// Server-side counterpart of app/lib/atproto/attestation.ts's verifyForgeAttestation,
// used by register-binding.post.ts. Deliberately not a shared import: that file
// branches on `import.meta.client` and references `window`, which is fine in the
// app bundle but fails Nitro's server-side typecheck (no DOM lib there) since
// importing it pulls the whole file into the server TS project. The verification
// logic itself (JWS check against the issuer's published JWKS) is duplicated
// here in a form that only ever trusts `runtimeConfig.public.appUrl` — there's
// no server-side equivalent of "the current browser origin" to fall back to.
import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose'

const ATTESTATION_AUDIENCE = 'space.maintainers.forgeAccount'

export interface AttestableAccount {
  provider: string
  username: string
  attestation?: string
  attestedBy?: string
}

const jwksByOrigin = new Map<string, JWTVerifyGetKey>()
function jwksFor(origin: string): JWTVerifyGetKey {
  let jwks = jwksByOrigin.get(origin)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL('/.well-known/jwks.json', origin))
    jwksByOrigin.set(origin, jwks)
  }
  return jwks
}

export async function verifyForgeAttestationServer(
  account: AttestableAccount,
  ownerDid: string
): Promise<boolean> {
  const { attestation, attestedBy } = account
  if (!attestation || !attestedBy || !ownerDid) return false

  let issuerOrigin: string
  try {
    issuerOrigin = new URL(attestedBy).origin
  } catch {
    return false
  }

  const appUrl = useRuntimeConfig().public.appUrl as string
  const trusted = new Set<string>()
  if (appUrl) {
    try {
      trusted.add(new URL(appUrl).origin)
    } catch {
      /* ignore malformed config */
    }
  }
  if (!trusted.has(issuerOrigin)) return false

  try {
    const { payload } = await jwtVerify(attestation, jwksFor(issuerOrigin), {
      issuer: attestedBy,
      audience: ATTESTATION_AUDIENCE,
      algorithms: ['ES256']
    })
    const claims = payload as Record<string, unknown>
    return (
      payload.sub === ownerDid &&
      claims.provider === account.provider &&
      claims.username === account.username
    )
  } catch {
    return false
  }
}
