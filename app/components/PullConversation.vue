<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type {
  ForgeComment,
  ForgePullReview,
  ForgePullReviewComment,
  ForgeUser
} from '~/types/forge'
import { buildPullTimeline, type PullConversationItem } from '~/utils/pull-conversation'
import {
  REVIEW_STATE_COLOR,
  REVIEW_STATE_ICON,
  commentLocation,
  reviewStateLabel
} from '~/utils/pull-review'

const props = withDefaults(
  defineProps<{
    comments: ForgeComment[]
    reviews: ForgePullReview[]
    threadId?: string
    hasMore: boolean
    loading: boolean
    commentState: Record<string, { hasMore: boolean; loading: boolean; error: boolean }>
    error?: boolean
    canReply?: boolean
    reply: (reviewId: string, commentId: string, body: string) => Promise<boolean>
  }>(),
  { error: false, canReply: false, threadId: undefined }
)

const emit = defineEmits<{
  loadMore: []
  loadComments: [reviewId: string]
}>()

const FILTERS = [
  { value: 'all', label: 'All activity' },
  { value: 'comment', label: 'Comments' },
  { value: 'review', label: 'Reviews' },
  { value: 'thread', label: 'Threads' }
] as const
const filter = ref<(typeof FILTERS)[number]['value']>('all')
const filterOpen = ref(false)

function selectFilter(value: (typeof FILTERS)[number]['value']): void {
  filter.value = value
  filterOpen.value = false
}
const descending = ref(false)

const timeline = computed<PullConversationItem[]>(() =>
  buildPullTimeline(props.comments, props.reviews, descending.value)
)
const filtered = computed<PullConversationItem[]>(() =>
  filter.value === 'all'
    ? timeline.value
    : timeline.value.filter((item) => item.kind === filter.value)
)

function authorFor(item: PullConversationItem): ForgeUser | undefined {
  if (item.kind === 'comment') return item.comment.author
  if (item.kind === 'review') return item.review.author
  return item.comment.author
}

function reactionTarget(commentId: string) {
  if (!props.threadId) return undefined
  return { kind: 'pull' as const, threadId: props.threadId, commentId }
}

function commentProgress(review: ForgePullReview): {
  hasMore: boolean
  loading: boolean
  error: boolean
} {
  const state = props.commentState[review.id]
  return {
    hasMore: !state || state.hasMore,
    loading: !!state?.loading,
    error: !!state?.error
  }
}

const reviewsSentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(
  reviewsSentinel,
  ([entry]) => {
    if (entry?.isIntersecting && props.hasMore && !props.loading) emit('loadMore')
  },
  { rootMargin: '600px 0px' }
)

const commentObservers = new Map<string, ReturnType<typeof useIntersectionObserver>>()

function setCommentSentinel(
  reviewId: string,
  element: Element | ComponentPublicInstance | null
): void {
  commentObservers.get(reviewId)?.stop()
  commentObservers.delete(reviewId)
  if (!element || !(element instanceof HTMLElement)) return
  commentObservers.set(
    reviewId,
    useIntersectionObserver(
      element,
      ([entry]) => {
        const state = props.commentState[reviewId]
        if (entry?.isIntersecting && (!state || state.hasMore) && !state?.loading) {
          emit('loadComments', reviewId)
        }
      },
      { rootMargin: '600px 0px' }
    )
  )
}

onBeforeUnmount(() => {
  for (const observer of commentObservers.values()) observer.stop()
})

const replyTo = ref<{ reviewId: string; commentId: string } | null>(null)
const replyDraft = ref('')
const postingReply = ref(false)

function openReply(reviewId: string, commentId: string): void {
  replyTo.value = { reviewId, commentId }
  replyDraft.value = ''
}

function cancelReply(): void {
  replyTo.value = null
  replyDraft.value = ''
  postingReply.value = false
}

