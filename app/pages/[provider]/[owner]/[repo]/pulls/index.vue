<script setup lang="ts">
import type { ForgeMergeQueueStats, ForgePull, ForgePullState } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const { provider, owner, name, forge, locator, meta } = useRepoContext()
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)

const termPlural = computed(() => pullsTerm(provider.value, { plural: true }))

const state = ref<'open' | 'closed' | 'merged'>('open')
const items = ref<ForgePull[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const q = ref('')
const mergeQueue = ref<ForgeMergeQueueStats | null>(null)

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term) return items.value
  return items.value.filter(
    (it) =>
      it.title.toLowerCase().includes(term) ||
      String(it.number ?? '').includes(term) ||
      (it.author ? userLabel(it.author).toLowerCase().includes(term) : false)
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
    error.value = e instanceof Error ? e.message : `Failed to load ${termPlural.value}.`
  } finally {
    loading.value = false
  }
}

watch([provider, owner, name, state], load)
onMounted(load)

async function loadMergeQueue(): Promise<void> {
  mergeQueue.value = null
  const f = forge.value
  if (!f?.getMergeQueue || !f.capabilities.mergeQueue) return
  if (!meta.value) return
  try {
    mergeQueue.value = await f.getMergeQueue(locator.value, meta.value.defaultBranch || undefined)
  } catch {
    mergeQueue.value = null
  }
}

watch([provider, owner, name, meta], loadMergeQueue, { immediate: true })

const mergeQueueIcon = computed(() =>
  mergeQueue.value?.kind === 'train' ? 'i-lucide-train-front' : 'i-lucide-list-ordered'
)

function formatMqStatus(s: string): string {
  const t = s.replace(/_/g, ' ').toLowerCase().trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function mqStatusColor(s: string): 'error' | 'warning' | 'success' | 'neutral' {
  const t = s.toUpperCase()
  if (t === 'UNMERGEABLE' || t === 'INVALID') return 'error'
  if (t === 'STALE' || t === 'AWAITING_CHECKS' || t === 'LOCKED') return 'warning'
  if (t === 'MERGEABLE' || t === 'FRESH') return 'success'
  return 'neutral'
}

function itemLink(it: ForgePull): string {
  return `${base.value}/pulls/${encodeURIComponent(it.id)}`
}

function icon(s: ForgePullState): string {
  return PULL_STATE_ICON[s] ?? 'i-lucide-git-pull-request'
}
function color(s: ForgePullState): string {
  if (s === 'open') return 'text-success'
  if (s === 'merged') return 'text-primary'
  return 'text-muted'
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="mergeQueue?.entries.length"
      class="rounded-lg border border-default bg-elevated/30 p-4"
    >
      <div class="flex flex-wrap items-center gap-2 text-sm font-medium text-default">
        <UIcon :name="mergeQueueIcon" class="size-4 text-primary" />
        {{ mergeQueue.kind === 'train' ? 'Merge train' : 'Merge queue' }}
        <span v-if="mergeQueue.branch" class="font-mono text-xs text-muted"
          >→ {{ mergeQueue.branch }}</span
        >
        <UBadge color="neutral" variant="soft" size="sm">
          {{ mergeQueue.entries.length }}
        </UBadge>
      </div>
      <ol class="mt-3 space-y-1.5">
        <li
          v-for="e in mergeQueue.entries"
          :key="e.position"
          class="flex items-center gap-2 text-sm"
        >
          <span
            class="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-medium text-muted"
          >
            {{ e.position }}
          </span>
          <NuxtLink
            v-if="e.number"
            :to="`${base}/pulls/${e.number}`"
            class="min-w-0 flex-1 truncate font-medium text-default transition hover:text-primary"
          >
            {{ e.title }}
          </NuxtLink>
          <span v-else class="min-w-0 flex-1 truncate font-medium text-default">{{ e.title }}</span>
          <span v-if="e.number" class="shrink-0 text-xs text-muted">#{{ e.number }}</span>
          <UBadge
            v-if="e.status"
            :color="mqStatusColor(e.status)"
            variant="subtle"
            size="sm"
            class="shrink-0"
          >
            {{ formatMqStatus(e.status) }}
          </UBadge>
        </li>
      </ol>
    </div>

    <ListToolbar v-model:search="q" :count="filtered.length" :placeholder="`Filter ${termPlural}…`">
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
      :title="`Could not load ${termPlural}`"
      :description="error"
    />

    <div
      v-else-if="!filtered.length"
      class="rounded-lg border border-dashed border-default py-16 text-center"
    >
      <UIcon name="i-lucide-git-pull-request-closed" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">
        {{ q ? `No ${termPlural} match your filter.` : `No ${state} ${termPlural}.` }}
      </p>
    </div>

    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default">
      <li v-for="it in filtered" :key="it.id">
        <NuxtLink
          :to="itemLink(it)"
          class="flex items-start gap-3 px-4 py-3 transition hover:bg-elevated/40"
        >
          <UIcon :name="icon(it.state)" class="mt-0.5 size-4 shrink-0" :class="color(it.state)" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-default">{{ it.title }}</p>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span v-if="it.number">#{{ it.number }}</span>
              <span v-if="it.author">· {{ userLabel(it.author) }}</span>
              <span v-if="it.sourceBranch && it.targetBranch" class="font-mono"
                >· {{ it.sourceBranch }} → {{ it.targetBranch }}</span
              >
              <span v-if="it.updatedAt">· {{ formatRelativeTime(it.updatedAt) }}</span>
            </div>
          </div>
          <span
            v-if="it.commentCount"
            class="inline-flex shrink-0 items-center gap-1 text-xs text-muted"
          >
            <UIcon name="i-lucide-message-square" class="size-3.5" />{{ it.commentCount }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
