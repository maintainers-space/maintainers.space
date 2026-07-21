<script setup lang="ts">
import type { ForgeActionRun } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const { provider, owner, name, forge, locator } = useRepoContext()
const base = computed(() => repoPath({ provider: provider.value, owner: owner.value, name: name.value }))

const items = ref<ForgeActionRun[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  if (!forge.value?.listActionRuns) return
  loading.value = true
  error.value = null
  try {
    const page = await forge.value.listActionRuns(locator.value, { limit: 30 })
    items.value = page.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load workflow runs.'
  } finally {
    loading.value = false
  }
}

watch([provider, owner, name], load)
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

    <div v-else-if="!items.length" class="rounded-lg border border-dashed border-default py-16 text-center">
      <UIcon name="i-lucide-play" class="mx-auto size-8 text-muted" />
      <p class="mt-3 text-sm text-muted">
        No workflow runs found.
      </p>
    </div>

    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default">
      <li v-for="run in items" :key="run.id">
        <NuxtLink
          :to="`${base}/actions/${encodeURIComponent(run.id)}`"
          class="flex items-start gap-3 px-4 py-3 transition hover:bg-elevated/40"
        >
          <StateBadge
            :state="run.status"
            kind="run"
            size="sm"
            class="mt-0.5 shrink-0"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-default">{{ run.name || run.commitMessage || 'Workflow run' }}</p>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span v-if="run.event" class="capitalize">{{ run.event }}</span>
              <span v-if="run.branch" class="font-mono">· {{ run.branch }}</span>
              <span v-if="run.commitSha" class="font-mono">· {{ run.commitSha.slice(0, 7) }}</span>
              <span v-if="run.actor">· {{ userLabel(run.actor) }}</span>
              <span v-if="run.createdAt">· {{ formatRelativeTime(run.createdAt) }}</span>
            </div>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
