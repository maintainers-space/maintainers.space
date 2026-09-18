<script setup lang="ts">
import type {
  ForgeCommit,
  ForgeFileDiff,
  ForgePullDetail,
  ForgePullReview,
  ForgePullReviewComment
} from '~/types/forge'
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
    if (!forge.value?.getPull) return null
    return await forge.value.getPull(locator.value, id.value)
  },
  { lazy: true, watch: [() => route.fullPath] }
)

const { get: getToken } = useForgeTokens()
const toast = useToast()
const canWrite = computed(() => !!getToken(provider.value) && !!forge.value?.createComment)

const tab = useRouteTab('tab', ['conversation', 'commits', 'files'] as const, 'conversation')
const showInfo = ref(false)

const files = ref<ForgeFileDiff[] | null>(null)
const filesLoading = ref(false)
const commits = ref<ForgeCommit[] | null>(null)
const commitsLoading = ref(false)
const reviews = ref<ForgePullReview[]>([])
const reviewsCursor = ref<string>()
const reviewsLoaded = ref(false)
const reviewsLoading = ref(false)
const reviewsError = ref(false)
const reviewCommentState = reactive<
  Record<string, { cursor?: string; initialized: boolean; loading: boolean; error: boolean }>
>({})
const isOnline = useOnline()
let requestGeneration = 0
// Bumped on every write that invalidates the review cache so an in-flight fetch
// started before the write can never append or repopulate a stale page.
let reviewEpoch = 0

watch(
  itemKey,
  () => {
    requestGeneration++
    reviewEpoch++
    files.value = null
    filesLoading.value = false
    commits.value = null
    commitsLoading.value = false
    reviews.value = []
    reviewsCursor.value = undefined
    reviewsLoaded.value = false
    reviewsLoading.value = false
    reviewsError.value = false
    for (const reviewId of Object.keys(reviewCommentState)) delete reviewCommentState[reviewId]
  },
  { immediate: true }
)

async function ensureFiles(): Promise<void> {
  const currentForge = forge.value
  if (files.value || filesLoading.value || !currentForge?.getPullFiles) return
  const generation = requestGeneration
  const currentKey = itemKey.value
  const currentLocator = locator.value
  const currentId = id.value
  const persist = !meta.value?.isPrivate
  filesLoading.value = true
  try {
    const key = `${currentKey}:files`
    if (!persist) invalidate(key)
    const result = await cached(key, () => currentForge.getPullFiles!(currentLocator, currentId), {
      ttl: TTL.MEDIUM,
      persist
    })
    if (generation === requestGeneration) files.value = result
  } catch {
    if (generation === requestGeneration) files.value = []
  } finally {
    if (generation === requestGeneration) filesLoading.value = false
  }
}

