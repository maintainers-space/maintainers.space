<script setup lang="ts">
import type { ForgeCommit, ForgeFileDiff, ForgePullDetail } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'
import { cached, invalidate, TTL } from '~/lib/cache'

const route = useRoute()
const { provider, owner, name, forge, locator, meta } = useRepoContext()
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)
const id = computed(() => String(route.params.id))

const offline = useOfflineRepos()
const watchItem = offline.watch
const itemKey = computed(() => `pull:${provider.value}:${owner.value}:${name.value}:${id.value}`)

// Any pull you open is remembered so it can be kept offline once its repo is.
watch(
  itemKey,
  (k) => {
    const [, , , , iid] = k.split(':')
    if (iid) {
      watchItem('pull', provider.value, owner.value, name.value, iid)
      void offline.auto()
    }
  },
  { immediate: true }
)

const { data, pending, error, refresh } = useLiveAsyncData<ForgePullDetail | null>(
  () => itemKey.value,
  async () => {
    if (!forge.value?.features.pullRead?.getPull) return null
    return await forge.value.features.pullRead!.getPull!(locator.value, id.value)
  },
  { lazy: true, watch: [() => route.fullPath] }
)

const { get: getToken } = useForgeTokens()
const toast = useToast()
const canWrite = computed(
  () => !!getToken(provider.value) && !!forge.value?.features.write?.createComment
)

const tab = useRouteTab('tab', ['conversation', 'commits', 'files'] as const, 'conversation')

const files = ref<ForgeFileDiff[] | null>(null)
const filesLoading = ref(false)
const commits = ref<ForgeCommit[] | null>(null)
const commitsLoading = ref(false)
const isOnline = useOnline()
let requestGeneration = 0
const {
  reviews,
  threads: reviewThreads,
  status: reviewsStatus,
  supported: reviewsSupported,
  load: loadReviews,
  reload: reloadReviews,
  addReply: addReviewReply
} = usePullReviews(itemKey, id)

watch(
  itemKey,
  () => {
    requestGeneration++
    files.value = null
    filesLoading.value = false
    commits.value = null
    commitsLoading.value = false
  },
  { immediate: true }
)

async function ensureFiles(): Promise<void> {
  const currentForge = forge.value
  if (files.value || filesLoading.value || !currentForge?.features.pullRead?.getPullFiles) return
  const generation = requestGeneration
  const currentKey = itemKey.value
  const currentLocator = locator.value
  const currentId = id.value
  const persist = !meta.value?.isPrivate
  filesLoading.value = true
  try {
    const key = `${currentKey}:files`
    if (!persist) invalidate(key)
    const result = await cached(
      key,
      () => currentForge.features.pullRead!.getPullFiles!(currentLocator, currentId),
      {
        ttl: TTL.MEDIUM,
        persist
      }
    )
    if (generation === requestGeneration) files.value = result
  } catch {
    if (generation === requestGeneration) files.value = []
  } finally {
    if (generation === requestGeneration) filesLoading.value = false
  }
}

async function ensureCommits(): Promise<void> {
  const currentForge = forge.value
  if (commits.value || commitsLoading.value || !currentForge?.features.pullRead?.getPullCommits)
    return
  const generation = requestGeneration
  const currentKey = itemKey.value
  const currentLocator = locator.value
  const currentId = id.value
  const persist = !meta.value?.isPrivate
  commitsLoading.value = true
  try {
    const key = `${currentKey}:commits`
    if (!persist) invalidate(key)
    const result = await cached(
      key,
      () => currentForge.features.pullRead!.getPullCommits!(currentLocator, currentId),
      {
        ttl: TTL.MEDIUM,
        persist
      }
    )
    if (generation === requestGeneration) commits.value = result
  } catch {
    if (generation === requestGeneration) commits.value = []
  } finally {
    if (generation === requestGeneration) commitsLoading.value = false
  }
}

