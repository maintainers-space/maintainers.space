// Server-signed forge-account attestations.
//
// atproto PDS records are public AND user-writable, so a `verified: true` flag a
// user sets on their own record proves nothing — anyone could claim any username.
// To make "this GitHub account belongs to this atproto DID" un-forgeable, the
// koinon SERVER (the only party that actually proves GitHub ownership via OAuth,
// and the only holder of the private key) signs a compact JWS binding
// { iss: origin, sub: did, aud, provider, username }. The user cannot forge it
// because they don't have the private key; verifiers check the signature against
// the server's published JWKS and that `sub` equals the record owner's DID.

import { SignJWT, importJWK, calculateJwkThumbprint, type JWK } from 'jose'

/** JWS audience — identifies the purpose so a token can't be replayed elsewhere. */
export const ATTESTATION_AUDIENCE = 'dev.koinon.forgeAccount'
const ALG = 'ES256'

interface LoadedKey {
  kid: string
  privateKey: CryptoKey
  publicJwk: JWK
}

let cache: Promise<LoadedKey | null> | null = null

/** Load + cache the ES256 signing key from runtime config. `null` when unconfigured. */
function loadKey(): Promise<LoadedKey | null> {
  if (cache) return cache
  cache = (async (): Promise<LoadedKey | null> => {
    // Nuxt applies env vars to runtime config through `destr`, so a JSON-shaped
    // NUXT_ATTESTATION_PRIVATE_KEY arrives already parsed into an object; a plain
    // string (e.g. from nuxt.config) needs parsing. Accept both.
    const raw = useRuntimeConfig().attestation?.privateKey as unknown
    if (!raw) return null

    let jwk: JWK
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (!trimmed) return null
      try {
        jwk = JSON.parse(trimmed) as JWK
      } catch {
        throw new Error('NUXT_ATTESTATION_PRIVATE_KEY is not valid JWK JSON')
      }
    } else if (typeof raw === 'object') {
      jwk = raw as JWK
    } else {
      throw new Error('NUXT_ATTESTATION_PRIVATE_KEY must be a JWK (JSON object)')
    }
    if (!jwk.d) throw new Error('NUXT_ATTESTATION_PRIVATE_KEY must be a private JWK (missing "d")')

    const privateKey = (await importJWK(jwk, ALG)) as CryptoKey
    // Public JWK = private minus the private component `d`.
    const { d: _d, ...pub } = jwk
    const kid = jwk.kid ?? (await calculateJwkThumbprint(pub))
    const publicJwk: JWK = { ...pub, alg: ALG, use: 'sig', kid }
    return { kid, privateKey, publicJwk }
  })()
  return cache
}

/** True when a signing key is configured (i.e. attestations can be issued). */
export async function attestationEnabled(): Promise<boolean> {
  return (await loadKey()) !== null
}

/**
 * Sign an attestation binding a forge account to an atproto DID. Returns `null`
 * when no signing key is configured (linking then proceeds without a proof).
 */
export async function signForgeAttestation(input: {
  origin: string
  did: string
  provider: string
  username: string
}): Promise<{ attestation: string; attestedBy: string } | null> {
  const key = await loadKey()
  if (!key) return null

  const attestation = await new SignJWT({ provider: input.provider, username: input.username })
    .setProtectedHeader({ alg: ALG, kid: key.kid, typ: 'JWT' })
    .setIssuer(input.origin)
    .setSubject(input.did)
    .setAudience(ATTESTATION_AUDIENCE)
    .setIssuedAt()
    .sign(key.privateKey)

  return { attestation, attestedBy: input.origin }
}

/** Public JWKS for verifiers. Empty `keys` when no key is configured. */
export async function getAttestationJwks(): Promise<{ keys: JWK[] }> {
  const key = await loadKey()
  return { keys: key ? [key.publicJwk] : [] }
}
