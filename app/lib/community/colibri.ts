// Typed calls to the Colibri AppView that maintainers.space makes itself: creating a community and
// laying out its channels, categories and roles. Chatting itself belongs to the embedded client
// (app/components/community/ColibriEmbed.vue), which brings its own XRPC layer.
//
// Colibri's lexicons aren't in @atcute's type registry, so these are typed by hand against
// https://github.com/colibri-social/appview/tree/main/lexicons. Its procedures take their
// arguments as query parameters, with arrays as repeated keys, rather than as a JSON body.
import { ok } from '@atcute/client'
import type {} from '@atcute/atproto'
import type { Nsid } from '@atcute/lexicons'
import type { ColibriRichTextFacet } from './richtext/facets'

export const CHANNEL_TYPE = {
  forum: 'social.colibri.channel.forum',
  text: 'social.colibri.channel.text',
  voice: 'social.colibri.channel.voice'
} as const

export type ChannelType = (typeof CHANNEL_TYPE)[keyof typeof CHANNEL_TYPE]

export interface CommunityInfo {
  uri: string
  name: string
  description?: string
  categoryOrder?: string[]
  requiresApprovalToJoin?: boolean
}

export interface CategoryView {
  uri: string
  name: string
  channelOrder?: string[]
}

export interface ChannelView {
  uri: string
  name: string
  type: string
  /** The category's AT-URI. */
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
  permissions?: string[]
  position?: number
  hoisted?: boolean
  protected?: boolean
}

/** A blob reference as the AppView returns it. */
export interface BlobRef {
  $type?: 'blob'
  mimeType?: string
  ref?: { $link: string }
  cid?: string
  size?: number
}

export interface ActorData {
  displayName?: string
  avatar?: BlobRef
  description?: string
  isBot?: boolean
  onlineState?: 'online' | 'away' | 'dnd' | 'offline'
  status?: { text?: string; emoji?: string }
}

export interface ActorView {
  did: string
  handle?: string
  data?: ActorData
}

export interface MemberView extends ActorView {
  roles?: string[]
  nickname?: string
}

export interface AttachmentView {
  blob: BlobRef
  name?: string
  width?: number
  height?: number
}

export interface ReactionView {
  emoji: string
  count: number
  reactorDIDs?: string[]
}

export interface MessageView {
  uri: string
  text: string
  facets?: ColibriRichTextFacet[]
  channel: string
  community?: string
  author: ActorView
  parent?: MessageView
  attachments?: AttachmentView[]
  reactions?: ReactionView[]
  createdAt: string
  edited?: boolean
}

export interface CommunityData {
  did: string
  community: CommunityInfo
  categories: CategoryView[]
  channels: ChannelView[]
  roles: RoleView[]
  members: MemberView[]
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

type Params = Record<string, string | number | boolean | string[] | undefined>

/**
 * A short-lived service-auth token for one procedure on the AppView, minted through the viewer's
 * own atproto session. Its `aud` must match the one Colibri's permission sets were granted for,
 * so it always derives from the canonical AppView URL, never the dial URL.
 */
export async function serviceAuthToken(lxm: string): Promise<string> {
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

export async function call<T>(
  nsid: string,
  params: Params,
  options: { method?: 'GET' | 'POST'; auth?: boolean } = {}
): Promise<T> {
  const config = useRuntimeConfig().public
  const url = new URL(
    `/xrpc/${nsid}`,
    appViewDialUrl(config.colibriAppviewUrl, config.colibriAppviewDialUrl)
  )
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, item)
    else url.searchParams.set(key, String(value))
  }
  const headers: Record<string, string> = {}
  if (options.auth !== false) headers.authorization = `Bearer ${await serviceAuthToken(nsid)}`
  const res = await fetch(url, { headers, method: options.method ?? 'GET' })
  const text = await res.text()
  let data: Record<string, unknown> | undefined
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : undefined
  } catch {
    data = undefined
  }
  if (!res.ok) {
    throw new ColibriXrpcError(
      typeof data?.error === 'string' ? data.error : 'Unknown',
      typeof data?.message === 'string' ? data.message : undefined,
      res.status
    )
  }
  return data as T
}

/**
 * Creates a community. Without `pds`, `identifier` and `password` the AppView mints the
 * community's account on its own PDS, so nobody has to host anything.
 */
export function communityCreate(input: {
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
  return call('social.colibri.community.create', input, { method: 'POST' })
}

/** Everything about a community: its categories, channels, roles and members. Public. */
export function communityGetData(community: string): Promise<CommunityData> {
  return call('social.colibri.community.getData', { community }, { auth: false })
}

export function categoryCreate(input: {
  community: string
  name: string
}): Promise<{ uri: string }> {
  return call('social.colibri.category.create', input, { method: 'POST' })
}

export function categoryUpdate(input: {
  category: string
  name: string
}): Promise<{ uri: string }> {
  return call('social.colibri.category.update', input, { method: 'POST' })
}

export function channelCreate(input: {
  community: string
  category: string
  name: string
  type: ChannelType
  description?: string
  allowedRoles?: string[]
  allowedMembers?: string[]
}): Promise<{ uri: string }> {
  return call('social.colibri.channel.create', input, { method: 'POST' })
}

export function channelUpdate(input: {
  channel: string
  category?: string
  name?: string
  description?: string
  ownerOnly?: boolean
  allowedRoles?: string[]
}): Promise<{ uri: string }> {
  return call('social.colibri.channel.update', input, { method: 'POST' })
}

export function roleCreate(input: {
  community: string
  name: string
  color?: string
  permissions?: string[]
  position?: number
  hoisted?: boolean
  mentionable?: boolean
}): Promise<{ uri: string }> {
  return call('social.colibri.role.create', input, { method: 'POST' })
}

/** A page of a channel's messages, newest first. Public. */
export function listMessages(
  channel: string,
  options: { cursor?: string; limit?: number } = {}
): Promise<{ messages: MessageView[]; cursor?: string }> {
  return call(
    'social.colibri.channel.listMessages',
    { channel, cursor: options.cursor, limit: options.limit ?? 50 },
    { auth: false }
  )
}

/** Leaves a community. */
export function communityLeave(community: string): Promise<unknown> {
  return call('social.colibri.community.leave', { community }, { method: 'POST' })
}

/** Where the AppView serves a blob, such as an avatar or an attachment. */
export function blobUrl(
  did: string,
  blob: BlobRef | undefined,
  variant?: 'small' | 'base' | 'large'
): string | undefined {
  const cid = blob?.ref?.$link ?? blob?.cid
  if (!cid) return undefined
  const config = useRuntimeConfig().public
  const base = appViewDialUrl(config.colibriAppviewUrl, config.colibriAppviewDialUrl)
  const url = new URL('/xrpc/com.atproto.sync.getBlob', base)
  url.searchParams.set('did', did)
  url.searchParams.set('cid', cid)
  if (variant) url.searchParams.set('variant', variant)
  return url.toString()
}

/** The icon for a channel, the same in the channel list and the header. */
export function channelIcon(channel: Pick<ChannelView, 'type' | 'ownerOnly'>): string {
  if (channel.ownerOnly) return 'i-lucide-megaphone'
  if (channel.type === CHANNEL_TYPE.forum) return 'i-lucide-messages-square'
  if (channel.type === CHANNEL_TYPE.voice) return 'i-lucide-volume-2'
  return 'i-lucide-hash'
}
