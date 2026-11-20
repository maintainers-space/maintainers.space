import type { FetchLike, ForgeProvider, Forges } from 'forges'
import { createForges } from 'forges'
import { bitbucket } from 'forges/bitbucket'
import { forgejo } from 'forges/forgejo'
import { gitea } from 'forges/gitea'
import { github } from 'forges/github'
import { gitlab } from 'forges/gitlab'
import { tangled } from 'forges/tangled'

import { proxiedFetch } from '~/lib/atproto/proxied-fetch'
import type { ForgeDescriptor } from './registry'
import { forgeList } from './registry'

/** The signed-in viewer's atproto session, as far as Tangled's PDS reads need it. */
export interface AtprotoCredentials {
  did: string
  /** Sends a DPoP-signed request to the viewer's PDS; `path` is relative to the PDS origin. */
  handle: (path: string, init?: RequestInit) => Promise<Response>
  pds: string
}

export interface ForgeCredentials {
  atproto?: AtprotoCredentials
  /** Forge access tokens keyed by app forge id. */
  tokens: Readonly<Record<string, string | undefined>>
}

// Only the cached read proxy is allowed to see anonymous traffic, and only
// for search endpoints: it returns the body without headers, so it cannot
// serve paginated listings that depend on `Link`.
const SEARCH_PATH_RE = /\/(?:search|repos\/search|users\/search|repos\/issues\/search)(?:\/|$)/

const PROXIED_ORIGINS = new Set([
  'https://api.github.com',
  'https://gitea.com',
  'https://codeberg.org',
  'https://gitlab.com'
])

export function createAppForges(credentials: ForgeCredentials): Forges {
  return createForges(forgeList.map((descriptor) => createProvider(descriptor, credentials)))
}

/** One provider for `descriptor`, optionally with a narrower `token` than the account-wide one. */
export function createAppProvider(
  descriptor: ForgeDescriptor,
  credentials: ForgeCredentials,
  token?: string
): ForgeProvider {
  return createProvider(descriptor, credentials, token)
}

function createProvider(
  descriptor: ForgeDescriptor,
  { atproto, tokens }: ForgeCredentials,
  tokenOverride?: string
): ForgeProvider {
  const token = tokenOverride ?? tokens[descriptor.id]
  const auth = token ? ({ type: 'token', token } as const) : undefined
  const common = { auth, baseUrl: descriptor.baseUrl, instance: descriptor.instance }
  const fetch = token ? createLogRelayFetch() : createCachedSearchFetch()

  switch (descriptor.kind) {
    case 'github':
      return github({ ...common, fetch })
    case 'gitlab':
      return gitlab({ ...common, fetch })
    case 'forgejo':
      return forgejo({ ...common, fetch })
    case 'gitea':
      return gitea({ ...common, fetch })
    case 'bitbucket':
      return bitbucket({ ...common, fetch })
    case 'tangled':
      return tangled({
        auth: atproto
          ? {
              did: atproto.did,
              // The package passes absolute URLs; the atproto agent wants a path on the PDS.
              fetch: (url: string, init?: RequestInit) => {
                const { pathname, search } = new URL(url)
                return atproto.handle(pathname + search, init)
              },
              pds: atproto.pds,
              type: 'oauth'
            }
          : undefined,
        // Bobbin sends no CORS headers, so `request()` and the thread index go through our relay.
        apiUrl: `${location.origin}/api/tangled`,
        fetch: proxiedFetch,
        listSource: 'index'
      })
    default:
      throw new Error(`No provider is configured for forge kind "${descriptor.kind}".`)
  }
}

/** Anonymous search reads are identical for every viewer, so they go through our cached relay. */
function createCachedSearchFetch(): FetchLike {
  return (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const url = new URL(input)
    if (
      method !== 'GET' ||
      !PROXIED_ORIGINS.has(url.origin) ||
      !SEARCH_PATH_RE.test(url.pathname)
    ) {
      return fetch(input, init)
    }
    const params = new URLSearchParams(url.search)
    params.set('url', url.origin + url.pathname)
    const accept = new Headers(init?.headers).get('accept')
    if (accept) params.set('accept', accept)
    return fetch(`/api/search-proxy?${params.toString()}`, { signal: init?.signal })
  }
}

const GITHUB_JOB_LOG_RE = /^\/repos\/([^/]+)\/([^/]+)\/actions\/jobs\/(\d+)\/logs$/

/**
 * GitHub redirects a job log to blob storage whose CORS headers only allow github.com, so a
 * browser can never follow it. Our same-origin relay fetches it server-side instead.
 */
function createLogRelayFetch(): FetchLike {
  return (input, init) => {
    const url = new URL(input)
    const match =
      url.origin === 'https://api.github.com' ? GITHUB_JOB_LOG_RE.exec(url.pathname) : null
    if (!match) return fetch(input, init)
    const params = new URLSearchParams({ jobId: match[3]!, owner: match[1]!, repo: match[2]! })
    return fetch(`/api/github/actions-log?${params.toString()}`, {
      headers: { authorization: new Headers(init?.headers).get('authorization') ?? '' },
      signal: init?.signal
    })
  }
}
