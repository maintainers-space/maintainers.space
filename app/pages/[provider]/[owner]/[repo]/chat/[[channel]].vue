<script setup lang="ts">
import { useRepoContext } from '~/composables/useRepoContext'
import type { ChatOwnerRef } from '~/composables/useChatCommunity'

const route = useRoute()
const router = useRouter()
const { provider, owner, name } = useRepoContext()
const { isAuthenticated } = useAuth()

const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)

const ownerRef = computed<ChatOwnerRef>(() => ({ provider: provider.value, owner: owner.value }))
const { community, pending, enabling, error, canEnable, enableChat } = useChatCommunity(ownerRef)

const routeChannel = computed(() => {
  const raw = route.params.channel
  const seg = Array.isArray(raw) ? raw[0] : raw
  return seg ? decodeURIComponent(seg) : null
})

const activeChannelUri = computed(() => {
  if (routeChannel.value) return routeChannel.value
  return community.value?.channels[0]?.uri ?? null
})

function selectChannel(uri: string): void {
  router.push(`${base.value}/chat/${encodeURIComponent(uri)}`)
}

const activeChannel = computed(
  () => community.value?.channels.find((c) => c.uri === activeChannelUri.value) ?? null
)

const {
  messages,
  pending: messagesPending,
  error: messagesError,
  sending,
  send
} = useChatMessages(activeChannelUri)

const draft = ref('')
const listEl = ref<HTMLElement | null>(null)

async function submit(): Promise<void> {
  const text = draft.value
  draft.value = ''
  try {
    await send(text)
  } catch {
    draft.value = text
  }
}

watch(
  messages,
  async () => {
    await nextTick()
    listEl.value?.scrollTo({ top: listEl.value.scrollHeight })
  },
  { deep: false }
)

function showAuthorFor(index: number): boolean {
  if (index === 0) return true
  const prev = messages.value[index - 1]
  const cur = messages.value[index]
  if (!prev || !cur) return true
  return prev.author.did !== cur.author.did
}
</script>

<template>
  <div
    class="-mx-1 flex h-[calc(100vh-13rem)] min-h-[28rem] overflow-hidden rounded-lg border border-default"
  >
    <div v-if="pending" class="flex w-full items-center justify-center">
      <USkeleton class="h-8 w-40" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load chat"
      :description="error"
      class="m-4 w-full"
    />

    <div
      v-else-if="!community"
      class="flex w-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <UIcon name="i-lucide-message-circle" class="size-9 text-muted" />
      <p class="text-sm font-medium text-default">No chat yet for {{ owner }}</p>
      <p class="max-w-sm text-sm text-muted">
        Every repo under an owner shares one chat, with
        <code class="text-xs">#general</code>, <code class="text-xs">#off-topic</code>,
        <code class="text-xs">#support</code> and <code class="text-xs">#contributing</code>
        created automatically.
      </p>

      <template v-if="!isAuthenticated">
        <p class="text-xs text-muted">Sign in with atproto to enable chat.</p>
      </template>
      <template v-else-if="!canEnable">
        <p class="text-xs text-muted">
          Link and verify a {{ provider }} account matching <strong>{{ owner }}</strong> in
          <NuxtLink to="/settings/accounts" class="text-primary hover:underline">Settings</NuxtLink>
          to enable chat for it.
        </p>
      </template>
      <UButton
        v-else
        label="Enable Chat"
        icon="i-lucide-message-circle-plus"
        color="primary"
        :loading="enabling"
        @click="enableChat"
      />
    </div>

    <template v-else>
      <ChatSidebar
        :categories="community.categories"
        :channels="community.channels"
        :active-channel="activeChannelUri"
        :community-name="community.community.name"
        @select="selectChannel"
      />

      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex items-center gap-1.5 border-b border-default px-4 py-2.5">
          <UIcon name="i-lucide-hash" class="size-4 text-muted" />
          <span class="text-sm font-semibold text-highlighted">{{ activeChannel?.name }}</span>
          <span v-if="activeChannel?.description" class="ml-2 truncate text-xs text-muted">
            {{ activeChannel.description }}
          </span>
        </div>

        <div ref="listEl" class="flex-1 overflow-y-auto py-3">
          <div v-if="messagesPending" class="space-y-3 px-4">
            <USkeleton v-for="i in 4" :key="i" class="h-10 w-full" />
          </div>
          <UAlert
            v-else-if="messagesError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="messagesError"
            class="mx-4"
          />
          <div
            v-else-if="!messages.length"
            class="flex h-full flex-col items-center justify-center gap-2 text-center"
          >
            <UIcon name="i-lucide-messages-square" class="size-7 text-muted" />
            <p class="text-sm text-muted">No messages yet — say hello.</p>
          </div>
          <template v-else>
            <ChatMessageRow
              v-for="(m, i) in messages"
              :key="m.uri"
              :message="m"
              :show-author="showAuthorFor(i)"
            />
          </template>
        </div>

        <div class="border-t border-default p-3">
          <UTextarea
            v-model="draft"
            :placeholder="
              isAuthenticated ? `Message #${activeChannel?.name ?? ''}` : 'Sign in to chat'
            "
            :disabled="!isAuthenticated || sending"
            autoresize
            :maxrows="6"
            class="w-full"
            @keydown.enter.exact.prevent="submit"
          />
        </div>
      </div>
    </template>
  </div>
</template>
