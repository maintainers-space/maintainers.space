<script setup lang="ts">
// A text channel: its messages, newest at the bottom, and the composer. Stays pinned to the
// bottom while you are there, and loads older messages as you scroll up.
import { channelIcon, type ChannelView, type MessageView } from '~/lib/community/colibri'
import { groupMessages } from '~/lib/community/messages'

const props = defineProps<{ channel: ChannelView }>()

const chat = useCommunityChat()
const state = computed(() => chat.state(props.channel.uri))
const rows = computed(() => groupMessages(state.value.messages))
const reply = ref<MessageView | null>(null)

const scroller = useTemplateRef<HTMLElement>('scroller')
const top = useTemplateRef<HTMLElement>('top')
const atBottom = ref(true)

function onScroll(): void {
  const el = scroller.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

function scrollToBottom(): void {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

// New messages keep you at the bottom if you were there; older ones keep your place.
watch(
  () => state.value.messages,
  async (next, previous) => {
    const el = scroller.value
    if (!el) return
    const prependedOlder =
      !!previous?.length &&
      next[0]?.uri !== previous[0]?.uri &&
      next.at(-1)?.uri === previous.at(-1)?.uri
    const fromBottom = el.scrollHeight - el.scrollTop
    await nextTick()
    if (prependedOlder) el.scrollTop = el.scrollHeight - fromBottom
    else if (atBottom.value) scrollToBottom()
  },
  { flush: 'pre' }
)

watch(
  () => props.channel.uri,
  () => {
    reply.value = null
    atBottom.value = true
    nextTick(scrollToBottom)
  }
)

useIntersectionObserver(top, ([entry]) => {
  if (entry?.isIntersecting && state.value.loaded) void chat.loadOlder(props.channel.uri)
})

function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00`)
  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric'
  })
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto" @scroll.passive="onScroll">
      <div class="flex min-h-full flex-col justify-end pb-2">
        <div ref="top" class="h-px" />
        <div v-if="state.loading && state.loaded" class="flex justify-center py-3">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" />
        </div>

        <div
          v-if="state.complete || (state.loaded && !state.messages.length)"
          class="px-4 pt-6 pb-2"
        >
          <div class="flex size-12 items-center justify-center rounded-full bg-elevated">
            <UIcon :name="channelIcon(channel)" class="size-6 text-muted" />
          </div>
          <h3 class="mt-3 text-xl font-semibold text-highlighted">
            Welcome to #{{ channel.name }}
          </h3>
          <p class="mt-1 text-sm text-muted">
            {{ channel.description || `This is the start of #${channel.name}.` }}
          </p>
        </div>

        <div v-if="!state.loaded && !state.error" class="space-y-4 px-4 py-4">
          <div v-for="i in 6" :key="i" class="flex gap-3">
            <USkeleton class="size-9 shrink-0 rounded-full" />
            <div class="flex-1 space-y-2">
              <USkeleton class="h-3.5 w-32" />
              <USkeleton class="h-3.5" :class="i % 2 ? 'w-3/4' : 'w-1/2'" />
            </div>
          </div>
        </div>

        <UAlert
          v-if="state.error"
          class="mx-4 my-2"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Could not load messages"
          :description="state.error"
        >
          <template #actions>
            <UButton
              color="error"
              variant="soft"
              label="Retry"
              @click="chat.loadLatest(channel.uri)"
            />
          </template>
        </UAlert>

        <template v-for="row in rows" :key="row.message.uri">
          <div v-if="row.day" class="relative mx-4 mt-5 mb-1 flex items-center" role="separator">
            <div class="h-px flex-1 bg-(--ui-border)" />
            <span class="px-3 text-xs font-medium text-muted">{{ dayLabel(row.day) }}</span>
            <div class="h-px flex-1 bg-(--ui-border)" />
          </div>
          <CommunityMessage :message="row.message" :head="row.head" @reply="reply = $event" />
        </template>
      </div>
    </div>

    <div class="relative">
      <UButton
        v-if="!atBottom"
        class="absolute -top-10 left-1/2 -translate-x-1/2 shadow"
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide-arrow-down"
        label="Jump to latest"
        @click="scrollToBottom"
      />
      <CommunityComposer v-model:reply="reply" :channel="channel" />
    </div>
  </div>
</template>
