<script setup lang="ts">
import type { ForgePull, ForgePullState } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const { provider, owner, name, forge, locator } = useRepoContext()
const base = computed(() => repoPath({ provider: provider.value, owner: owner.value, name: name.value }))

const state = ref<'open' | 'closed' | 'merged'>('open')
const items = ref<ForgePull[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const q = ref('')

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term) return items.value
  return items.value.filter(it =>
    it.title.toLowerCase().includes(term)
    || String(it.number ?? '').includes(term)
    || (it.author ? userLabel(it.author).toLowerCase().includes(term) : false)
  )
})

async function load(): Promise<void> {
  if (!forge.value?.listPulls) return
  loading.value = true
  error.value = null
  try {
    const page = await forge.value.listPulls(locator.value, { state: state.value, limit: 30 })
    items.value = page.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load pull requests.'
  } finally {
    loading.value = false
  }
}

watch([provider, owner, name, state], load)
onMounted(load)

function itemLink(it: ForgePull): string {
  return `${base.value}/pulls/${encodeURIComponent(it.id)}`
}

function icon(s: ForgePullState): string {
  if (s === 'merged') return 'i-lucide-git-merge'
  if (s === 'draft') return 'i-lucide-git-pull-request-draft'
  return 'i-lucide-git-pull-request'
}
function color(s: ForgePullState): string {
  if (s === 'open') return 'text-success'
  if (s === 'merged') return 'text-primary'
  return 'text-muted'
}
</script>

<template>
  <div class="space-y-4">
    <ListToolbar v-model:search="q" :count="filtered.length" placeholder="Filter pull requests…">
      <template #filters>
        <UButton
          :color="state === 'open' ? 'primary' : 'neutral'"
          :variant="state === 'open' ? 'soft' : 'ghost'"
          icon="i-lucide-git-pull-request"
          size="sm"
          label="Open"
          @click="state = 'open'"
        />
        <UButton
          :color="state === 'closed' ? 'primary' : 'neutral'"
          :variant="state === 'closed' ? 'soft' : 'ghost'"
          icon="i-lucide-git-pull-request-closed"
          size="sm"
          label="Closed"
          @click="state = 'closed'"
        />
        <UButton
          :color="state === 'merged' ? 'primary' : 'neutral'"
          :variant="state === 'merged' ? 'soft' : 'ghost'"
          icon="i-lucide-git-merge"
          size="sm"
          label="Merged"
          @click="state = 'merged'"
        />
      </template>
    </ListToolbar>

    <div v-if="loading" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-14 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load pull requests"
      :description="error"
    />

    <div v-else-if="!filtered.length" class="rounded-lg border border-dashed border-default py-16 text-center">
      <UIcon name="i-lucide-git-pull-request-closed" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">
        {{ q ? 'No pull requests match your filter.' : `No ${state} pull requests.` }}
      </p>
    </div>

    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default">
      <li v-for="it in filtered" :key="it.id">
        <NuxtLink :to="itemLink(it)" class="flex items-start gap-3 px-4 py-3 transition hover:bg-elevated/40">
          <UIcon :name="icon(it.state)" class="mt-0.5 size-4 shrink-0" :class="color(it.state)" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-default">{{ it.title }}</p>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span v-if="it.number">#{{ it.number }}</span>
              <span v-if="it.author">· {{ userLabel(it.author) }}</span>
              <span v-if="it.sourceBranch && it.targetBranch" class="font-mono">· {{ it.sourceBranch }} → {{ it.targetBranch }}</span>
              <span v-if="it.updatedAt">· {{ formatRelativeTime(it.updatedAt) }}</span>
            </div>
          </div>
          <span v-if="it.commentCount" class="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
            <UIcon name="i-lucide-message-square" class="size-3.5" />{{ it.commentCount }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
