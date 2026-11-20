<script setup lang="ts">
import type { CiJob, CiRun } from 'forges'
import { useRepoContext } from '~/composables/useRepoContext'
import { parseJobLog } from '~/lib/actions-log'
import type { ParsedJobLog } from '~/lib/actions-log'
import type { TangledRepoRaw } from '~/lib/forges/gaps/tangled'
import { getTangledRun } from '~/lib/forges/gaps/tangled'
import { getForge } from '~/lib/forges/registry'

const route = useRoute()
const { provider, owner, name, forge, meta } = useRepoContext()
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)
const id = computed(() => String(route.params.id))
const forgeLabel = computed(() => getForge(provider.value)?.label ?? provider.value)

// Logs need the forge's ci.log capability, which GitHub only grants to authenticated callers.
const canFetchLogs = computed(() => !!forge.value?.can('ci.log'))

interface RunDetail {
  jobs: CiJob[]
  run: CiRun
}

const { data, pending, error } = useLiveAsyncData<RunDetail | null>(
  () => `run:${provider.value}:${owner.value}:${name.value}:${id.value}`,
  async () => {
    const f = forge.value
    const repo = meta.value
    if (!f || !repo) return null
    if (f.forge === 'tangled') {
      const spindle = (repo.raw as TangledRepoRaw).spindle
      return spindle ? await getTangledRun(f, repo.ref, spindle, id.value) : null
    }
    const ref = { forge: repo.ref.forge, id: id.value, instance: repo.ref.instance, repo: repo.ref }
    const run = await f.ci.getRun(ref)
    const jobs: CiJob[] = []
    for await (const job of f.ci.jobs(ref)) jobs.push(job)
    return { jobs, run }
  },
  { lazy: true, watch: [() => route.fullPath, meta] }
)

const jobLogs = ref<Record<string, ParsedJobLog | null | undefined>>({})
const jobLogLoading = ref<Record<string, boolean>>({})
const expandedJobs = ref<Record<string, boolean>>({})

async function readLog(job: CiJob): Promise<ParsedJobLog | null> {
  const stream = await forge.value!.ci.log(job.ref)
  const text = await new Response(stream).text()
  return parseJobLog(text, forge.value!.forge)
}

async function toggleJob(job: CiJob): Promise<void> {
  if (!canFetchLogs.value) return
  const key = job.ref.id
  if (expandedJobs.value[key]) {
    delete expandedJobs.value[key]
    return
  }
  expandedJobs.value[key] = true
  if (!(key in jobLogs.value) && !jobLogLoading.value[key]) {
    jobLogLoading.value[key] = true
    jobLogs.value[key] = await readLog(job).catch(() => null)
    jobLogLoading.value[key] = false
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
          {{ data.run.name || 'Workflow run' }}
        </h1>
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StateBadge :state="data.run.state" kind="run" />
          <span v-if="data.run.eventRaw">{{ ciEventLabel(data.run.eventRaw) }}</span>
          <span v-if="data.run.branch" class="font-mono text-xs">{{ data.run.branch }}</span>
          <span v-if="data.run.sha" class="font-mono text-xs">{{ data.run.sha.slice(0, 7) }}</span>
          <UserLink v-if="data.run.actor" :user="data.run.actor" />
          <span v-if="data.run.createdAt">{{ formatRelativeTime(data.run.createdAt) }}</span>
        </div>
      </div>

      <div v-if="data.jobs.length" class="space-y-3">
        <div
          v-for="job in data.jobs"
          :key="job.ref.id"
          class="overflow-hidden rounded-lg border border-default"
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 bg-elevated/40 px-4 py-2.5 text-left"
            :class="canFetchLogs ? 'hover:bg-elevated/60' : 'cursor-default'"
            @click="toggleJob(job)"
          >
            <StateBadge :state="job.state" kind="run" size="xs" />
            <span class="text-sm font-medium text-default">{{ job.name }}</span>
            <span
              v-if="formatDuration(job.startedAt, job.completedAt)"
              class="ml-auto font-mono text-xs text-muted"
            >
              {{ formatDuration(job.startedAt, job.completedAt) }}
            </span>
            <a
              v-if="job.url"
              :href="job.url"
              target="_blank"
              rel="noopener"
              :title="`View this job's logs on ${forgeLabel}`"
              :aria-label="`View this job's logs on ${forgeLabel}`"
              class="shrink-0 text-muted hover:text-primary"
              @click.stop
            >
              <UIcon name="i-lucide-external-link" class="size-4" />
            </a>
            <UIcon
              v-if="canFetchLogs"
              name="i-lucide-chevron-down"
              class="size-4 shrink-0 text-muted transition-transform"
              :class="{ 'rotate-180': expandedJobs[job.ref.id] }"
            />
          </button>
          <div
            v-if="canFetchLogs && expandedJobs[job.ref.id]"
            class="border-t border-default bg-elevated/20 px-4 py-2"
          >
            <USkeleton v-if="jobLogLoading[job.ref.id]" class="h-16 w-full" />
            <template v-else-if="jobLogs[job.ref.id]">
              <details
                v-for="section in jobLogs[job.ref.id]!.sections"
                :key="section.name"
                class="py-1"
              >
                <summary class="cursor-pointer text-sm text-default">{{ section.name }}</summary>
                <pre
                  class="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs text-default"
                  >{{ section.lines.join('\n') }}</pre>
              </details>
              <pre
                v-if="jobLogs[job.ref.id]!.raw"
                class="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs text-default"
                >{{ jobLogs[job.ref.id]!.raw }}</pre>
            </template>
            <p v-else class="text-xs text-muted">This job has no log content.</p>
          </div>
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
