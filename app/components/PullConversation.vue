<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ForgeComment, ForgePullReview, ForgeTimelineEvent, ForgeUser } from '~/types/forge'
import {
  buildPullTimeline,
  filterTimeline,
  type PullConversationItem,
  type PullTimelineFilter
} from '~/utils/pull-conversation'
import { userHandle } from '~/utils/pull-review'

const props = withDefaults(
  defineProps<{
    comments: ForgeComment[]
    reviews: ForgePullReview[]
    events: ForgeTimelineEvent[]
    threadId?: string
    hasMore: boolean
    loading: boolean
    commentState: Record<string, { hasMore: boolean; loading: boolean; error: boolean }>
    error?: boolean
    canReply?: boolean
    reply: (reviewId: string, commentId: string, body: string) => Promise<boolean>
    /** The PR/MR author login, used to show an "Author" badge on comments. */
    authorLogin?: string
  }>(),
  { error: false, canReply: false, threadId: undefined, authorLogin: undefined }
)

const emit = defineEmits<{
  loadMore: []
  loadComments: [reviewId: string]
}>()

// --- Filter & Sort ---
const FILTER_OPTIONS: { label: string; value: PullTimelineFilter }[] = [
  { label: 'All activity', value: 'all' },
  { label: 'Comments only', value: 'comments' },
  { label: 'Reviews only', value: 'reviews' },
  { label: 'Threads only', value: 'threads' },
  { label: 'History only', value: 'history' }
]

const activeFilter = ref<PullTimelineFilter>('all')
const descending = ref(false)

const timeline = computed<PullConversationItem[]>(() =>
  buildPullTimeline(props.comments, props.reviews, props.events, descending.value)
)
const filtered = computed<PullConversationItem[]>(() =>
  filterTimeline(timeline.value, activeFilter.value)
)

// --- Author detection ---
function isAuthor(comment: ForgeComment): boolean {
  if (!props.authorLogin || !comment.author?.login) return false
  return comment.author.login === props.authorLogin
}

// --- Avatar for timeline marker ---
function authorFor(item: PullConversationItem): ForgeUser | undefined {
  if (item.kind === 'comment') return item.comment.author
  if (item.kind === 'review') return item.review.author
  if (item.kind === 'thread') return item.comment.author
  return item.event.actor
}

// --- Comment progress per review ---
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

// --- Lazy loading sentinels ---
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

// --- Reply handling (delegated to thread component via event bubbling) ---
async function handleReply(reviewId: string, commentId: string, body: string): Promise<void> {
  await props.reply(reviewId, commentId, body)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Filter / Sort bar -->
    <div v-if="timeline.length" class="flex items-center gap-2">
      <USelect
        v-model="activeFilter"
        :items="FILTER_OPTIONS"
        value-key="value"
        size="sm"
        class="w-40"
        :ui="{ base: 'cursor-pointer' }"
      />
      <UButton
        :icon="descending ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-narrow-wide'"
        :label="descending ? 'Newest first' : 'Oldest first'"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="`Sort ${descending ? 'descending' : 'ascending'}`"
        @click="descending = !descending"
      />
    </div>

    <!-- Timeline -->
    <ul class="pr-timeline" aria-label="conversation timeline">
      <li v-for="item in filtered" :key="item.key" class="pr-timeline-item">
        <!-- Timeline marker (avatar or icon) -->
        <div class="pr-timeline-marker">
          <template v-if="item.kind === 'event'">
            <!-- Events use their own icon in TimelineSystemNote -->
          </template>
          <UAvatar
            v-else-if="authorFor(item)?.avatarUrl"
            :src="authorFor(item)?.avatarUrl ?? undefined"
            :alt="userHandle(authorFor(item))"
            size="sm"
            class="rounded-full ring-2 ring-default"
          />
          <span
            v-else
            class="flex size-8 items-center justify-center rounded-full border border-default bg-elevated"
          >
            <UIcon name="i-lucide-user" class="size-4 text-muted" />
          </span>
        </div>

        <!-- Content -->
        <div class="pr-timeline-content">
          <!-- Comment -->
          <PullTimelineComment
            v-if="item.kind === 'comment'"
            :comment="item.comment"
            :thread-id="threadId"
            :is-author="isAuthor(item.comment)"
          />

          <!-- Review -->
          <template v-else-if="item.kind === 'review'">
            <PullTimelineReview
              :review="item.review"
              :comment-progress="commentProgress(item.review)"
              @load-comments="emit('loadComments', $event)"
            />
            <div :ref="(el) => setCommentSentinel(item.review.id, el)" class="h-px" />
          </template>

          <!-- Thread -->
          <PullTimelineThread
            v-else-if="item.kind === 'thread'"
            :review="item.review"
            :comment="item.comment"
            :can-reply="canReply"
            @reply="handleReply"
          />

          <!-- System event -->
          <PullTimelineSystemNote v-else-if="item.kind === 'event'" :event="item.event" />
        </div>
      </li>
    </ul>

    <!-- Empty / Loading / Error states -->
    <p v-if="timeline.length && !filtered.length" class="text-sm text-muted">
      No activity matches the current filter.
    </p>
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
  left: 15px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: color-mix(in srgb, var(--ui-border) 50%, transparent);
  border-radius: 1px;
}

.pr-timeline-item {
  position: relative;
  display: flex;
  gap: 0.75rem;
  padding-bottom: 1.5rem;
}

.pr-timeline-item:last-child {
  padding-bottom: 0;
}

.pr-timeline-marker {
  position: relative;
  z-index: 1;
  width: 2rem;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  flex-shrink: 0;
}

.pr-timeline-content {
  min-width: 0;
  flex: 1;
  padding-top: 0.125rem;
}
</style>
