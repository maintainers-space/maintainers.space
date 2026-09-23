// Client-side verification of server-signed forge-account attestations.
//
// A `space.maintainers.forgeAccount` record is public and user-writable, so its
// `verified: true` flag is meaningless on its own. Trust is established only by
// the `attestation` — a compact JWS signed by the maintainers.space server (see
// server/utils/attestation.ts). This verifies that signature and that its claims
// match the record (owner DID, provider, username), so a forged/edited record
// cannot display as verified.

import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose'

/** Must match ATTESTATION_AUDIENCE in server/utils/attestation.ts. */
const ATTESTATION_AUDIENCE = 'space.maintainers.forgeAccount'

export interface AttestableAccount {
  provider: string
  username: string
  attestation?: string
  attestedBy?: string
}

/**
 * Origins whose attestations we trust. An attacker could set any `attestedBy`
 * and self-sign, so we only trust our own deployment's issuer(s): the current
 * origin plus the configured public site URL, if any.
 */
function trustedIssuers(): Set<string> {
  const set = new Set<string>()
  if (import.meta.client) set.add(window.location.origin)
  const siteUrl = useRuntimeConfig().public.siteUrl
  if (siteUrl) {
    try {
      set.add(new URL(siteUrl).origin)
    } catch {
      /* ignore malformed config */
    }
  }
  return set
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

const resultCache = new Map<string, Promise<boolean>>()

/**
 * Verify an account's attestation binds it to `ownerDid`. Resolves `false` for
 * missing/untrusted/invalid attestations (never throws). Results are cached;
 * transient failures are not cached so they can be retried.
 */
export function verifyForgeAttestation(
  account: AttestableAccount,
  ownerDid: string
): Promise<boolean> {
  const { attestation, attestedBy } = account
  if (!attestation || !attestedBy || !ownerDid) return Promise.resolve(false)

  const cacheKey = `${ownerDid}|${account.provider}|${account.username}|${attestation}`
  const hit = resultCache.get(cacheKey)
  if (hit) return hit

  const promise = (async (): Promise<boolean> => {
    let issuerOrigin: string
    try {
      issuerOrigin = new URL(attestedBy).origin
    } catch {
      return false
    }
    if (!trustedIssuers().has(issuerOrigin)) return false

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
  })()

  resultCache.set(cacheKey, promise)
  promise.then(
    (ok) => {
      if (!ok) resultCache.delete(cacheKey)
    },
    () => resultCache.delete(cacheKey)
  )
  return promise
}
