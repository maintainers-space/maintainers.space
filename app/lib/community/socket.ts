// The AppView's live event stream, `social.colibri.sync.subscribeEvents`. It only carries events
// of communities the viewer belongs to, so everyone else falls back to polling.
//
// Browsers can't set headers on a WebSocket, so the service-auth token travels in the subprotocol
// list after a `colibri.auth.bearer` marker, as Colibri's own client does it. Tokens are short
// lived, so every (re)connect mints a new one.
import type { ColibriRichTextFacet } from './richtext/facets'
import type { AttachmentView, MemberView } from './colibri'

export interface MessageEventData {
  event: 'upsert' | 'delete'
  uri: string
  channel: string
  text?: string
  facets?: ColibriRichTextFacet[]
  createdAt?: string
  edited?: boolean
  parent?: string
  attachments?: AttachmentView[]
}

export interface ReactionEventData {
  event: 'added' | 'removed'
  uri: string
  emoji: string
  /** The message reacted to. */
  target: string
  channel: string
}

export interface TypingEventData {
  event: 'start' | 'stop'
  channel: string
  did: string
}

export interface MemberEventData {
  event: 'join' | 'leave' | 'roles_updated'
  community: string
  member?: MemberView
  memberDid?: string
}

export type CommunityEvent =
  | { type: 'message_event'; data: MessageEventData }
  | { type: 'reaction_event'; data: ReactionEventData }
  | { type: 'typing_event'; data: TypingEventData }
  | { type: 'member_event'; data: MemberEventData }
  | { type: 'channel_event' | 'category_event' | 'role_event' | 'community_event'; data: unknown }
  | { type: string; data?: unknown }

const SUBSCRIBE = 'social.colibri.sync.subscribeEvents'
const HEARTBEAT_MS = 25_000

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed'

export interface CommunitySocket {
  send: (type: string, data: unknown) => void
  close: () => void
}

/** Connects and keeps reconnecting with backoff until `close()`. */
export function openCommunitySocket(options: {
  url: string
  token: () => Promise<string>
  onEvent: (event: CommunityEvent) => void
  onStatus?: (status: SocketStatus) => void
}): CommunitySocket {
  let socket: WebSocket | null = null
  let closed = false
  let attempt = 0
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined

  const schedule = () => {
    if (closed) return
    const delay = Math.min(30_000, 1000 * 2 ** attempt++) * (0.75 + Math.random() / 2)
    retry = setTimeout(connect, delay)
  }

  async function connect(): Promise<void> {
    if (closed) return
    options.onStatus?.('connecting')
    let token: string
    try {
      token = await options.token()
    } catch {
      options.onStatus?.('closed')
      schedule()
      return
    }
    if (closed) return
    const ws = new WebSocket(options.url, ['colibri.auth.bearer', token])
    socket = ws
    ws.addEventListener('open', () => {
      attempt = 0
      options.onStatus?.('open')
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ data: null, type: 'heartbeat' }))
      }, HEARTBEAT_MS)
    })
    ws.addEventListener('message', (e) => {
      try {
        options.onEvent(JSON.parse(String(e.data)) as CommunityEvent)
      } catch {
        /* a malformed frame is skipped */
      }
    })
    ws.addEventListener('close', () => {
      clearInterval(heartbeat)
      if (socket !== ws) return
      socket = null
      options.onStatus?.('closed')
      schedule()
    })
  }

  const wake = () => {
    if (document.visibilityState !== 'visible' || closed) return
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      clearTimeout(retry)
      attempt = 0
      void connect()
    }
  }
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', wake)
  void connect()

  return {
    close() {
      closed = true
      clearTimeout(retry)
      clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      socket?.close()
      socket = null
      options.onStatus?.('idle')
    },
    send(type, data) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ data, type }))
    }
  }
}

export function subscribeUrl(dialUrl: string): string {
  const url = new URL(`/xrpc/${SUBSCRIBE}`, dialUrl)
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
  return url.toString()
}

export { SUBSCRIBE }