// A pull is not complete offline without its changed files and commits. Fetch
// them after the conversation has rendered rather than making a user open both
// tabs. The work remains cache-backed and is never attempted while offline.
watch(
  data,
  (pull) => {
    if (!pull) return
    void loadReviews()
    if (isOnline.value) {
      void ensureFiles()
      void ensureCommits()
    }
  },
  { immediate: true }
)

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
  {
    label: 'Files changed',
    icon: 'i-lucide-file-diff',
    value: 'files',
    ui: { trigger: 'pr-files-trigger' }
  }
])

const commentDraft = ref('')
const postingComment = ref(false)
const reviewDraft = ref('')
const reviewSubmitting = ref<'' | 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'>('')
const canReplyToReviewThreads = computed(
  () => !!getToken(provider.value) && !!forge.value?.features.write?.createPullReviewReply
)

// Writes prefer a repo-scoped token when the user added one to bypass org OAuth restrictions.
const writeOpts = () => ({
  token: getToken(provider.value, `${locator.value.owner}/${locator.value.name}`)
})

async function submitComment(): Promise<void> {
  if (!forge.value?.features.write?.createComment || !commentDraft.value.trim()) return
  postingComment.value = true
  try {
    await forge.value.features.write!.createComment!(
      locator.value,
      id.value,
      commentDraft.value,
      writeOpts()
    )
    commentDraft.value = ''
    toast.add({ title: 'Comment posted', color: 'success', icon: 'i-lucide-check' })
    await refresh()
  } catch (e) {
    const hint = describeForgeError(e, {
      provider: unref(provider),
      owner: unref(locator)?.owner,
      name: unref(locator)?.name
    })
    toast.add({
      title: 'Could not post comment',
      description: hint.description,
      color: 'error',
      icon: 'i-lucide-circle-alert',
      actions: hint.to ? [{ label: hint.linkLabel, to: hint.to, target: '_blank' }] : undefined
    })
  } finally {
    postingComment.value = false
  }
}

async function submitReview(event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'): Promise<void> {
  if (!forge.value?.features.write?.createReview) return
  reviewSubmitting.value = event
  try {
    await forge.value.features.write!.createReview!(
      locator.value,
      id.value,
      {
        event,
        body: reviewDraft.value || undefined
      },
      writeOpts()
    )
    reviewDraft.value = ''
    toast.add({ title: 'Review submitted', color: 'success', icon: 'i-lucide-check' })
    await refresh()
    void reloadReviews()
  } catch (e) {
    const hint = describeForgeError(e, {
      provider: unref(provider),
      owner: unref(locator)?.owner,
      name: unref(locator)?.name
    })
    toast.add({
      title: 'Could not submit review',
      description: hint.description,
      color: 'error',
      icon: 'i-lucide-circle-alert',
      actions: hint.to ? [{ label: hint.linkLabel, to: hint.to, target: '_blank' }] : undefined
    })
  } finally {
    reviewSubmitting.value = ''
  }
}

async function onDiffComment(payload: { path: string; line: number; body: string }): Promise<void> {
  if (!forge.value?.features.write?.createReview) return
  try {
    await forge.value.features.write!.createReview!(
      locator.value,
      id.value,
      {
        event: 'COMMENT',
        comments: [{ path: payload.path, line: payload.line, body: payload.body }]
      },
      writeOpts()
    )
    toast.add({ title: 'Comment added to the diff', color: 'success', icon: 'i-lucide-check' })
    void reloadReviews()
  } catch (e) {
    const hint = describeForgeError(e, {
      provider: unref(provider),
      owner: unref(locator)?.owner,
      name: unref(locator)?.name
    })
    toast.add({
      title: 'Could not add comment',
      description: hint.description,
      color: 'error',
      icon: 'i-lucide-circle-alert',
      actions: hint.to ? [{ label: hint.linkLabel, to: hint.to, target: '_blank' }] : undefined
    })
  }
}

