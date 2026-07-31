<script setup lang="ts">
import type { ForgeDiscussion } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'
import { cached, TTL } from '~/lib/cache'

const { provider, owner, name, forge, locator } = useRepoContext()
const { get: getToken } = useForgeTokens()
const connectBanner = useDismissible('discussions-connect-github')
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)

const items = ref<ForgeDiscussion[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const needsToken = ref(false)
const q = ref('')
const answerFilter = ref<'all' | 'answered' | 'unanswered'>('all')

const filtered = computed(() => {
  let list = items.value
  if (answerFilter.value === 'answered') list = list.filter((d) => d.answered)
  else if (answerFilter.value === 'unanswered') list = list.filter((d) => !d.answered)
  const term = q.value.trim().toLowerCase()
  if (term) {
    list = list.filter(
      (d) =>
        d.title.toLowerCase().includes(term) ||
        (d.category ? d.category.toLowerCase().includes(term) : false) ||
        (d.author ? userLabel(d.author).toLowerCase().includes(term) : false)
    )
  }
  return list
})

async function load(): Promise<void> {
  const f = forge.value
  if (!f?.listDiscussions) return
  const token = getToken(provider.value)
  needsToken.value = !token
  loading.value = true
  error.value = null
  try {
    const key = `discussions:${provider.value}:${owner.value}:${name.value}:${token ? 'auth' : 'anon'}`
    const page = await cached(key, () => f.listDiscussions!(locator.value, { token, limit: 30 }), {
      ttl: TTL.SHORT
    })
    items.value = page.items
    if (page.incomplete && !token) needsToken.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load discussions.'
  } finally {
    loading.value = false
  }
}

watch([provider, owner, name], load)
onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <ListToolbar
      v-if="items.length"
      v-model:search="q"
      :count="filtered.length"
      placeholder="Filter discussions…"
    >
      <template #filters>
        <UButton
          :color="answerFilter === 'all' ? 'primary' : 'neutral'"
          :variant="answerFilter === 'all' ? 'soft' : 'ghost'"
          icon="i-lucide-messages-square"
          size="sm"
          label="All"
          @click="answerFilter = 'all'"
        />
        <UButton
          :color="answerFilter === 'answered' ? 'primary' : 'neutral'"
          :variant="answerFilter === 'answered' ? 'soft' : 'ghost'"
          icon="i-lucide-check-circle"
          size="sm"
          label="Answered"
          @click="answerFilter = 'answered'"
        />
        <UButton
          :color="answerFilter === 'unanswered' ? 'primary' : 'neutral'"
          :variant="answerFilter === 'unanswered' ? 'soft' : 'ghost'"
          icon="i-lucide-circle-dashed"
          size="sm"
          label="Unanswered"
          @click="answerFilter = 'unanswered'"
        />
      </template>
    </ListToolbar>

    <div v-if="loading" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-14 w-full" />
    </div>

    <UAlert
      v-else-if="needsToken && !items.length && !connectBanner.dismissed.value"
      color="neutral"
      variant="subtle"
      icon="i-lucide-key-round"
      title="Discussions need a connected GitHub account"
      description="GitHub discussions are only available through the authenticated GraphQL API."
      close
      @update:open="connectBanner.dismiss()"
    >
      <template #actions>
        <UButton
          to="/settings/accounts"
          size="xs"
          color="neutral"
          variant="soft"
          label="Connect GitHub"
        />
      </template>
    </UAlert>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load discussions"
      :description="error"
    />

    <div
      v-else-if="!items.length"
      class="rounded-lg border border-dashed border-default py-16 text-center"
    >
      <UIcon name="i-lucide-messages-square" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">No discussions yet.</p>
    </div>

    <div
      v-else-if="!filtered.length"
      class="rounded-lg border border-dashed border-default py-16 text-center"
    >
      <UIcon name="i-lucide-search-x" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">No discussions match your filter.</p>
    </div>

    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default">
      <li v-for="d in filtered" :key="d.id">
        <NuxtLink
          :to="`${base}/discussions/${encodeURIComponent(d.id)}`"
          class="flex items-start gap-3 px-4 py-3 transition hover:bg-elevated/40"
        >
          <UIcon
            :name="d.answered ? 'i-lucide-check-circle' : 'i-lucide-messages-square'"
            class="mt-0.5 size-4 shrink-0"
            :class="d.answered ? 'text-success' : 'text-muted'"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-default">{{ d.title }}</p>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <UBadge
                v-if="d.category"
                :label="d.category"
                color="neutral"
                variant="subtle"
                size="xs"
              />
              <span v-if="d.author">{{ userLabel(d.author) }}</span>
              <span v-if="d.createdAt">· {{ formatRelativeTime(d.createdAt) }}</span>
            </div>
          </div>
          <span
            v-if="d.commentCount"
            class="inline-flex shrink-0 items-center gap-1 text-xs text-muted"
          >
            <UIcon name="i-lucide-message-square" class="size-3.5" />{{ d.commentCount }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
