<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ForgeComment, ForgePullReview } from '~/types/forge'
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

const timeline = computed<PullConversationItem[]>(() =>
  buildPullTimeline(props.comments, props.reviews)
)

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
      { rootMargin: '400px 0px' }
    )
  )
}

onBeforeUnmount(() => {
  for (const observer of commentObservers.values()) observer.stop()
})

// Per-review expand/collapse of its inline threads, open by default.
const threadsOpen = reactive<Record<string, boolean>>({})
function isThreadsOpen(reviewId: string): boolean {
  return threadsOpen[reviewId] ?? true
}
function toggleThreads(reviewId: string): void {
  threadsOpen[reviewId] = !isThreadsOpen(reviewId)
}

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
function reviewThreadsLabel(review: ForgePullReview): string {
  const n = review.comments.length
  return `${n} thread${n === 1 ? '' : 's'}`
}
</script>

<template>
  <section class="space-y-4" :aria-label="`${timeline.length} conversation events`">
    <template v-for="item in timeline" :key="item.key">
      <!-- Top-level comment -->
      <article
        v-if="item.kind === 'comment'"
        class="overflow-hidden rounded-lg border border-default"
      >
        <header
          class="flex items-center gap-2 px-4 py-2 text-sm bg-elevated/40 border-b border-default"
        >
          <UIcon name="i-lucide-message-square" class="size-4 text-muted" aria-hidden="true" />
          <UserLink :user="item.comment.author" />
          <span v-if="item.comment.createdAt" class="text-muted ml-auto">
            {{ formatRelativeTime(item.comment.createdAt) }}
          </span>
        </header>
        <div class="px-4 py-3">
          <MarkdownBody :content="item.comment.body" empty="No content." />
        </div>
        <div
          v-if="item.comment.replies?.length"
          class="divide-y divide-default border-t border-default"
        >
          <div v-for="reply in item.comment.replies" :key="reply.id">
            <header class="flex items-center gap-2 px-4 pt-3 text-sm">
              <UIcon name="i-lucide-reply" class="size-4 text-muted" aria-hidden="true" />
              <UserLink :user="reply.author" />
              <span v-if="reply.createdAt" class="text-muted ml-auto">
                {{ formatRelativeTime(reply.createdAt) }}
              </span>
            </header>
            <div class="px-4 py-1.5">
              <MarkdownBody :content="reply.body" empty="No content." />
            </div>
          </div>
        </div>
        <ReactionBar
          v-if="reactionTarget(item.comment.id)"
          :reactions="item.comment.reactions"
          :target="reactionTarget(item.comment.id)!"
        />
      </article>

      <!-- Submitted review with its grouped inline threads -->
      <article v-else class="overflow-hidden rounded-lg border border-default">
        <header
          class="flex items-center gap-2 px-4 py-2 text-sm bg-elevated/40 border-b border-default"
        >
          <UIcon
            :name="stateIcon(item.review.state)"
            :class="stateColorClass(item.review.state)"
            :title="reviewStateLabel(item.review.state)"
            class="size-4 shrink-0"
            aria-hidden="true"
          />
          <span class="sr-only">{{ reviewStateLabel(item.review.state) }}</span>
          <UserLink :user="item.review.author" />
          <span v-if="item.review.submittedAt" class="text-muted ml-auto">
            {{ formatRelativeTime(item.review.submittedAt) }}
          </span>
        </header>

        <div v-if="item.review.body" class="px-4 py-3">
          <MarkdownBody :content="item.review.body" />
        </div>

        <div
          v-if="
            item.review.comments.length ||
            commentProgress(item.review).loading ||
            commentProgress(item.review).error ||
            commentProgress(item.review).hasMore
          "
          class="border-t border-default"
        >
          <button
            v-if="item.review.comments.length"
            type="button"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted hover:bg-elevated/60"
            :aria-expanded="isThreadsOpen(item.review.id)"
            @click="toggleThreads(item.review.id)"
          >
            <UIcon
              :name="
                isThreadsOpen(item.review.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
              "
              class="size-3.5 shrink-0"
            />
            <span>{{ isThreadsOpen(item.review.id) ? 'Collapse' : 'Expand' }}</span>
            <span class="ml-auto">{{ reviewThreadsLabel(item.review) }}</span>
          </button>

          <template v-if="isThreadsOpen(item.review.id)">
            <div class="space-y-2 px-2 pb-2">
              <section
                v-for="comment in item.review.comments"
                :key="comment.id"
                :aria-label="`Review thread on ${commentLocation(comment)}`"
                class="overflow-hidden rounded-md border border-default/70"
              >
                <div class="flex items-center gap-2 px-3 py-2 text-sm">
                  <UIcon
                    name="i-lucide-message-square"
                    class="size-4 text-muted"
                    aria-hidden="true"
                  />
                  <UserLink :user="comment.author" />
                  <span v-if="comment.createdAt" class="text-muted ml-auto">
                    {{ formatRelativeTime(comment.createdAt) }}
                  </span>
                </div>
                <div class="px-3 py-1.5">
                  <p class="text-xs font-mono text-muted">{{ commentLocation(comment) }}</p>
                  <UBadge
                    v-if="comment.isOutdated"
                    color="warning"
                    variant="subtle"
                    size="xs"
                    class="mt-1"
                  >
                    Outdated
                  </UBadge>
                  <MarkdownBody class="mt-1" :content="comment.body" empty="No content." />
                </div>

                <div
                  v-for="reply in comment.replies"
                  :key="reply.id"
                  class="border-t border-default/60"
                >
                  <header class="flex items-center gap-2 px-3 pt-2.5 text-sm">
                    <UIcon name="i-lucide-reply" class="size-4 text-muted" aria-hidden="true" />
                    <UserLink :user="reply.author" />
                    <span v-if="reply.createdAt" class="text-muted ml-auto">
                      {{ formatRelativeTime(reply.createdAt) }}
                    </span>
                  </header>
                  <div class="px-3 py-1.5">
                    <MarkdownBody :content="reply.body" empty="No content." />
                  </div>
                </div>

                <div v-if="canReply" class="border-t border-default/60">
                  <div class="px-3 pt-1">
                    <MarkdownEditor
                      v-if="
                        replyTo?.reviewId === item.review.id && replyTo.commentId === comment.id
                      "
                      v-model="replyDraft"
                      :rows="3"
                      :aria-label="`Reply to review thread on ${commentLocation(comment)}`"
                      placeholder="Reply to this thread…"
                      @submit="submitReply"
                    />
                    <div class="flex gap-2">
                      <UButton
                        v-if="
                          replyTo?.reviewId !== item.review.id || replyTo.commentId !== comment.id
                        "
                        icon="i-lucide-reply"
                        label="Reply"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        @click="openReply(item.review.id, comment.id)"
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
              </section>
            </div>

            <p
              v-if="commentProgress(item.review).loading"
              class="px-4 py-3 text-sm text-muted"
              role="status"
            >
              Loading review threads…
            </p>

            <div
              v-if="commentProgress(item.review).error"
              class="flex items-center gap-2 px-4 py-3 text-sm text-muted"
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

            <p
              v-if="
                !item.review.comments.length &&
                !commentProgress(item.review).hasMore &&
                !commentProgress(item.review).loading &&
                !commentProgress(item.review).error
              "
              class="px-4 py-3 text-sm text-muted"
            >
              No inline comments.
            </p>

            <div
              v-if="commentProgress(item.review).hasMore && !commentProgress(item.review).loading"
              :ref="(element) => setCommentSentinel(item.review.id, element)"
              aria-hidden="true"
              class="h-px"
            />
          </template>
        </div>
      </article>
    </template>

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
  </section>
</template>
