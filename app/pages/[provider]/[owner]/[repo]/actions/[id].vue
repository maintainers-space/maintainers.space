<script setup lang="ts">
import type { ForgeActionJob, ForgeActionRun, ForgeActionStep, ForgeJobLog } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge, locator } = useRepoContext()
const { get: getToken } = useForgeTokens()
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)
const id = computed(() => String(route.params.id))

// GitHub's log endpoint hard-requires a token — expanding a step there without
// one always resolves to nothing, which used to be the only way to find that
// out. Skip the dead-end expand affordance in that case; the external-link
// icon on every step is the reliable way in regardless of provider.
const canFetchLogs = computed(
  () => !!forge.value?.getActionJobLog && (provider.value !== 'github' || !!getToken('github'))
)

const { data, pending, error } = useLiveAsyncData<ForgeActionRun | null>(
  () => `run:${provider.value}:${owner.value}:${name.value}:${id.value}`,
  async () => {
    if (!forge.value?.getActionRun) return null
    return await forge.value.getActionRun(locator.value, id.value)
  },
  { lazy: true, watch: [() => route.fullPath] }
)

const jobLogs = ref<Record<string, ForgeJobLog | null | undefined>>({})
const jobLogLoading = ref<Record<string, boolean>>({})
const expandedSteps = ref<Record<string, boolean>>({})

function stepKey(job: ForgeActionJob, index: number): string {
  return `${job.id}:${index}`
}

function stepLog(job: ForgeActionJob, step: ForgeActionStep): string[] | null {
  const log = jobLogs.value[job.id]
  if (!log) return null
  if (log.sections) return log.sections.find((s) => s.name === step.name)?.lines ?? null
  return log.raw ? log.raw.split(/\r?\n/) : null
}

async function toggleStep(job: ForgeActionJob, index: number): Promise<void> {
  if (!canFetchLogs.value) return
  const key = stepKey(job, index)
  if (expandedSteps.value[key]) {
    delete expandedSteps.value[key]
    return
  }
  expandedSteps.value[key] = true
  if (!(job.id in jobLogs.value) && !jobLogLoading.value[job.id]) {
    jobLogLoading.value[job.id] = true
    jobLogs.value[job.id] =
      (await forge.value?.getActionJobLog?.(locator.value, job.id).catch(() => null)) ?? null
    jobLogLoading.value[job.id] = false
  }
}
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
      :description="error?.message"
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
          <span v-if="data.commitSha" class="font-mono text-xs">{{
            data.commitSha.slice(0, 7)
          }}</span>
          <UserLink v-if="data.actor" :user="data.actor" />
          <span v-if="data.createdAt">{{ formatRelativeTime(data.createdAt) }}</span>
        </div>
        <p v-if="data.commitMessage" class="truncate text-sm text-default">
          {{ data.commitMessage }}
        </p>
      </div>

      <div v-if="data.jobs?.length" class="space-y-3">
        <div
          v-for="job in data.jobs"
          :key="job.id"
          class="overflow-hidden rounded-lg border border-default"
        >
          <div class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2.5">
            <StateBadge :state="job.status" kind="run" size="xs" />
            <span class="text-sm font-medium text-default">{{ job.name }}</span>
            <span v-if="job.startedAt && job.completedAt" class="ml-auto text-xs text-muted">{{
              formatRelativeTime(job.completedAt)
            }}</span>
          </div>
          <ul v-if="job.steps?.length" class="divide-y divide-default/60">
            <li v-for="(step, i) in job.steps" :key="i" class="text-sm">
              <button
                type="button"
                class="flex w-full items-center gap-2 px-4 py-2 text-left"
                :class="canFetchLogs ? 'hover:bg-elevated/40' : 'cursor-default'"
                @click="toggleStep(job, i)"
              >
                <StateBadge :state="step.status" kind="run" size="xs" />
                <span class="text-default">{{ step.name }}</span>
                <span
                  v-if="formatDuration(step.startedAt, step.completedAt)"
                  class="ml-auto font-mono text-xs text-muted"
                >
                  {{ formatDuration(step.startedAt, step.completedAt) }}
                </span>
                <a
                  v-if="job.url"
                  :href="job.url"
                  target="_blank"
                  rel="noopener"
                  :title="`View this step's logs on ${forge?.label}`"
                  class="shrink-0 text-muted hover:text-primary"
                  @click.stop
                >
                  <UIcon name="i-lucide-external-link" class="size-4" />
                </a>
                <UIcon
                  v-if="canFetchLogs"
                  name="i-lucide-chevron-down"
                  class="size-4 shrink-0 text-muted transition-transform"
                  :class="{ 'rotate-180': expandedSteps[stepKey(job, i)] }"
                />
              </button>
              <div
                v-if="canFetchLogs && expandedSteps[stepKey(job, i)]"
                class="border-t border-default bg-elevated/20 px-4 py-2"
              >
                <USkeleton v-if="jobLogLoading[job.id]" class="h-16 w-full" />
                <pre
                  v-else-if="stepLog(job, step)"
                  class="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs text-default"
                  >{{ stepLog(job, step)?.join('\n') }}</pre>
                <p v-else class="text-xs text-muted">
                  This step has no log content on {{ forge?.label }}.
                </p>
              </div>
            </li>
          </ul>
          <p
            v-if="job.error"
            class="border-t border-default px-4 py-2 font-mono text-xs text-error"
          >
            {{ job.error }}
          </p>
        </div>
      </div>
      <p
        v-else
        class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted"
      >
        No job details available.
      </p>
    </template>
  </div>
</template>