async function submitReply(): Promise<void> {
  if (!replyTo.value || !replyDraft.value.trim() || postingReply.value) return
  const { reviewId, commentId } = replyTo.value
  const body = replyDraft.value
  postingReply.value = true
  try {
    const posted = await props.reply(reviewId, commentId, body)
    if (
      posted &&
      replyTo.value?.reviewId === reviewId &&
      replyTo.value.commentId === commentId &&
      replyDraft.value === body
    ) {
      cancelReply()
    }
  } finally {
    postingReply.value = false
  }
}

function stateIcon(state: string): string {
  return REVIEW_STATE_ICON[state] ?? 'i-lucide-circle'
}
function stateColorClass(state: string): string {
  const color = REVIEW_STATE_COLOR[state] ?? 'neutral'
  return color === 'success' ? 'text-success' : color === 'error' ? 'text-error' : 'text-muted'
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="timeline.length" class="flex flex-wrap items-center gap-2">
      <UPopover v-model:open="filterOpen">
        <UButton
          :label="FILTERS.find((f) => f.value === filter)?.label ?? 'All activity'"
          :aria-label="'Filter activity'"
          icon="i-lucide-sliders-horizontal"
          color="neutral"
          variant="ghost"
          size="sm"
        />
        <template #content>
          <ul class="space-y-0.5 p-1">
            <li v-for="f in FILTERS" :key="f.value">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm"
                :class="
                  filter === f.value
                    ? 'bg-elevated/70 text-highlighted'
                    : 'text-default hover:bg-elevated/40'
                "
                @click="selectFilter(f.value)"
              >
                <UIcon
                  v-if="filter === f.value"
                  name="i-lucide-check"
                  class="size-3.5 text-muted"
                />
                <span>{{ f.label }}</span>
              </button>
            </li>
          </ul>
        </template>
      </UPopover>

      <UButton
        :icon="descending ? 'i-lucide-arrow-down' : 'i-lucide-arrow-up'"
        :label="descending ? 'Newest first' : 'Oldest first'"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="descending = !descending"
      />
    </div>

    <ul class="pr-timeline space-y-3" aria-label="conversation timeline">
      <li
        v-for="item in filtered"
        :key="item.key"
        class="pr-timeline-entry"
        :aria-label="`${item.kind} by ${userLabel(authorFor(item))}`"
      >
        <div class="pr-timeline-avatar">
          <UAvatar
            v-if="authorFor(item)?.avatarUrl"
            :src="authorFor(item)?.avatarUrl ?? undefined"
            :alt="userLabel(authorFor(item))"
            size="md"
            class="rounded-full"
          />
          <span
            v-else
            class="rounded-full border-2 border-default bg-elevated/40"
            aria-hidden="true"
          />
        </div>

        <div class="pr-timeline-main min-w-0">
          <header class="flex flex-wrap items-center gap-2 text-sm">
            <UserLink :user="authorFor(item)" :avatar="false" />
            <template v-if="item.kind === 'review'">
              <UIcon
                :name="stateIcon(item.review.state)"
                :class="stateColorClass(item.review.state)"
                :title="reviewStateLabel(item.review.state)"
                class="size-4 shrink-0"
                aria-hidden="true"
              />
              <span class="sr-only">{{ reviewStateLabel(item.review.state) }}</span>
            </template>
            <span v-if="item.at" class="text-muted">· {{ formatRelativeTime(item.at) }}</span>
          </header>

          <div v-if="item.kind === 'review' && item.review.body" class="pr-timeline-body">
            <MarkdownBody :content="item.review.body" />
          </div>

          <div v-if="item.kind === 'comment'" class="pr-timeline-body">
            <MarkdownBody :content="item.comment.body" empty="No content." />
          </div>

          <div v-if="item.kind === 'thread'">
            <p class="pr-timeline-anchor text-xs font-mono text-muted">
              {{ commentLocation(item.comment) }}
            </p>
            <div class="pr-timeline-body">
              <UBadge
                v-if="item.comment.isOutdated"
                color="warning"
                variant="subtle"
                size="xs"
                class="mb-1"
              >
                Outdated
              </UBadge>
              <MarkdownBody :content="item.comment.body" empty="No content." />
            </div>

            <div v-for="reply in item.comment.replies" :key="reply.id" class="pr-timeline-reply">
              <header class="flex items-center gap-2 text-sm">
                <UIcon name="i-lucide-reply" class="size-4 text-muted" aria-hidden="true" />
                <UserLink :user="reply.author" :avatar="false" />
                <span v-if="reply.createdAt" class="text-muted">
                  · {{ formatRelativeTime(reply.createdAt) }}
                </span>
              </header>
              <div class="pr-timeline-body">
                <MarkdownBody :content="reply.body" empty="No content." />
              </div>
            </div>

            <div v-if="canReply" class="pr-timeline-body">
              <MarkdownEditor
                v-if="replyTo?.reviewId === item.review.id && replyTo.commentId === item.comment.id"
                v-model="replyDraft"
                :rows="3"
                :aria-label="`Reply to review thread on ${commentLocation(item.comment)}`"
                placeholder="Reply to this thread…"
                @submit="submitReply"
              />
              <div class="flex gap-2">
                <UButton
                  v-if="
                    replyTo?.reviewId !== item.review.id || replyTo.commentId !== item.comment.id
                  "
                  icon="i-lucide-reply"
                  label="Reply"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="openReply(item.review.id, item.comment.id)"
                />
                <template v-else>
                  <UButton
                    icon="i-lucide-send"
                    label="Reply"
                    size="xs"
                    :loading="postingReply"
                    :disabled="postingReply || !replyDraft.trim()"
                    @click="submitReply"
                  />
                  <UButton
                    label="Cancel"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="postingReply"
                    @click="cancelReply"
                  />
                </template>
              </div>
            </div>
          </div>

          <ReactionBar
            v-if="item.kind === 'comment' && reactionTarget(item.comment.id)"
            :reactions="item.comment.reactions"
            :target="reactionTarget(item.comment.id)!"
          />

          <div
            v-if="item.kind === 'review'"
            :ref="(el) => setCommentSentinel(item.review.id, el)"
            class="border-t border-default/60 pt-1"
          >
            <p v-if="commentProgress(item.review).loading" class="text-xs text-muted" role="status">
              Loading threads…
            </p>
            <div
              v-else-if="commentProgress(item.review).error"
              class="flex items-center gap-2 text-xs text-muted"
            >
              <span>Couldn't load the review threads.</span>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-refresh-cw"
                label="Retry"
                @click="emit('loadComments', item.review.id)"
              />
            </div>
            <UButton
              v-else-if="commentProgress(item.review).hasMore"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-plus"
              label="Load more threads"
              @click="emit('loadComments', item.review.id)"
            />
          </div>
        </div>
      </li>
    </ul>

    <p v-if="loading" class="text-sm text-muted" role="status">Loading more reviews…</p>
    <div v-else-if="error" class="flex items-center gap-2 text-sm text-muted">
      <span>Couldn't load reviews.</span>
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-lucide-refresh-cw"
        label="Retry"
        @click="emit('loadMore')"
      />
    </div>
    <div v-if="hasMore" ref="reviewsSentinel" aria-hidden="true" class="h-px" />
  </div>
</template>

<style scoped>
.pr-timeline {
  position: relative;
}
.pr-timeline::before {
  content: '';
  position: absolute;
  left: 1rem;
  top: 0;
  bottom: 0;
  width: 2px;
  background: color-mix(in srgb, var(--ui-border) 60%, transparent);
  border-radius: 1px;
}
.pr-timeline-entry {
  position: relative;
  display: flex;
  gap: 1rem;
}
.pr-timeline-avatar {
  z-index: 1;
  width: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pr-timeline-main {
  width: 100%;
}
.pr-timeline-body {
  margin-top: 0.125rem;
}
.pr-timeline-anchor {
  margin-top: 0.125rem;
}
.pr-timeline-reply {
  display: flex;
  gap: 0.5rem;
  border-inline-start: 2px solid var(--ui-border);
  padding-inline-start: 0.5rem;
  margin-top: 0.5rem;
}
</style>