// Returns whether the reply posted, so the thread keeps its draft open and
// editable when a network error means the user's text shouldn't be lost.
async function replyToReviewThread(commentId: string, body: string): Promise<boolean> {
  if (!forge.value?.features.write?.createPullReviewReply || !body.trim()) return false
  try {
    const reply = await forge.value.features.write!.createPullReviewReply!(
      locator.value,
      id.value,
      commentId,
      body,
      writeOpts()
    )
    addReviewReply(reply)
    toast.add({ title: 'Reply posted', color: 'success', icon: 'i-lucide-check' })
    return true
  } catch (e) {
    const hint = describeForgeError(e, {
      provider: unref(provider),
      owner: unref(locator)?.owner,
      name: unref(locator)?.name
    })
    toast.add({
      title: 'Could not post reply',
      description: hint.description,
      color: 'error',
      icon: 'i-lucide-circle-alert',
      actions: hint.to ? [{ label: hint.linkLabel, to: hint.to, target: '_blank' }] : undefined
    })
    return false
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
      :label="`All ${pullsTerm(provider, { plural: true })}`"
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
      :title="`Could not load ${pullsTerm(provider)}`"
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

      <UTabs v-model="tab" :items="tabItems" :content="false" size="sm" />

      <div v-show="tab === 'conversation'" class="@container">
        <div
          class="flex flex-col gap-4 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_16rem] @3xl:gap-x-6"
        >
          <article class="overflow-hidden rounded-lg border border-default @3xl:col-start-1">
            <header
              class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2 text-sm"
            >
              <UserLink :user="data.author" />
              <span v-if="data.createdAt" class="text-muted"
                >opened {{ formatRelativeTime(data.createdAt) }}</span
              >
              <UPopover :content="{ align: 'end' }">
                <UButton
                  icon="i-lucide-info"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  aria-label="Pull request details"
                  class="ms-auto @3xl:hidden"
                />
                <template #content>
                  <PullMetadata
                    :pull="data"
                    :reviews="reviews"
                    :reviews-supported="reviewsSupported"
                    :reviews-status="reviewsStatus"
                    class="max-h-[min(70vh,32rem)] w-72 overflow-y-auto"
                  />
                </template>
              </UPopover>
            </header>
            <div class="px-4 py-3">
              <MarkdownBody :content="data.body ?? ''" empty="No description provided." />
            </div>
            <ReactionBar
              :reactions="data.reactions"
              :target="{ kind: 'pull', threadId: data.id }"
            />
          </article>
          <aside
            aria-label="Pull request details"
            class="hidden [contain:size] @3xl:col-start-2 @3xl:row-start-1 @3xl:block"
          >
            <PullMetadata
              :pull="data"
              :reviews="reviews"
              :reviews-supported="reviewsSupported"
              :reviews-status="reviewsStatus"
              class="sticky top-4 rounded-lg border border-default bg-default"
            />
          </aside>
          <PullTimeline
            class="@3xl:col-start-1"
            :pull-id="data.id"
            :comments="data.comments"
            :reviews="reviews"
            :threads="reviewThreads"
            :reviews-supported="reviewsSupported"
            :reviews-status="reviewsStatus"
            :forge-label="forge?.label ?? provider"
            :can-reply="canReplyToReviewThreads"
            :reply="replyToReviewThread"
            @retry="loadReviews"
          >
            <template v-if="canWrite" #composer>
              <div class="space-y-2">
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
            </template>
          </PullTimeline>
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

<style>
/* The redundant +/− stat used to sit in the Files changed tab heading. Now that
   it lives in the tab body, selecting the tab settles its label into place with
   a brief nudge instead of a hard jump. The animation restarts each time the
   tab is activated (data-state flips back to "active"). The `.pr-files-trigger`
   class is unique to this page's Files changed tab. */
.pr-files-trigger[data-state='active'] [data-slot='label'] {
  animation: pr-files-settle 0.25s ease-out;
}

@keyframes pr-files-settle {
  from {
    transform: translateX(-2px);
    opacity: 0.75;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
