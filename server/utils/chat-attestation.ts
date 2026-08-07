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

export type AttestationVerdict =
  | 'ok'
  | 'missing'
  | 'no-trust-anchor'
  | 'untrusted-issuer'
  | 'invalid'

/**
 * Deliberately does NOT fall back to the request origin the way the client falls
 * back to `window.location.origin`. `getRequestURL()` honours `x-forwarded-host`,
 * so trusting it would let an attacker point the trust anchor at a host they
 * control, serve their own JWKS there, and self-sign any attestation. The
 * configured origin is the only safe anchor, which is why an unset one is
 * reported as misconfiguration rather than as a failed attestation.
 */
export async function verifyForgeAttestationServer(
  account: AttestableAccount,
  ownerDid: string
): Promise<AttestationVerdict> {
  const { attestation, attestedBy } = account
  if (!attestation || !attestedBy || !ownerDid) return 'missing'

  let issuerOrigin: string
  try {
    issuerOrigin = new URL(attestedBy).origin
  } catch {
    return 'invalid'
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
  if (trusted.size === 0) return 'no-trust-anchor'
  if (!trusted.has(issuerOrigin)) return 'untrusted-issuer'

  try {
    const { payload } = await jwtVerify(attestation, jwksFor(issuerOrigin), {
      issuer: attestedBy,
      audience: ATTESTATION_AUDIENCE,
      algorithms: ['ES256']
    })
    const claims = payload as Record<string, unknown>
    const matches =
      payload.sub === ownerDid &&
      claims.provider === account.provider &&
      claims.username === account.username
    return matches ? 'ok' : 'invalid'
  } catch (e) {
    console.warn('[chat] attestation signature check failed', {
      issuerOrigin,
      error: e instanceof Error ? e.message : String(e)
    })
    return 'invalid'
  }
}
