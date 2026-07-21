<script setup lang="ts">
import type { ForgeCommit, ForgeFileDiff, ForgePullDetail } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge, locator } = useRepoContext()
const base = computed(() => repoPath({ provider: provider.value, owner: owner.value, name: name.value }))
const id = computed(() => String(route.params.id))

const { data, pending, error } = useAsyncData<ForgePullDetail | null>(
  () => `pull:${provider.value}:${owner.value}:${name.value}:${id.value}`,
  async () => {
    if (!forge.value?.getPull) return null
    return await forge.value.getPull(locator.value, id.value)
  },
  { lazy: true, watch: [() => route.fullPath] }
)

const tab = ref<'conversation' | 'commits' | 'files'>('conversation')

const files = ref<ForgeFileDiff[] | null>(null)
const filesLoading = ref(false)
const commits = ref<ForgeCommit[] | null>(null)
const commitsLoading = ref(false)

async function ensureFiles(): Promise<void> {
  if (files.value || filesLoading.value || !forge.value?.getPullFiles) return
  filesLoading.value = true
  try {
    files.value = await forge.value.getPullFiles(locator.value, id.value)
  } catch {
    files.value = []
  } finally {
    filesLoading.value = false
  }
}

async function ensureCommits(): Promise<void> {
  if (commits.value || commitsLoading.value || !forge.value?.getPullCommits) return
  commitsLoading.value = true
  try {
    commits.value = await forge.value.getPullCommits(locator.value, id.value)
  } catch {
    commits.value = []
  } finally {
    commitsLoading.value = false
  }
}

watch(tab, (t) => {
  if (t === 'files') ensureFiles()
  if (t === 'commits') ensureCommits()
})

const tabItems = computed(() => [
  { label: 'Conversation', icon: 'i-lucide-message-square', value: 'conversation' },
  { label: `Commits${data.value?.commitCount ? ' ' + data.value.commitCount : ''}`, icon: 'i-lucide-git-commit-horizontal', value: 'commits' },
  { label: 'Files changed', icon: 'i-lucide-file-diff', value: 'files' }
])
</script>

<template>
  <div class="space-y-5">
    <UButton
      :to="`${base}/pulls`"
      icon="i-lucide-arrow-left"
      size="xs"
      color="neutral"
      variant="ghost"
      label="All pull requests"
    />

    <div v-if="pending && !data" class="space-y-3">
      <USkeleton class="h-8 w-2/3" />
      <USkeleton class="h-32 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load pull request"
      :description="(error as any)?.message"
    />

    <template v-else-if="data">
      <div class="space-y-2 border-b border-default pb-4">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ data.title }} <span v-if="data.number" class="font-normal text-muted">#{{ data.number }}</span>
        </h1>
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StateBadge :state="data.state" kind="pull" />
          <UserLink :user="data.author" />
          <span v-if="data.sourceBranch && data.targetBranch" class="font-mono text-xs">
            {{ data.sourceBranch }} → {{ data.targetBranch }}
          </span>
        </div>
      </div>

      <UTabs
        v-model="tab"
        :items="tabItems"
        :content="false"
        size="sm"
      />

      <div v-show="tab === 'conversation'" class="space-y-4">
        <article class="overflow-hidden rounded-lg border border-default">
          <header class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2 text-sm">
            <UserLink :user="data.author" />
            <span v-if="data.createdAt" class="text-muted">opened {{ formatRelativeTime(data.createdAt) }}</span>
          </header>
          <div class="px-4 py-3">
            <MarkdownBody :content="data.body ?? ''" empty="No description provided." />
          </div>
        </article>
        <CommentThread v-if="data.comments.length" :comments="data.comments" />
      </div>

      <div v-show="tab === 'commits'">
        <div v-if="commitsLoading" class="space-y-2">
          <USkeleton v-for="i in 3" :key="i" class="h-14 w-full" />
        </div>
        <ForgeCommitList
          v-else-if="commits?.length"
          :commits="commits"
          :provider="provider"
          :owner="owner"
          :repo="name"
        />
        <p v-else class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted">
          No commits to display.
        </p>
      </div>

      <div v-show="tab === 'files'">
        <div v-if="filesLoading" class="space-y-2">
          <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
        </div>
        <DiffView v-else-if="files?.length" :files="files" />
        <p v-else class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted">
          No file changes to display.
        </p>
      </div>
    </template>
  </div>
</template>
