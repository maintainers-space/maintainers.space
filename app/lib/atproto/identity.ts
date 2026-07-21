import {
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  DohJsonHandleResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  WellKnownHandleResolver
} from '@atcute/identity-resolver'
import type { ActorIdentifier } from '@atcute/lexicons'

/**
 * A single, robust, fully-decentralized identity resolver shared across the app
 * (OAuth login + every public read). This is the backbone that lets koinon
 * support *any* atproto account regardless of which PDS hosts it.
 *
 * Handle -> DID resolution races two independent methods so any handle resolves:
 *   - DNS-over-HTTPS: reads the `_atproto.<handle>` TXT record (via dns.google)
 *   - HTTPS well-known: fetches `https://<handle>/.well-known/atproto-did`
 * With the `race` strategy the first method to *succeed* wins, and resolution
 * only fails if BOTH methods fail — maximally tolerant of a single point failing.
 *
 * DID -> document resolution supports did:plc (plc.directory) and did:web.
 *
 * LocalActorResolver additionally performs *bidirectional* handle verification
 * (the DID document's declared handle must resolve back to the same DID),
 * preventing handle spoofing.
 */
export const identityResolver = new LocalActorResolver({
  handleResolver: new CompositeHandleResolver({
    strategy: 'race',
    methods: {
      dns: new DohJsonHandleResolver({ dohUrl: 'https://dns.google/resolve' }),
      http: new WellKnownHandleResolver()
    }
  }),
  didDocumentResolver: new CompositeDidDocumentResolver({
    methods: {
      plc: new PlcDidDocumentResolver(),
      web: new WebDidDocumentResolver()
    }
  })
})

export interface ResolvedIdentity {
  did: string
  /** Verified handle, or `handle.invalid` when verification fails. */
  handle: string
  /** PDS service endpoint (origin) used for record reads/writes. */
  pds: string
}

const cache = new Map<string, Promise<ResolvedIdentity>>()

function normalize(identifier: string): string {
  return identifier.trim().replace(/^@/, '')
}

/** True when the resolver could not verify a handle for the identity. */
export function isVerifiedHandle(handle: string): boolean {
  return !!handle && handle !== 'handle.invalid'
}

/**
 * Resolve a handle or DID to `{ did, handle, pds }`. Results are cached per
 * identifier for the lifetime of the page; failures are never cached so a
 * transient network error can be retried.
 */
export function resolveIdentity(identifier: string): Promise<ResolvedIdentity> {
  const id = normalize(identifier)
  const hit = cache.get(id)
  if (hit) return hit

  const promise = identityResolver
    .resolve(id as ActorIdentifier)
    .then((r): ResolvedIdentity => ({ did: r.did, handle: r.handle, pds: r.pds }))

  cache.set(id, promise)
  promise.catch(() => cache.delete(id))
  return promise
}

/** Resolve a handle (or pass-through DID) to just its DID string. */
export async function resolveDid(identifier: string): Promise<string> {
  const id = normalize(identifier)
  if (id.startsWith('did:')) return id
  return (await resolveIdentity(id)).did
}

/** Resolve to the PDS service endpoint that hosts the account's records. */
export async function resolvePds(identifier: string): Promise<string> {
  return (await resolveIdentity(identifier)).pds
}
