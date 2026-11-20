<script setup lang="ts">
import type { CiRun } from 'forges'
import { useRepoContext } from '~/composables/useRepoContext'
import { cached, TTL } from '~/lib/cache'
import { loadRuns } from '~/lib/forges/loaders'

const { provider, owner, name, forge, meta } = useRepoContext()
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)

const items = ref<CiRun[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  const f = forge.value
  const repo = meta.value
  if (!f || !repo) return
  loading.value = true
  error.value = null
  try {
    const key = `actions:${provider.value}:${owner.value}:${name.value}`
    items.value = await cached(key, () => loadRuns(f, repo), { ttl: TTL.SHORT })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load workflow runs.'
  } finally {
    loading.value = false
  }
}

watch([provider, owner, name, meta], load)
onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-14 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load runs"
      :description="error"
    />

    <div
      v-else-if="!items.length"
      class="rounded-lg border border-dashed border-default py-16 text-center"
    >
      <UIcon name="i-lucide-play" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">No workflow runs found.</p>
    </div>

    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default">
      <li v-for="run in items" :key="run.ref.id">
        <CommonOfflineLink
          :to="`${base}/actions/${encodeURIComponent(run.ref.id)}`"
          :cache-key="`run:${provider}:${owner}:${name}:${run.ref.id}`"
          class="flex items-start gap-3 px-4 py-3 transition hover:bg-elevated/40"
        >
          <template #default="{ offline }">
            <UIcon
              v-if="offline"
              name="i-lucide-wifi-off"
              class="mt-0.5 size-4 shrink-0 text-muted"
            />
            <StateBadge v-else :state="run.state" kind="run" size="sm" class="mt-0.5 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-default">
                {{ run.name || 'Workflow run' }}
              </p>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span v-if="run.eventRaw" class="capitalize">{{ run.eventRaw }}</span>
                <span v-if="run.branch" class="font-mono">· {{ run.branch }}</span>
                <span v-if="run.sha" class="font-mono">· {{ run.sha.slice(0, 7) }}</span>
                <span v-if="run.actor">· {{ actorLabel(run.actor) }}</span>
                <span v-if="run.createdAt">· {{ formatRelativeTime(run.createdAt) }}</span>
              </div>
            </div>
          </template>
        </CommonOfflineLink>
      </li>
    </ul>
  </div>
</template>
