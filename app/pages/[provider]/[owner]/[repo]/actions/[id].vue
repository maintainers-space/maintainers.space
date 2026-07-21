<script setup lang="ts">
import type { ForgeActionRun } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge, locator } = useRepoContext()
const base = computed(() => repoPath({ provider: provider.value, owner: owner.value, name: name.value }))
const id = computed(() => String(route.params.id))

const { data, pending, error } = useAsyncData<ForgeActionRun | null>(
  () => `run:${provider.value}:${owner.value}:${name.value}:${id.value}`,
  async () => {
    if (!forge.value?.getActionRun) return null
    return await forge.value.getActionRun(locator.value, id.value)
  },
  { lazy: true, watch: [() => route.fullPath] }
)
</script>

<template>
  <div class="space-y-5">
    <UButton
      :to="`${base}/actions`"
      icon="i-lucide-arrow-left"
      size="xs"
      color="neutral"
      variant="ghost"
      label="All runs"
    />

    <div v-if="pending && !data" class="space-y-3">
      <USkeleton class="h-8 w-2/3" />
      <USkeleton class="h-40 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load run"
      :description="(error as any)?.message"
    />

    <template v-else-if="data">
      <div class="space-y-2 border-b border-default pb-4">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ data.name || 'Workflow run' }}
        </h1>
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StateBadge :state="data.status" kind="run" />
          <span v-if="data.event" class="capitalize">{{ data.event }}</span>
          <span v-if="data.branch" class="font-mono text-xs">{{ data.branch }}</span>
          <span v-if="data.commitSha" class="font-mono text-xs">{{ data.commitSha.slice(0, 7) }}</span>
          <UserLink v-if="data.actor" :user="data.actor" />
          <span v-if="data.createdAt">{{ formatRelativeTime(data.createdAt) }}</span>
        </div>
        <p v-if="data.commitMessage" class="truncate text-sm text-default">
          {{ data.commitMessage }}
        </p>
      </div>

      <div v-if="data.jobs?.length" class="space-y-3">
        <div v-for="job in data.jobs" :key="job.id" class="overflow-hidden rounded-lg border border-default">
          <div class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2.5">
            <StateBadge :state="job.status" kind="run" size="xs" />
            <span class="text-sm font-medium text-default">{{ job.name }}</span>
            <span
              v-if="job.startedAt && job.completedAt"
              class="ml-auto text-xs text-muted"
            >{{ formatRelativeTime(job.completedAt) }}</span>
          </div>
          <ul v-if="job.steps?.length" class="divide-y divide-default/60">
            <li v-for="(step, i) in job.steps" :key="i" class="flex items-center gap-2 px-4 py-2 text-sm">
              <StateBadge :state="step.status" kind="run" size="xs" />
              <span class="text-default">{{ step.name }}</span>
            </li>
          </ul>
          <p v-if="job.error" class="border-t border-default px-4 py-2 font-mono text-xs text-error">
            {{ job.error }}
          </p>
        </div>
      </div>
      <p v-else class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted">
        No job details available.
      </p>
    </template>
  </div>
</template>
