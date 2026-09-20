<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ForgeComment, ForgePullReview, ForgeTimelineEvent, ForgeUser } from '~/types/forge'
import {
  buildPullTimeline,
  filterTimeline,
  type PullConversationItem
} from '~/utils/pull-conversation'
import { userHandle, REVIEW_STATE_ICON, REVIEW_STATE_COLOR } from '~/utils/pull-review'

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
const FILTER_OPTIONS: { label: string; value: PullConversationItem['kind'] }[] = [
  { label: 'Comments', value: 'comment' },
  { label: 'Reviews', value: 'review' },
  { label: 'Threads', value: 'thread' },
  { label: 'System Notes', value: 'event' }
]

const activeFilters = ref<PullConversationItem['kind'][]>(['comment', 'review', 'thread', 'event'])
const descending = ref(false)

const timeline = computed<PullConversationItem[]>(() =>
  buildPullTimeline(props.comments, props.reviews, props.events, descending.value)
)
const filtered = computed<PullConversationItem[]>(() =>
  filterTimeline(timeline.value, activeFilters.value)
)

// --- Author detection ---
function isAuthor(comment: ForgeComment): boolean {
  if (!props.authorLogin || !comment.author?.login) return false
  return comment.author.login === props.authorLogin
}

// --- Marker data ---
function authorFor(item: PullConversationItem): ForgeUser | undefined {
  if (item.kind === 'comment') return item.comment.author
  if (item.kind === 'review') return item.review.author
  if (item.kind === 'thread') return item.comment.author
  return item.event.actor
}

const EVENT_ICON: Record<string, string> = {
  labeled: 'i-lucide-tag',
  unlabeled: 'i-lucide-tag',
  assigned: 'i-lucide-user-plus',
  unassigned: 'i-lucide-user-minus',
  review_requested: 'i-lucide-eye',
  review_request_removed: 'i-lucide-eye-off',
  milestoned: 'i-lucide-milestone',
  demilestoned: 'i-lucide-milestone',
  renamed: 'i-lucide-pencil',
  base_changed: 'i-lucide-git-branch',
  head_ref_force_pushed: 'i-lucide-git-commit-horizontal',
  committed: 'i-lucide-git-commit-horizontal',
  merged: 'i-lucide-git-merge',
  closed: 'i-lucide-circle-slash',
  reopened: 'i-lucide-circle-dot',
  ready_for_review: 'i-lucide-circle-dot',
  converted_to_draft: 'i-lucide-git-pull-request-draft',
  other: 'i-lucide-activity'
}

const EVENT_COLOR: Record<string, string> = {
  merged: 'text-primary',
  closed: 'text-error',
  reopened: 'text-success',
  ready_for_review: 'text-success'
}

function stateColorClass(state: string): string {
  const color = REVIEW_STATE_COLOR[state] ?? 'neutral'
  return color === 'success' ? 'text-success' : color === 'error' ? 'text-error' : 'text-muted'
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
        // Eagerly trigger load if the sentinel is on screen
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

// --- Reply handling ---
async function handleReply(reviewId: string, commentId: string, body: string): Promise<void> {
  await props.reply(reviewId, commentId, body)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Filter / Sort bar -->
    <div v-if="timeline.length" class="flex items-center gap-2">
      <USelectMenu
        v-model="activeFilters"
        :options="FILTER_OPTIONS"
        value-key="value"
        multiple
        placeholder="Filter activity..."
        size="sm"
        class="w-64"
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
    <ul class="relative pb-4" aria-label="conversation timeline">
      <!-- The global timeline line -->
      <div class="absolute bottom-0 left-[1.125rem] top-2 z-0 border-l-2 border-default/40" />

      <li v-for="item in filtered" :key="item.key" class="relative z-10 flex gap-4 py-3">
        <!-- Marker Column (perfectly aligned with line) -->
        <div class="mt-1 flex w-9 shrink-0 justify-center">
          <!-- System Note Icon -->
          <span
            v-if="item.kind === 'event'"
            class="flex size-7 items-center justify-center rounded-full border border-default bg-elevated"
          >
            <UIcon
              :name="EVENT_ICON[item.event.kind] ?? 'i-lucide-activity'"
              :class="EVENT_COLOR[item.event.kind] ?? 'text-muted'"
              class="size-3.5"
            />
          </span>
          <!-- Review Icon (only if no body, like GitLab system notes) -->
          <span
            v-else-if="item.kind === 'review' && !item.review.body"
            class="flex size-7 items-center justify-center rounded-full border border-default bg-elevated"
          >
            <UIcon
              :name="REVIEW_STATE_ICON[item.review.state] ?? 'i-lucide-circle'"
              :class="stateColorClass(item.review.state)"
              class="size-3.5"
            />
          </span>
          <!-- Avatar for comments, threads, and reviews with body -->
          <UAvatar
            v-else-if="authorFor(item)?.avatarUrl"
            :src="authorFor(item)?.avatarUrl ?? undefined"
            :alt="userHandle(authorFor(item))"
            size="sm"
            class="bg-body"
          />
          <span
            v-else
            class="flex size-8 items-center justify-center rounded-full border border-default bg-elevated"
          >
            <UIcon name="i-lucide-user" class="size-4 text-muted" />
          </span>
        </div>

        <!-- Content Column -->
        <div class="min-w-0 flex-1">
          <PullTimelineComment
            v-if="item.kind === 'comment'"
            :comment="item.comment"
            :thread-id="threadId"
            :is-author="isAuthor(item.comment)"
          />

          <template v-else-if="item.kind === 'review'">
            <PullTimelineReview
              :review="item.review"
              :comment-progress="commentState[item.review.id]"
              @load-comments="emit('loadComments', $event)"
            />
            <div :ref="(el) => setCommentSentinel(item.review.id, el)" class="h-px" />
          </template>

          <PullTimelineThread
            v-else-if="item.kind === 'thread'"
            :review="item.review"
            :comment="item.comment"
            :can-reply="canReply"
            @reply="handleReply"
          />

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
