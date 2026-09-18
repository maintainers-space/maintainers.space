<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ForgePullReview, ForgePullReviewComment } from '~/types/forge'

const props = defineProps<{
  reviews: ForgePullReview[]
  hasMore: boolean
  loading: boolean
  commentState: Record<string, { hasMore: boolean; loading: boolean }>
  canReply?: boolean
}>()

const emit = defineEmits<{
  loadMore: []
  loadComments: [reviewId: string]
  reply: [reviewId: string, commentId: string, body: string]
}>()

// A review with no in-memory state yet must be treated as "has more to load",
// otherwise its comments would never be requested in the first place.
function commentProgress(review: ForgePullReview): { hasMore: boolean; loading: boolean } {
  const state = props.commentState[review.id]
  return { hasMore: !state || state.hasMore, loading: !!state?.loading }
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
      { rootMargin: '400px 0px' }
    )
  )
}

onBeforeUnmount(() => {
  for (const observer of commentObservers.values()) observer.stop()
})

const replyTo = ref<{ reviewId: string; commentId: string } | null>(null)
const replyDraft = ref('')

function openReply(reviewId: string, commentId: string): void {
  replyTo.value = { reviewId, commentId }
  replyDraft.value = ''
}

function cancelReply(): void {
  replyTo.value = null
  replyDraft.value = ''
}

function submitReply(): void {
  if (!replyTo.value || !replyDraft.value.trim()) return
  emit('reply', replyTo.value.reviewId, replyTo.value.commentId, replyDraft.value)
  cancelReply()
}

function stateLabel(state: ForgePullReview['state']): string {
  return (
    {
      APPROVED: 'approved these changes',
      CHANGES_REQUESTED: 'requested changes',
      COMMENTED: 'reviewed',
      PENDING: 'has a pending review',
      DISMISSED: 'had this review dismissed',
      UNKNOWN: 'reviewed'
    }[state] ?? 'reviewed'
  )
}

function stateColor(state: ForgePullReview['state']): 'success' | 'warning' | 'neutral' {
  if (state === 'APPROVED') return 'success'
  if (state === 'CHANGES_REQUESTED') return 'warning'
  return 'neutral'
}

function commentLabel(comment: ForgePullReviewComment): string {
  return comment.line ? `${comment.path}, line ${comment.line}` : comment.path
}
</script>

<template>
  <section aria-labelledby="reviews-heading" class="space-y-4">
    <h2 id="reviews-heading" class="text-base font-semibold text-highlighted">Reviews</h2>

    <article
      v-for="review in reviews"
      :key="review.id"
      class="overflow-hidden rounded-lg border border-default"
    >
      <header
        class="flex flex-wrap items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2 text-sm"
      >
        <UserLink :user="review.author" />
        <span class="text-muted">{{ stateLabel(review.state) }}</span>
        <UBadge :color="stateColor(review.state)" variant="subtle" size="xs">
          {{ review.state.replaceAll('_', ' ').toLowerCase() }}
        </UBadge>
        <span v-if="review.submittedAt" class="text-muted">
          {{ formatRelativeTime(review.submittedAt) }}
        </span>
        <UButton
          v-if="review.url"
          :to="review.url"
          target="_blank"
          color="neutral"
          variant="link"
          size="xs"
          trailing-icon="i-lucide-external-link"
          label="View on GitHub"
          class="ml-auto"
        />
      </header>

      <div v-if="review.body" class="px-4 py-3">
        <MarkdownBody :content="review.body" />
      </div>

      <div v-if="review.comments.length" class="divide-y divide-default border-t border-default">
        <section
          v-for="comment in review.comments"
          :key="comment.id"
          :aria-label="`Review thread on ${commentLabel(comment)}`"
          class="space-y-3 px-4 py-3"
        >
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <UserLink :user="comment.author" />
            <span class="font-mono text-xs text-muted">{{ commentLabel(comment) }}</span>
            <UBadge v-if="comment.isOutdated" color="warning" variant="subtle" size="xs">
              Outdated
            </UBadge>
            <span v-if="comment.createdAt" class="text-muted">
              commented {{ formatRelativeTime(comment.createdAt) }}
            </span>
          </div>
          <MarkdownBody :content="comment.body" empty="No content." />

          <div
            v-for="reply in comment.replies"
            :key="reply.id"
            class="border-l-2 border-default pl-3"
          >
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <UserLink :user="reply.author" />
              <span v-if="reply.createdAt" class="text-muted">
                replied {{ formatRelativeTime(reply.createdAt) }}
              </span>
            </div>
            <MarkdownBody :content="reply.body" empty="No content." class="pt-1.5" />
          </div>

          <template v-if="canReply">
            <MarkdownEditor
              v-if="replyTo?.reviewId === review.id && replyTo.commentId === comment.id"
              v-model="replyDraft"
              :rows="3"
              :aria-label="`Reply to review thread on ${commentLabel(comment)}`"
              placeholder="Reply to this thread…"
              @submit="submitReply"
            />
            <div class="flex gap-2">
              <UButton
                v-if="replyTo?.reviewId !== review.id || replyTo.commentId !== comment.id"
                icon="i-lucide-reply"
                label="Reply"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="openReply(review.id, comment.id)"
              />
              <template v-else>
                <UButton
                  icon="i-lucide-send"
                  label="Reply"
                  size="xs"
                  :disabled="!replyDraft.trim()"
                  @click="submitReply"
                />
                <UButton
                  label="Cancel"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="cancelReply"
                />
              </template>
            </div>
          </template>
        </section>
      </div>

      <p
        v-else-if="commentProgress(review).loading"
        class="border-t border-default px-4 py-3 text-sm text-muted"
        role="status"
      >
        Loading review threads…
      </p>
      <p
        v-else-if="!commentProgress(review).hasMore"
        class="border-t border-default px-4 py-3 text-sm text-muted"
      >
        No inline comments.
      </p>
      <div
        v-if="commentProgress(review).hasMore"
        :ref="(element) => setCommentSentinel(review.id, element)"
        aria-hidden="true"
        class="h-px"
      />
    </article>

    <p v-if="loading" class="text-sm text-muted" role="status">Loading more reviews…</p>
    <p v-else-if="reviews.length && !hasMore" class="text-sm text-muted">All reviews loaded.</p>
    <div v-if="hasMore" ref="reviewsSentinel" aria-hidden="true" class="h-px" />
  </section>
</template>
