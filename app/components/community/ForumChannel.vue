<script setup lang="ts">
// A forum channel, such as #support or #showcase: a list of threads, each a question or post with
// its replies. Colibri has no threads of its own yet, so a thread is a top-level message whose
// first line is its title, and replies point at it. See forumThreads().
import type { ChannelView, MessageView } from '~/lib/community/colibri'
import { displayName, forumThreads } from '~/lib/community/messages'
import { rkeyOf } from '~/lib/community/records'

const props = defineProps<{ channel: ChannelView }>()

const chat = useCommunityChat()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const state = computed(() => chat.state(props.channel.uri))
const threads = computed(() => forumThreads(state.value.messages))
const openKey = computed(() => (typeof route.query.thread === 'string' ? route.query.thread : null))
const open = computed(() => threads.value.find((t) => rkeyOf(t.starter.uri) === openKey.value))

const composing = ref(false)
const title = ref('')
const body = ref('')
const posting = ref(false)
const search = ref('')
const reply = ref<MessageView | null>(null)

const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q
    ? threads.value.filter((t) => `${t.title}\n${t.body}`.toLowerCase().includes(q))
    : threads.value
})

function show(starter: MessageView | null): void {
  void router.replace({
    query: { ...route.query, thread: starter ? rkeyOf(starter.uri) : undefined }
  })
}

async function post(): Promise<void> {
  if (!title.value.trim()) return
  posting.value = true
  try {
    const text = body.value.trim()
      ? `${title.value.trim()}\n${body.value.trim()}`
      : title.value.trim()
    await chat.send(props.channel.uri, text)
    title.value = ''
    body.value = ''
    composing.value = false
  } catch (e) {
    toast.add({
      color: 'error',
      description: e instanceof Error ? e.message : undefined,
      title: 'Could not post the thread'
    })
  } finally {
    posting.value = false
  }
}

const canPost = computed(() => chat.canPost(props.channel))
</script>

<template>
  <div v-if="open" class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center gap-2 border-b border-default px-4 py-2">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="All threads"
        @click="show(null)"
      />
      <h3 class="min-w-0 flex-1 truncate font-semibold text-highlighted">{{ open.title }}</h3>
      <span class="shrink-0 text-xs text-muted"
        >{{ open.replies.length }} {{ open.replies.length === 1 ? 'reply' : 'replies' }}</span
      >
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto pb-4">
      <CommunityMessage :message="open.starter" :can-reply="false" />
      <div class="mx-4 mt-4 mb-1 flex items-center gap-3 text-xs font-medium text-muted">
        <span>{{ open.replies.length ? 'Replies' : 'No replies yet' }}</span>
        <div class="h-px flex-1 bg-(--ui-border)" />
      </div>
      <CommunityMessage
        v-for="message in open.replies"
        :key="message.uri"
        :message="message"
        :show-parent="false"
        :can-reply="false"
      />
    </div>
    <CommunityComposer
      v-model:reply="reply"
      :channel="channel"
      :thread="open.starter"
      placeholder="Reply to this thread"
    />
  </div>

  <div v-else class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl space-y-4 px-4 py-5">
      <div class="flex flex-wrap items-center gap-2">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search threads"
          class="min-w-0 flex-1"
        />
        <UButton
          v-if="canPost"
          icon="i-lucide-plus"
          label="New thread"
          @click="composing = !composing"
        />
      </div>

      <form
        v-if="composing"
        class="space-y-2 rounded-lg border border-default p-3"
        @submit.prevent="post"
      >
        <UInput v-model="title" placeholder="Title" class="w-full" :maxlength="200" autofocus />
        <UTextarea
          v-model="body"
          placeholder="Details, steps, links… Markdown works."
          autoresize
          :rows="3"
          :maxrows="14"
          class="w-full"
        />
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="composing = false" />
          <UButton type="submit" label="Post" :loading="posting" :disabled="!title.trim()" />
        </div>
      </form>

      <CommunityComposer v-if="!canPost" :channel="channel" class="px-0" />

      <div v-if="!state.loaded" class="space-y-2">
        <USkeleton v-for="i in 5" :key="i" class="h-16 w-full" />
      </div>
      <div
        v-else-if="!shown.length"
        class="rounded-lg border border-dashed border-default px-4 py-12 text-center text-sm text-muted"
      >
        <UIcon name="i-lucide-messages-square" class="mx-auto mb-2 size-7" />
        {{ search ? 'No thread matches that.' : channel.description || 'No threads yet.' }}
      </div>
      <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default">
        <li v-for="thread in shown" :key="thread.starter.uri">
          <button
            type="button"
            class="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-elevated/40"
            @click="show(thread.starter)"
          >
            <CommunityActorAvatar
              :actor="chat.actor(thread.starter.author.did) ?? thread.starter.author"
              size="sm"
              class="mt-0.5"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">{{ thread.title }}</p>
              <p v-if="thread.body" class="line-clamp-1 text-sm text-muted">{{ thread.body }}</p>
              <p class="mt-1 text-xs text-dimmed">
                {{ displayName(chat.actor(thread.starter.author.did) ?? thread.starter.author) }} ·
                {{ formatRelativeTime(thread.lastActivity) }}
              </p>
            </div>
            <span class="flex shrink-0 items-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-message-circle" class="size-3.5" />{{ thread.replies.length }}
            </span>
          </button>
        </li>
      </ul>
      <div v-if="state.loaded && !state.complete" class="flex justify-center">
        <UButton
          color="neutral"
          variant="outline"
          label="Load older threads"
          :loading="state.loading"
          @click="chat.loadOlder(channel.uri)"
        />
      </div>
    </div>
  </div>
</template>