async function ensureCommits(): Promise<void> {
  const currentForge = forge.value
  if (commits.value || commitsLoading.value || !currentForge?.getPullCommits) return
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
      () => currentForge.getPullCommits!(currentLocator, currentId),
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

const reviewsHaveMore = computed(() => !reviewsLoaded.value && !reviewsError.value)
const reviewsSupported = computed(() => !!forge.value?.listPullReviews)
const reviewCommentProgress = computed(() =>
  Object.fromEntries(
    Object.entries(reviewCommentState).map(([reviewId, state]) => [
      reviewId,
      {
        hasMore: (!state.initialized || !!state.cursor) && !state.error,
        loading: state.loading,
        error: state.error
      }
    ])
  )
)

// Review cache keys embed the epoch so a fetch that started before a mutation
// wrote to the cache can never surface as the post-mutation value.
function reviewCacheKey(cursor?: string): string {
  return `${itemKey.value}:reviews:${reviewEpoch}:${cursor ?? 'first'}`
}

function reviewCommentCacheKey(reviewId: string, cursor?: string): string {
  return `${itemKey.value}:review:${reviewId}:comments:${reviewEpoch}:${cursor ?? 'first'}`
}

async function ensureReviews(): Promise<void> {
  const currentForge = forge.value
  if (
    reviewsLoading.value ||
    (reviewsLoaded.value && !reviewsCursor.value) ||
    !currentForge?.listPullReviews
  ) {
    return
  }
  const generation = requestGeneration
  const epoch = reviewEpoch
  const currentLocator = locator.value
  const currentId = id.value
  const cursor = reviewsCursor.value
  const persist = !meta.value?.isPrivate
  reviewsLoading.value = true
  try {
    const key = reviewCacheKey(cursor)
    if (!persist) invalidate(key)
    const page = await cached(
      key,
      () => currentForge.listPullReviews!(currentLocator, currentId, { cursor, limit: 10 }),
      { ttl: TTL.MEDIUM, persist }
    )
    if (generation !== requestGeneration || epoch !== reviewEpoch) return
    reviewsError.value = false
    reviews.value.push(...page.items)
    reviewsCursor.value = page.cursor
    reviewsLoaded.value = !page.cursor
  } catch {
    if (generation === requestGeneration && epoch === reviewEpoch) reviewsError.value = true
  } finally {
    if (generation === requestGeneration && epoch === reviewEpoch) reviewsLoading.value = false
  }
}

function findReviewComment(
  comments: ForgePullReviewComment[],
  commentId: string
): ForgePullReviewComment | undefined {
  for (const comment of comments) {
    if (comment.id === commentId) return comment
    const reply = findReviewComment(comment.replies ?? [], commentId)
    if (reply) return reply
  }
  return undefined
}

function appendReviewComments(review: ForgePullReview, incoming: ForgePullReviewComment[]): void {
  for (const comment of incoming) {
    if (findReviewComment(review.comments, comment.id)) continue
    const parent = comment.replyToId
      ? findReviewComment(review.comments, comment.replyToId)
      : undefined
    if (parent) (parent.replies ??= []).push(comment)
    else review.comments.push(comment)
  }
}

async function ensureReviewComments(reviewId: string): Promise<void> {
  const currentForge = forge.value
  const state = (reviewCommentState[reviewId] ??= {
    initialized: false,
    loading: false,
    error: false
  })
  if (
    state.loading ||
    (state.initialized && !state.cursor) ||
    !currentForge?.listPullReviewComments
  ) {
    return
  }
  const review = reviews.value.find((item) => item.id === reviewId)
  if (!review) return
  const generation = requestGeneration
  const epoch = reviewEpoch
  const currentLocator = locator.value
  const currentId = id.value
  const cursor = state.cursor
  const persist = !meta.value?.isPrivate
  state.loading = true
  try {
    const key = reviewCommentCacheKey(reviewId, cursor)
    if (!persist) invalidate(key)
    const page = await cached(
      key,
      () =>
        currentForge.listPullReviewComments!(currentLocator, currentId, reviewId, {
          cursor,
          limit: 30
        }),
      { ttl: TTL.MEDIUM, persist }
    )
    if (generation !== requestGeneration || epoch !== reviewEpoch) return
    state.error = false
    appendReviewComments(review, page.items)
    state.cursor = page.cursor
    state.initialized = true
  } catch {
    if (generation === requestGeneration && epoch === reviewEpoch) state.error = true
  } finally {
    if (generation === requestGeneration && epoch === reviewEpoch) state.loading = false
  }
}

function resetReviews(): void {
  // Bump the epoch before clearing so any review fetch already in flight is
  // discarded (guarded by epoch in ensureReviews/ensureReviewComments) rather
  // than appending its stale page or repopulating the cache under a new key.
  reviewEpoch++
  // Drop every cached page for this pull's reviews and their threads so a fresh
  // reload reflects the just-posted review or reply.
  invalidate(`${itemKey.value}:reviews:`, true)
  invalidate(`${itemKey.value}:review:`, true)
  reviews.value = []
  reviewsCursor.value = undefined
  reviewsLoaded.value = false
  reviewsLoading.value = false
  reviewsError.value = false
  for (const reviewId of Object.keys(reviewCommentState)) delete reviewCommentState[reviewId]
}

// A pull is not complete offline without its changed files and commits. Fetch
// them after the conversation has rendered rather than making a user open both
// tabs. The work remains cache-backed and is never attempted while offline.
watch(
  data,
  (pull) => {
    if (pull && isOnline.value) {
      void ensureFiles()
      void ensureCommits()
      void ensureReviews()
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
  () => !!getToken(provider.value) && !!forge.value?.createPullReviewReply
)

async function submitComment(): Promise<void> {
  if (!forge.value?.createComment || !commentDraft.value.trim()) return
  postingComment.value = true
  try {
    await forge.value.createComment(locator.value, id.value, commentDraft.value)
    commentDraft.value = ''
    toast.add({ title: 'Comment posted', color: 'success', icon: 'i-lucide-check' })
    await refresh()
  } catch (e) {
    const hint = describeForgeError(e)
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
    resetReviews()
  } catch (e) {
    const hint = describeForgeError(e)
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
  if (!forge.value?.createReview) return
  try {
    await forge.value.createReview(locator.value, id.value, {
      event: 'COMMENT',
      comments: [{ path: payload.path, line: payload.line, body: payload.body }]
    })
    toast.add({ title: 'Comment added to the diff', color: 'success', icon: 'i-lucide-check' })
    resetReviews()
  } catch (e) {
    const hint = describeForgeError(e)
    toast.add({
      title: 'Could not add comment',
      description: hint.description,
      color: 'error',
      icon: 'i-lucide-circle-alert',
      actions: hint.to ? [{ label: hint.linkLabel, to: hint.to, target: '_blank' }] : undefined
    })
  }
}

// Returns whether the reply posted, so PullReviewList can keep the draft open
// and editable when a network error means the user's text shouldn't be lost.
async function replyToReviewThread(
  reviewId: string,
  commentId: string,
  body: string
): Promise<boolean> {
  if (!forge.value?.createPullReviewReply || !body.trim()) return false
  try {
    const reply = await forge.value.createPullReviewReply(locator.value, id.value, commentId, body)
    const review = reviews.value.find((item) => item.id === reviewId)
    if (review) appendReviewComments(review, [reply])
    toast.add({ title: 'Reply posted', color: 'success', icon: 'i-lucide-check' })
    return true
  } catch (e) {
    const hint = describeForgeError(e)
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
          <UButton
            v-if="tab !== 'files'"
            icon="i-lucide-info"
            label="Details"
            color="neutral"
            variant="ghost"
            size="sm"
            class="ml-auto lg:hidden"
            :aria-expanded="showInfo"
            @click="showInfo = !showInfo"
          />
        </div>
      </div>

      <UTabs v-model="tab" :items="tabItems" :content="false" size="sm" />

      <div
        :class="
          tab === 'files' ? '' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-6 items-start'
        "
      >
        <div class="min-w-0">
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
              <ReactionBar
                :reactions="data.reactions"
                :target="{ kind: 'pull', threadId: data.id }"
              />
            </article>
            <PullConversation
              v-if="
                data.comments.length ||
                (reviewsSupported && (reviews.length || reviewsLoading || reviewsError))
              "
              :comments="data.comments"
              :reviews="reviews"
              :thread-id="data.id"
              :has-more="reviewsSupported && reviewsHaveMore"
              :loading="reviewsSupported && reviewsLoading"
              :error="reviewsSupported && reviewsError"
              :comment-state="reviewCommentProgress"
              :can-reply="canReplyToReviewThreads"
              :reply="replyToReviewThread"
              @load-more="ensureReviews"
              @load-comments="ensureReviewComments"
            />

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
        </div>
        <div v-if="tab !== 'files'" :class="[showInfo ? 'block' : 'hidden', 'lg:block', 'min-w-0']">
          <PullMetadata
            :pull="data"
            :reviews="reviews"
            :reviews-complete="!reviewsSupported || reviewsLoaded"
            :provider-label="forge?.label ?? 'the forge'"
          />
        </div>
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
