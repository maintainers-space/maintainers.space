import type { InjectionKey } from 'vue'
import {
  communityGetData,
  communityLeave,
  listMessages,
  serviceAuthToken,
  type ActorView,
  type ChannelView,
  type CommunityData,
  type MemberView,
  type MessageView
} from '~/lib/community/colibri'
import {
  applyMessageEvent,
  applyReaction,
  applyReactionEvent,
  mergeMessages
} from '~/lib/community/messages'
import {
  addReaction,
  deleteMemberships,
  deleteMessage,
  editMessage,
  hasMembershipRecord,
  joinCommunity,
  removeReaction,
  sendMessage,
  uploadBlob,
  type MessageRecord
} from '~/lib/community/records'
import { parseMarkdown } from '~/lib/community/richtext/markdown'
import {
  openCommunitySocket,
  subscribeUrl,
  SUBSCRIBE,
  type CommunityEvent,
  type CommunitySocket,
  type SocketStatus
} from '~/lib/community/socket'

const PAGE = 50
const POLL_MS = 15_000
const TYPING_MS = 6_000

interface ChannelState {
  messages: MessageView[]
  cursor?: string
  loaded: boolean
  loading: boolean
  /** No older messages are left to load. */
  complete: boolean
  error?: string
}

export type Membership = 'loading' | 'guest' | 'none' | 'pending' | 'member'

/**
 * Everything one open Community needs: its layout, members, the messages of the channels opened so
 * far, and the viewer's actions. Reads are public, so it works signed out too; live updates come
 * from the AppView's event stream for members and from polling for everyone else.
 */
