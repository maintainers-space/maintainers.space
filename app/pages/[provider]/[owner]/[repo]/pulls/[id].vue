<script setup lang="ts">
import type { ForgeCommit, ForgeFileDiff, ForgePullDetail } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge, locator } = useRepoContext()
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)
const id = computed(() => String(route.params.id))

const { data, pending, error, refresh } = useLiveAsyncData<ForgePullDetail | null>(
  () => `pull:${provider.value}:${owner.value}:${name.value}:${id.value}`,
  async () => {
    if (!forge.value?.getPull) return null
    return await forge.value.getPull(locator.value, id.value)
  },
  { lazy: true, watch: [() => route.fullPath] }
)

const { get: getToken } = useForgeTokens()
const toast = useToast()
const canWrite = computed(() => !!getToken(provider.value) && !!forge.value?.createComment)

const tab = useRouteTab('tab', ['conversation', 'commits', 'files'] as const, 'conversation')

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

// Deep-linked directly to ?tab=files/commits: kick off the lazy load on mount.
onMounted(() => {
  if (tab.value === 'files') ensureFiles()
  if (tab.value === 'commits') ensureCommits()
})

const tabItems = computed(() => [
  { label: 'Conversation', icon: 'i-lucide-message-square', value: 'conversation' },
  {
    label: `Commits${data.value?.commitCount ? ' ' + data.value.commitCount : ''}`,
    icon: 'i-lucide-git-commit-horizontal',
    value: 'commits'
  },
  { label: 'Files changed', icon: 'i-lucide-file-diff', value: 'files' }
])

const filesStat = computed(() => {
  const stat = data.value?.stat
  if (stat && (stat.additions != null || stat.deletions != null)) return stat
  if (!files.value) return null
  let additions = 0
  let deletions = 0
  for (const f of files.value) {
    additions += f.additions ?? 0
    deletions += f.deletions ?? 0
  }
  return { additions, deletions }
})

const commentDraft = ref('')
const postingComment = ref(false)
const reviewDraft = ref('')
const reviewSubmitting = ref<'' | 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'>('')

async function submitComment(): Promise<void> {
  if (!forge.value?.createComment || !commentDraft.value.trim()) return
  postingComment.value = true
  try {
    await forge.value.createComment(locator.value, id.value, commentDraft.value)
    commentDraft.value = ''
    toast.add({ title: 'Comment posted', color: 'success', icon: 'i-lucide-check' })
    await refresh()
  } catch (e) {
    toast.add({
      title: 'Could not post comment',
      description:
        (e as { data?: { message?: string }; message?: string })?.data?.message ??
        (e as { message?: string })?.message,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    postingComment.value = false
  }
}

async function submitReview(event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'): Promise<void> {
  if (!forge.value?.createReview) return
  reviewSubmitting.value = event
  try {
    await forge.value.createReview(locator.value, id.value, {
      event,
      body: reviewDraft.value || undefined
    })
    reviewDraft.value = ''
    toast.add({ title: 'Review submitted', color: 'success', icon: 'i-lucide-check' })
    await refresh()
  } catch (e) {
    toast.add({
      title: 'Could not submit review',
      description:
        (e as { data?: { message?: string }; message?: string })?.data?.message ??
        (e as { message?: string })?.message,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    reviewSubmitting.value = ''
  }
}

async function onDiffComment(payload: { path: string; line: number; body: string }): Promise<void> {
  if (!forge.value?.createReview) return
  try {
    await forge.value.createReview(locator.value, id.value, {
      event: 'COMMENT',
      comments: [{ path: payload.path, line: payload.line, body: payload.body }]
    })
    toast.add({ title: 'Comment added to the diff', color: 'success', icon: 'i-lucide-check' })
  } catch (e) {
    toast.add({
      title: 'Could not add comment',
      description:
        (e as { data?: { message?: string }; message?: string })?.data?.message ??
        (e as { message?: string })?.message,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  }
}
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
      :description="error?.message"
    />

    <template v-else-if="data">
      <div class="space-y-2 border-b border-default pb-4">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ data.title }}
          <span v-if="data.number" class="font-normal text-muted">#{{ data.number }}</span>
        </h1>
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StateBadge :state="data.state" kind="pull" />
          <UserLink :user="data.author" />
          <span v-if="data.sourceBranch && data.targetBranch" class="font-mono text-xs">
            {{ data.sourceBranch }} → {{ data.targetBranch }}
          </span>
        </div>
      </div>

      <UTabs v-model="tab" :items="tabItems" :content="false" size="sm">
        <template #trailing="{ item }">
          <DiffStat
            v-if="item.value === 'files' && filesStat"
            :additions="filesStat.additions"
            :deletions="filesStat.deletions"
            :show-files="false"
            class="ml-1"
          />
        </template>
      </UTabs>

      <div v-show="tab === 'conversation'" class="space-y-4">
        <article class="overflow-hidden rounded-lg border border-default">
          <header
            class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2 text-sm"
          >
            <UserLink :user="data.author" />
            <span v-if="data.createdAt" class="text-muted"
              >opened {{ formatRelativeTime(data.createdAt) }}</span
            >
          </header>
          <div class="px-4 py-3">
            <MarkdownBody :content="data.body ?? ''" empty="No description provided." />
          </div>
        </article>
        <CommentThread v-if="data.comments.length" :comments="data.comments" />

        <div v-if="canWrite" class="space-y-2">
          <MarkdownEditor
            v-model="commentDraft"
            placeholder="Leave a comment…"
            @submit="submitComment"
          />
          <div class="flex justify-end">
            <UButton
              icon="i-lucide-send"
              label="Comment"
              :loading="postingComment"
              :disabled="!commentDraft.trim()"
              @click="submitComment"
            />
          </div>
        </div>
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
        <p
          v-else
          class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted"
        >
          No commits to display.
        </p>
      </div>

      <div v-show="tab === 'files'">
        <div v-if="filesLoading" class="space-y-2">
          <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
        </div>
        <template v-else-if="files?.length">
          <DiffView :files="files" :commentable="canWrite" @comment="onDiffComment" />

          <div v-if="canWrite" class="mt-4 space-y-2 rounded-lg border border-default p-3">
            <p class="text-sm font-medium text-highlighted">Finish your review</p>
            <MarkdownEditor
              v-model="reviewDraft"
              :rows="3"
              placeholder="Review summary (optional for approvals)…"
            />
            <div class="flex flex-wrap gap-2">
              <UButton
                icon="i-lucide-check"
                color="success"
                variant="soft"
                label="Approve"
                :loading="reviewSubmitting === 'APPROVE'"
                :disabled="!!reviewSubmitting"
                @click="submitReview('APPROVE')"
              />
              <UButton
                icon="i-lucide-message-square"
                color="neutral"
                variant="soft"
                label="Comment"
                :loading="reviewSubmitting === 'COMMENT'"
                :disabled="!!reviewSubmitting || !reviewDraft.trim()"
                @click="submitReview('COMMENT')"
              />
              <UButton
                icon="i-lucide-file-warning"
                color="warning"
                variant="soft"
                label="Request changes"
                :loading="reviewSubmitting === 'REQUEST_CHANGES'"
                :disabled="!!reviewSubmitting || !reviewDraft.trim()"
                @click="submitReview('REQUEST_CHANGES')"
              />
            </div>
          </div>
        </template>
        <p
          v-else
          class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted"
        >
          No file changes to display.
        </p>
      </div>
    </template>
  </div>
</template>
