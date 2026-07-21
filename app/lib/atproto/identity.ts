import {
  CompositeDidDocumentResolver,
  DohJsonHandleResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  WellKnownHandleResolver,
  XrpcHandleResolver
} from '@atcute/identity-resolver'
import type { HandleResolver, ResolveHandleOptions } from '@atcute/identity-resolver'
import type { ActorIdentifier } from '@atcute/lexicons'
import type { AtprotoDid, Handle } from '@atcute/lexicons/syntax'
import { proxiedFetch } from './proxied-fetch'

/**
 * Public atproto AppView used purely as a *server-side* handle-resolution proxy
 * (`com.atproto.identity.resolveHandle`). This is the one method that works from
 * a browser for EVERY handle regardless of PDS — see FallbackHandleResolver.
 */
const APPVIEW_URL = 'https://public.api.bsky.app'

/**
 * Races several handle-resolution methods and returns the first to *succeed*.
 * Resolution only fails if every method fails. This is what makes koinon able to
 * sign in ANY handle from ANY PDS directly in the browser:
 *
 *   - XRPC (AppView): delegates DNS/well-known lookup to a server, so it is not
 *     subject to browser CORS. This is the workhorse — it resolves handles that
 *     are verified via the HTTP `.well-known/atproto-did` method (e.g. PDS
 *     subdomain handles like `*.npmx.social`), which a browser cannot fetch
 *     cross-origin itself.
 *   - DNS-over-HTTPS (dns.google): resolves handles verified via the
 *     `_atproto.<handle>` TXT record, independently of any AppView.
 *   - HTTP well-known: last-ditch direct fetch, only succeeds for the rare
 *     handle domain that sets permissive CORS, but harmless to try.
 */
class FallbackHandleResolver implements HandleResolver {
  #methods: HandleResolver[]

  constructor(methods: HandleResolver[]) {
    this.#methods = methods
  }

  resolve(handle: Handle, options?: ResolveHandleOptions): Promise<AtprotoDid> {
    const methods = this.#methods
    return new Promise<AtprotoDid>((resolve, reject) => {
      if (!methods.length) {
        reject(new Error('no handle resolvers configured'))
        return
      }
      let pending = methods.length
      let firstError: unknown
      let settled = false
      for (const method of methods) {
        method.resolve(handle, options).then(
          (did) => {
            if (!settled) {
              settled = true
              resolve(did)
            }
          },
          (err) => {
            if (firstError === undefined) firstError = err
            pending -= 1
            if (pending === 0 && !settled) reject(firstError)
          }
        )
      }
    })
  }
}

/**
 * A single, robust, fully-decentralized identity resolver shared across the app
 * (OAuth login + every public read). This is the backbone that lets koinon
 * support *any* atproto account regardless of which PDS hosts it.
 *
 * Handle -> DID resolution races the methods described on FallbackHandleResolver
 * so any handle resolves from the browser, and fails only if all methods fail.
 *
 * DID -> document resolution supports did:plc (plc.directory) and did:web.
 *
 * LocalActorResolver additionally performs *bidirectional* handle verification
 * (the DID document's declared handle must resolve back to the same DID),
 * preventing handle spoofing.
 */
export const identityResolver = new LocalActorResolver({
  handleResolver: new FallbackHandleResolver([
    new XrpcHandleResolver({ serviceUrl: APPVIEW_URL, fetch: proxiedFetch }),
    new DohJsonHandleResolver({ dohUrl: 'https://dns.google/resolve', fetch: proxiedFetch }),
    new WellKnownHandleResolver({ fetch: proxiedFetch })
  ]),
  didDocumentResolver: new CompositeDidDocumentResolver({
    methods: {
      plc: new PlcDidDocumentResolver({ fetch: proxiedFetch }),
      web: new WebDidDocumentResolver({ fetch: proxiedFetch })
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