export function createCommunityChat(initial: CommunityData, uri: string) {
  const { did, isAuthenticated } = useAuth()
  const { hasAccess } = useCommunityAccess()
  const config = useRuntimeConfig().public

  const data = shallowRef<CommunityData>(initial)
  const channels = reactive(new Map<string, ChannelState>())
  const typing = reactive(new Map<string, Map<string, number>>())
  const membership = ref<Membership>('loading')
  const socketStatus = ref<SocketStatus>('idle')
  const active = ref<string | null>(null)

  const members = computed(() => new Map(data.value.members.map((m) => [m.did, m])))
  const ownerRoles = computed(
    () => new Set(data.value.roles.filter((r) => r.protected).map((r) => r.uri))
  )
  const me = computed(() => (did.value ? members.value.get(did.value) : undefined))
  const isOwner = computed(() => !!me.value?.roles?.some((r) => ownerRoles.value.has(r)))

  function actor(id: string): ActorView | undefined {
    return members.value.get(id)
  }

  /** Whether the viewer may post in `channel`, as Colibri's own client decides it. */
  function canPost(channel: ChannelView | undefined): boolean {
    if (!channel || membership.value !== 'member' || !hasAccess.value) return false
    if (isOwner.value) return true
    const restricted =
      channel.ownerOnly || !!channel.allowedRoles?.length || !!channel.allowedMembers?.length
    if (!restricted) return true
    if (channel.allowedMembers?.includes(did.value ?? '')) return true
    return !!me.value?.roles?.some((r) => channel.allowedRoles?.includes(r))
  }

  function state(channel: string): ChannelState {
    let s = channels.get(channel)
    if (!s) {
      s = { complete: false, loaded: false, loading: false, messages: [] }
      channels.set(channel, s)
    }
    return s
  }

  async function loadLatest(channel: string): Promise<void> {
    const s = state(channel)
    if (s.loading) return
    s.loading = true
    try {
      const page = await listMessages(channel, { limit: PAGE })
      s.messages = mergeMessages(s.messages, page.messages)
      if (!s.loaded) {
        s.cursor = page.cursor
        s.complete = !page.cursor || page.messages.length < PAGE
      }
      s.loaded = true
      s.error = undefined
    } catch (e) {
      s.error = e instanceof Error ? e.message : 'Could not load messages.'
    } finally {
      s.loading = false
    }
  }

  async function loadOlder(channel: string): Promise<void> {
    const s = state(channel)
    if (s.loading || s.complete || !s.cursor) return
    s.loading = true
    try {
      const page = await listMessages(channel, { cursor: s.cursor, limit: PAGE })
      s.messages = mergeMessages(s.messages, page.messages)
      s.cursor = page.cursor
      s.complete = !page.cursor || page.messages.length < PAGE
    } catch (e) {
      s.error = e instanceof Error ? e.message : 'Could not load older messages.'
    } finally {
      s.loading = false
    }
  }

  function open(channel: string | null): void {
    active.value = channel
    if (channel && !state(channel).loaded) void loadLatest(channel)
  }

  async function refreshData(): Promise<void> {
    data.value = await communityGetData(uri)
  }

  // --- Membership --------------------------------------------------------------------------

  async function checkMembership(): Promise<void> {
    if (!isAuthenticated.value || !did.value) {
      membership.value = 'guest'
      return
    }
    if (members.value.has(did.value)) {
      membership.value = 'member'
      return
    }
    membership.value =
      hasAccess.value && (await hasMembershipRecord(uri).catch(() => false)) ? 'pending' : 'none'
  }

  async function join(): Promise<void> {
    await joinCommunity(uri)
    membership.value = 'pending'
    // An open community admits right away, once the AppView has seen the record.
    for (const wait of [1500, 3000, 6000]) {
      await new Promise((resolve) => setTimeout(resolve, wait))
      await refreshData()
      if (did.value && members.value.has(did.value)) {
        membership.value = 'member'
        return
      }
    }
  }

  async function leave(): Promise<void> {
    await communityLeave(uri).catch(() => undefined)
    await deleteMemberships(uri)
    membership.value = 'none'
    await refreshData()
  }

  // --- Writing -----------------------------------------------------------------------------

  function selfActor(): ActorView {
    const { profile } = useAuth()
    return (
      me.value ?? {
        data: { displayName: profile.value?.displayName },
        did: did.value ?? '',
        handle: profile.value?.handle
      }
    )
  }

  async function send(
    channel: string,
    source: string,
    options: { parent?: MessageView; files?: File[] } = {}
  ): Promise<void> {
    const { text, facets } = parseMarkdown(source.trim())
    const attachments = []
    for (const file of options.files ?? []) {
      attachments.push({ blob: await uploadBlob(file), name: file.name })
    }
    if (!text && !attachments.length) return
    const record: Omit<MessageRecord, 'createdAt'> = {
      channel,
      facets,
      text,
      ...(options.parent ? { parent: options.parent.uri } : {}),
      ...(attachments.length ? { attachments } : {})
    }
    const messageUri = await sendMessage(record)
    // Shown right away; the AppView's event for the same URI replaces it.
    const s = state(channel)
    s.messages = mergeMessages(s.messages, [
      {
        attachments,
        author: selfActor(),
        channel,
        createdAt: new Date().toISOString(),
        facets,
        parent: options.parent,
        reactions: [],
        text,
        uri: messageUri
      }
    ])
  }

  async function edit(message: MessageView, source: string): Promise<void> {
    const { text, facets } = parseMarkdown(source.trim())
    await editMessage(
      message.uri,
      {
        channel: message.channel,
        createdAt: message.createdAt,
        facets: message.facets ?? [],
        text: message.text,
        ...(message.parent ? { parent: message.parent.uri } : {}),
        ...(message.attachments?.length
          ? { attachments: message.attachments.map((a) => ({ blob: a.blob, name: a.name })) }
          : {})
      },
      text,
      facets
    )
    const s = state(message.channel)
    s.messages = s.messages.map((m) =>
      m.uri === message.uri ? { ...m, edited: true, facets, text } : m
    )
  }

  async function remove(message: MessageView): Promise<void> {
    await deleteMessage(message.uri)
    const s = state(message.channel)
    s.messages = s.messages.filter((m) => m.uri !== message.uri)
  }

  async function toggleReaction(message: MessageView, emoji: string): Promise<void> {
    const viewer = did.value
    if (!viewer) return
    const reacted = message.reactions?.find((r) => r.emoji === emoji)?.reactorDIDs?.includes(viewer)
    const s = state(message.channel)
    s.messages = applyReaction(s.messages, message.uri, emoji, viewer, !reacted)
    try {
      if (reacted) await removeReaction(message.uri, emoji)
      else await addReaction(message.uri, emoji)
    } catch (e) {
      s.messages = applyReaction(s.messages, message.uri, emoji, viewer, !!reacted)
      throw e
    }
  }

  // --- Live updates ------------------------------------------------------------------------

  let socket: CommunitySocket | null = null
  let lastTyping = 0

  function onEvent(event: CommunityEvent): void {
    switch (event.type) {
      case 'message_event': {
        const e = event.data as Parameters<typeof applyMessageEvent>[1]
        const s = channels.get(e.channel)
        if (s) s.messages = applyMessageEvent(s.messages, e, actor)
        typing.get(e.channel)?.delete(e.uri.split('/')[2] ?? '')
        break
      }
      case 'reaction_event': {
        const e = event.data as Parameters<typeof applyReactionEvent>[1]
        const s = channels.get(e.channel)
        if (s) s.messages = applyReactionEvent(s.messages, e)
        break
      }
      case 'typing_event': {
        const e = event.data as { event: string; channel: string; did: string }
        if (e.did === did.value) break
        const map = typing.get(e.channel) ?? new Map<string, number>()
        if (e.event === 'start') map.set(e.did, Date.now() + TYPING_MS)
        else map.delete(e.did)
        typing.set(e.channel, map)
        break
      }
      case 'member_event':
      case 'channel_event':
      case 'category_event':
      case 'role_event':
      case 'community_event':
        void refreshData().then(checkMembership)
        break
    }
  }

  function typingIn(channel: string): MemberView[] {
    const now = Date.now()
    return [...(typing.get(channel)?.entries() ?? [])]
      .filter(([, until]) => until > now)
      .map(([id]) => members.value.get(id) ?? { did: id })
  }

  /** Tells others the viewer is typing, at most every few seconds. */
  function notifyTyping(channel: string): void {
    if (Date.now() - lastTyping < 3000) return
    lastTyping = Date.now()
    socket?.send('typing', { channel })
  }

  function connect(): void {
    socket?.close()
    socket = null
    if (!hasAccess.value || membership.value !== 'member') return
    socket = openCommunitySocket({
      onEvent,
      onStatus: (status) => {
        socketStatus.value = status
        // Catch up on whatever was missed while disconnected.
        if (status === 'open' && active.value) void loadLatest(active.value)
      },
      token: () => serviceAuthToken(SUBSCRIBE),
      url: subscribeUrl(config.colibriAppviewDialUrl || config.colibriAppviewUrl)
    })
  }

  watch(active, (channel) => {
    if (channel) socket?.send('view', { channel })
  })

  // Polling for everyone the event stream doesn't serve.
  const poll = useIntervalFn(
    () => {
      if (socketStatus.value === 'open' || document.visibilityState !== 'visible') return
      if (active.value) void loadLatest(active.value)
    },
    POLL_MS,
    { immediate: false }
  )

  const ticker = useIntervalFn(() => {
    for (const [channel, map] of typing) {
      for (const [id, until] of map) if (until < Date.now()) map.delete(id)
      if (!map.size) typing.delete(channel)
    }
  }, 2000)

  watch([membership, hasAccess], connect)
  watch([isAuthenticated, hasAccess, () => data.value.members], () => void checkMembership(), {
    immediate: true
  })
  poll.resume()

  function dispose(): void {
    socket?.close()
    socket = null
    poll.pause()
    ticker.pause()
  }

  return {
    active,
    actor,
    canPost,
    channels,
    data,
    dispose,
    edit,
    isOwner,
    join,
    leave,
    loadLatest,
    loadOlder,
    me,
    members,
    membership,
    notifyTyping,
    open,
    refreshData,
    remove,
    send,
    socketStatus,
    state,
    toggleReaction,
    typingIn
  }
}

export type CommunityChat = ReturnType<typeof createCommunityChat>

export const COMMUNITY_CHAT: InjectionKey<CommunityChat> = Symbol('community-chat')

export function useCommunityChat(): CommunityChat {
  const chat = inject(COMMUNITY_CHAT)
  if (!chat) throw new Error('useCommunityChat() needs a <CommunityShell> around it.')
  return chat
}
