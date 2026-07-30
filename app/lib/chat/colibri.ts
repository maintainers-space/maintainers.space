// Typed client for the parts of the `social.colibri.*` XRPC surface the Chat
// tab needs. Colibri's lexicons aren't registered in @atcute's ambient type
// registry (they're a separate project), so calls here are hand-typed against
// the exact lexicon JSON in https://github.com/colibri-social/appview/tree/main/lexicons
// rather than going through `Client<TQueries, TProcedures>`. Message records
// themselves are a plain `com.atproto.repo.createRecord` write to the user's
// own PDS — see useChatMessages.ts, which reuses `useAuth().runAuthed()` the
// same way useForgeAccounts.ts / useRepoStar.ts already do for maintainers.space's
// own record types.
import { ok } from '@atcute/client'
import type {} from '@atcute/atproto'
import type { Nsid } from '@atcute/lexicons'
import { APPVIEW_SERVICE_ID, APPVIEW_URL } from './config'

export interface ActorView {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

export interface CategoryView {
  uri: string
  name: string
  channelOrder: string[]
}

export interface ChannelView {
  uri: string
  name: string
  type: string
  category: string
  description?: string
  ownerOnly?: boolean
  allowedRoles?: string[]
  allowedMembers?: string[]
}

export interface RoleView {
  uri: string
  name: string
  color?: string
  permissions: string[]
  position: number
  hoisted?: boolean
  mentionable?: boolean
  protected?: boolean
}

export interface MemberView {
  did: string
  handle: string
  roles: string[]
  nickname?: string
  data: ActorView
}

export interface CommunityInfo {
  uri: string
  name: string
  description: string
  categoryOrder: string[]
  requiresApprovalToJoin: boolean
  appview: string
}

export interface CommunityData {
  did: string
  community: CommunityInfo
  categories: CategoryView[]
  channels: ChannelView[]
  roles: RoleView[]
  members: MemberView[]
}

export interface FacetByteSlice {
  byteStart: number
  byteEnd: number
}

export interface Facet {
  index: FacetByteSlice
  features: Array<Record<string, unknown> & { $type?: string }>
}

export interface MessageAttachment {
  blob: unknown
  name?: string
}

export interface ReactionView {
  emoji: string
  count: number
  reactorDIDs: string[]
}

export interface MessageView {
  uri: string
  text: string
  facets: Facet[]
  channel: string
  community: string
  author: ActorView
  parent?: MessageView
  attachments: MessageAttachment[]
  reactions: ReactionView[]
  createdAt: string
  edited: boolean
}

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
 * Short-lived service-auth JWT scoped to one procedure/query on the AppView,
 * minted via the human user's own atproto OAuth session — the same "dev mode"
 * shortcut Colibri's own client takes (calls the AppView directly instead of
 * proxying through the PDS). Must be re-minted per call; these tokens are
 * intentionally short-lived.
 */
async function getServiceAuthToken(lxm: string): Promise<string> {
  const { runAuthed } = useAuth()
  const out = await runAuthed((rpc) =>
    ok(
      rpc.get('com.atproto.server.getServiceAuth', {
        params: { aud: APPVIEW_SERVICE_ID as `did:${string}`, lxm: lxm as Nsid }
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
  const url = new URL(`/xrpc/${nsid}`, APPVIEW_URL)
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

export async function communityGetData(community: string): Promise<CommunityData> {
  return callAppView('social.colibri.community.getData', { params: { community } })
}

export async function channelGetChannelView(
  channel: string,
  opts: { limit?: number } = {}
): Promise<{ messages: MessageView[]; cursor?: string }> {
  return callAppView('social.colibri.channel.getChannelView', {
    params: { channel, limit: opts.limit }
  })
}

export type SubscribeEvent =
  | { type: 'ack' }
  | {
      type: 'message_event'
      data: { event: 'upsert' | 'delete'; uri: string; channel: string } & Partial<MessageView>
    }
  | {
      type: 'channel_event'
      data: { event: 'upsert' | 'delete'; uri: string; community: string } & Partial<ChannelView>
    }
  | {
      type: 'community_event'
      data: { event: 'upsert' | 'delete'; uri: string } & Partial<CommunityInfo>
    }
  | { type: 'typing_event'; data: { event: 'start' | 'stop'; channel: string; did: string } }
  | { type: string; data?: unknown }

/**
 * Opens the AppView's live event stream. Browsers can't set a WebSocket
 * handshake Authorization header, so the freshly-minted service-auth token is
 * passed as a query parameter instead.
 */
export async function subscribeEvents(onEvent: (evt: SubscribeEvent) => void): Promise<() => void> {
  const token = await getServiceAuthToken('social.colibri.sync.subscribeEvents')
  const wsUrl = new URL('/xrpc/social.colibri.sync.subscribeEvents', APPVIEW_URL)
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  wsUrl.searchParams.set('access_token', token)

  const ws = new WebSocket(wsUrl)
  ws.addEventListener('message', (ev) => {
    try {
      const parsed = JSON.parse(ev.data as string) as SubscribeEvent
      onEvent(parsed)
    } catch {
      /* ignore malformed frames */
    }
  })

  return () => ws.close()
}
