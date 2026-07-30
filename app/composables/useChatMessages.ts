import { ok } from '@atcute/client'
import type {} from '@atcute/atproto'
import type { Did, Nsid } from '@atcute/lexicons'
import {
  channelGetChannelView,
  subscribeEvents,
  type MessageView,
  type SubscribeEvent
} from '~/lib/chat/colibri'

const MESSAGE_COLLECTION = 'social.colibri.message'

/**
 * Messages for one channel: initial load via getChannelView, then live via the
 * AppView's subscribeEvents WebSocket, with an optimistic local echo on send
 * so a just-sent message shows immediately rather than waiting on Jetstream/Tap
 * lag (see the "Realtime / read path" section of the chat feature plan — this
 * is the simpler of the two options discussed there, since local testing is the
 * immediate goal; AppView-side write-through indexing is a fallback if lag
 * turns out to matter in practice).
 */
export function useChatMessages(channelUri: Ref<string | null>) {
  const { did, runAuthed } = useAuth()

  const messages = ref<MessageView[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)
  const sending = ref(false)

  let unsubscribe: (() => void) | null = null

  function upsert(msg: MessageView): void {
    const idx = messages.value.findIndex((m) => m.uri === msg.uri)
    if (idx === -1) messages.value = [...messages.value, msg]
    else messages.value = [...messages.value.slice(0, idx), msg, ...messages.value.slice(idx + 1)]
  }

  function remove(uri: string): void {
    messages.value = messages.value.filter((m) => m.uri !== uri)
  }

  function onEvent(evt: SubscribeEvent): void {
    if (evt.type !== 'message_event') return
    const data = evt.data as {
      event: 'upsert' | 'delete'
      uri: string
      channel: string
    } & Partial<MessageView>
    if (data.channel !== channelUri.value) return
    if (data.event === 'delete') {
      remove(data.uri)
      return
    }
    if (data.text !== undefined && data.author) upsert(data as MessageView)
  }

  async function load(): Promise<void> {
    const channel = channelUri.value
    messages.value = []
    error.value = null
    if (!channel) return
    pending.value = true
    try {
      const res = await channelGetChannelView(channel, { limit: 50 })
      messages.value = res.messages.toReversed()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not load messages.'
    } finally {
      pending.value = false
    }
  }

  async function send(text: string): Promise<void> {
    const channel = channelUri.value
    const trimmed = text.trim()
    if (!channel || !trimmed || !did.value || sending.value) return
    sending.value = true

    // Optimistic local echo — replaced once the real record round-trips back
    // over the WebSocket (matched and de-duped by AT-URI in upsert()).
    const tempUri = `temp:${crypto.randomUUID()}`
    const optimistic: MessageView = {
      uri: tempUri,
      text: trimmed,
      facets: [],
      channel,
      community: '',
      author: { did: did.value, handle: did.value },
      attachments: [],
      reactions: [],
      createdAt: new Date().toISOString(),
      edited: false
    }
    upsert(optimistic)

    try {
      const record = {
        $type: MESSAGE_COLLECTION,
        text: trimmed,
        channel,
        createdAt: new Date().toISOString()
      }
      const res = await runAuthed((rpc) =>
        ok(
          rpc.post('com.atproto.repo.createRecord', {
            input: {
              repo: did.value as Did,
              collection: MESSAGE_COLLECTION as Nsid,
              record: record as unknown as Record<string, unknown>
            }
          })
        )
      )
      remove(tempUri)
      upsert({ ...optimistic, uri: res.uri })
    } catch (e) {
      remove(tempUri)
      error.value = e instanceof Error ? e.message : 'Could not send message.'
      throw e
    } finally {
      sending.value = false
    }
  }

  watch(
    channelUri,
    async () => {
      await load()
    },
    { immediate: true }
  )

  onMounted(async () => {
    unsubscribe = await subscribeEvents(onEvent)
  })
  onUnmounted(() => {
    unsubscribe?.()
  })

  return { messages, pending, error, sending, send, refresh: load }
}
