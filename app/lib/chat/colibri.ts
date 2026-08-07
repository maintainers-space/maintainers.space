// Typed client for the two `social.colibri.*` procedures maintainers.space calls
// itself: creating a community and adding its default channels. Everything else
// (reading channels, messages, members, and the live event stream) belongs to
// the embedded client (see app/components/chat/ColibriEmbed.vue), which brings
// its own XRPC layer.
//
// Colibri's lexicons aren't registered in @atcute's ambient type registry
// (they're a separate project), so these are hand-typed against the lexicon JSON
// in https://github.com/colibri-social/appview/tree/main/lexicons rather than
// going through `Client<TQueries, TProcedures>`.
import { ok } from '@atcute/client'
import type {} from '@atcute/atproto'
import type { Nsid } from '@atcute/lexicons'

export class ColibriXrpcError extends Error {
  constructor(
    public readonly errorName: string,
    message: string | undefined,
    public readonly status: number
  ) {
    super(message ?? errorName)
  }
}

/**
 * Short-lived service-auth JWT scoped to one procedure on the AppView, minted via
 * the caller's own atproto OAuth session. The `aud` must be byte-identical to the
 * one the granting `include:` permission set was requested under, which is why
 * both derive from runtimeConfig.public.colibriAppviewUrl rather than from
 * whichever host the call is dialled at. Must be re-minted per call, and these tokens
 * are intentionally short-lived.
 */
async function getServiceAuthToken(lxm: string): Promise<string> {
  const { runAuthed } = useAuth()
  const aud = appViewServiceRef(useRuntimeConfig().public.colibriAppviewUrl)
  const out = await runAuthed((rpc) =>
    ok(
      rpc.get('com.atproto.server.getServiceAuth', {
        params: { aud: aud as `did:${string}`, lxm: lxm as Nsid }
      })
    )
  )
  return out.token
}

async function callAppView<T>(
  nsid: string,
  opts: {
    method?: 'GET' | 'POST'
    params?: Record<string, string | number | boolean | undefined>
    body?: unknown
    auth?: boolean
  } = {}
): Promise<T> {
  const method = opts.method ?? 'GET'
  const config = useRuntimeConfig().public
  const url = new URL(
    `/xrpc/${nsid}`,
    appViewDialUrl(config.colibriAppviewUrl, config.colibriAppviewDialUrl)
  )
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }
  const headers: HeadersInit = {}
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  if (opts.auth !== false) {
    const token = await getServiceAuthToken(nsid)
    headers.authorization = `Bearer ${token}`
  }
  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    throw new ColibriXrpcError(data?.error ?? 'Unknown', data?.message, res.status)
  }
  return data as T
}

export async function communityCreate(input: {
  name: string
  description?: string
  requiresApprovalToJoin?: boolean
  pds?: string
  identifier?: string
  password?: string
}): Promise<{
  did: string
  community: string
  category: string
  channel: string
  ownerRole: string
  member: string
}> {
  return callAppView('social.colibri.community.create', { method: 'POST', body: input })
}

export async function channelCreate(input: {
  community: string
  category: string
  name: string
  type: string
  description?: string
  allowedRoles?: string[]
  allowedMembers?: string[]
}): Promise<{ uri: string }> {
  return callAppView('social.colibri.channel.create', { method: 'POST', body: input })
}
