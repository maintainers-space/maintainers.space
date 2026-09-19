<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ForgeComment, ForgePullReview, ForgeUser } from '~/types/forge'
import { buildPullTimeline, type PullConversationItem } from '~/utils/pull-conversation'
import {
  REVIEW_STATE_COLOR,
  REVIEW_STATE_ICON,
  commentLocation,
  reviewStateLabel,
  userHandle
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

const KIND_LABEL: Record<string, string> = {
  comment: 'Comments',
  review: 'Reviews',
  thread: 'Threads'
}
const enabled = ref<Set<string>>(new Set(['comment', 'review', 'thread']))
const filterOpen = ref(false)
const descending = ref(false)
const expandedDiffs = reactive(new Set<string>())

function toggleKind(kind: string): void {
  if (enabled.value.has(kind)) enabled.value.delete(kind)
  else enabled.value.add(kind)
  enabled.value = new Set(enabled.value)
}
function deselectAll(): void {
  enabled.value = new Set()
}
const allEnabled = computed(() =>
  ['comment', 'review', 'thread'].every((k) => enabled.value.has(k))
)

const timeline = computed<PullConversationItem[]>(() =>
  buildPullTimeline(props.comments, props.reviews, descending.value)
)
const filtered = computed<PullConversationItem[]>(() =>
  timeline.value.filter((item) => enabled.value.has(item.kind))
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

interface DiffLine {
  text: string
  add: boolean
  del: boolean
}
function diffLines(hunk?: string | null): DiffLine[] {
  if (!hunk) return []
  return hunk.split('\n').map((line): DiffLine => ({
    text: line,
    add: line.startsWith('+') && !line.startsWith('+++'),
    del: line.startsWith('-') && !line.startsWith('---')
  }))
}
const DIFF_PREVIEW = 5
function previewableLines(key: string, lines: DiffLine[]): DiffLine[] {
  if (expandedDiffs.has(key)) return lines
  return lines.slice(0, DIFF_PREVIEW)
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

function stateColorClass(state: string): string {
  const color = REVIEW_STATE_COLOR[state] ?? 'neutral'
  return color === 'success' ? 'text-success' : color === 'error' ? 'text-error' : 'text-default'
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="timeline.length" class="flex flex-wrap items-center gap-2">
      <UPopover v-model:open="filterOpen">
        <UButton
          :label="allEnabled ? 'All activity' : 'Filtered'"
          :aria-label="'Filter activity'"
          icon="i-lucide-sliders-horizontal"
          color="neutral"
          variant="ghost"
          size="sm"
        />
        <template #content>
          <div class="w-56 p-2">
            <div class="flex items-center justify-between px-1 pb-1.5">
              <p class="text-sm font-semibold text-highlighted">Filter activity</p>
              <UButton
                label="Deselect all"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="deselectAll"
              />
            </div>
            <div class="space-y-1 py-1">
              <label
                v-for="(label, kind) in KIND_LABEL"
                :key="kind"
                class="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-elevated/40"
              >
                <input
                  type="checkbox"
                  class="accent-primary"
                  :checked="enabled.has(kind)"
                  @change="toggleKind(kind)"
                />
                <span class="text-sm text-default">{{ label }}</span>
              </label>
            </div>
          </div>
        </template>
      </UPopover>
      <UButton
        :icon="descending ? 'i-lucide-arrow-down' : 'i-lucide-arrow-up'"
        color="neutral"
        variant="ghost"
        size="sm"
        :title="descending ? 'Newest first' : 'Oldest first'"
        :aria-label="`Sort ${descending ? 'descending' : 'ascending'}`"
        @click="descending = !descending"
      />
    </div>

    <ul class="pr-timeline" aria-label="conversation timeline">
      <li v-for="item in filtered" :key="item.key" class="pr-timeline-row">
        <div v-if="item.kind === 'review'" class="pr-timeline-icon">
          <span
            class="flex size-7 items-center justify-center rounded-full bg-elevated border border-default"
          >
            <UIcon
              :name="REVIEW_STATE_ICON[item.review.state] ?? 'i-lucide-circle'"
              :class="stateColorClass(item.review.state)"
              class="size-4.5"
            />
          </span>
        </div>
        <div v-else class="pr-timeline-avatar">
          <UAvatar
            v-if="authorFor(item)?.avatarUrl"
            :src="authorFor(item)?.avatarUrl ?? undefined"
            :alt="userHandle(authorFor(item))"
            size="md"
            class="rounded-full"
          />
        </div>

        <div class="pr-timeline-main">
          <template v-if="item.kind === 'review'">
            <p class="flex items-center gap-2 text-sm">
              <span class="sr-only">{{ reviewStateLabel(item.review.state) }}</span>
              <span class="font-semibold text-highlighted">{{
                userHandle(item.review.author)
              }}</span>
              <span class="text-muted ml-auto">{{ formatRelativeTime(item.at) }}</span>
            </p>
            <div v-if="item.review.body" class="pr-box mt-1">
              <MarkdownBody :content="item.review.body" />
            </div>
            <div :ref="(el) => setCommentSentinel(item.review.id, el)" class="mt-1">
              <p
                v-if="commentProgress(item.review).loading"
                class="text-xs text-muted"
                role="status"
              >
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
          </template>

          <div v-else class="pr-box" :class="item.kind === 'thread' ? 'pr-box-thread' : ''">
            <p class="pr-box-header">
              <span class="pr-box-author">{{ userHandle(item.comment.author) }}</span>
              <span class="pr-box-time">{{ formatRelativeTime(item.at) }}</span>
            </p>

            <template v-if="item.kind === 'thread'">
              <p class="pr-thread-path">{{ commentLocation(item.comment) }}</p>
              <div v-if="diffLines(item.comment.diffHunk).length" class="pr-diff">
                <div
                  v-for="(line, i) in previewableLines(item.key, diffLines(item.comment.diffHunk))"
                  :key="i"
                  class="pr-diff-line"
                  :class="{ 'text-success': line.add, 'text-error': line.del }"
                >
                  <span class="w-3.5 shrink-0 text-muted">{{
                    line.add ? '+' : line.del ? '-' : ''
                  }}</span>
                  <span class="min-w-0 break-all">{{
                    line.add || line.del ? line.text.slice(1) : line.text
                  }}</span>
                </div>
                <button
                  v-if="diffLines(item.comment.diffHunk).length > DIFF_PREVIEW"
                  type="button"
                  class="pr-diff-more"
                  @click="expandedDiffs.add(item.key)"
                >
                  Show {{ diffLines(item.comment.diffHunk).length - DIFF_PREVIEW }} more line{{
                    diffLines(item.comment.diffHunk).length - DIFF_PREVIEW === 1 ? '' : 's'
                  }}
                </button>
              </div>
              <div class="pr-body">
                <UBadge v-if="item.comment.isOutdated" color="warning" variant="subtle" size="xs"
                  >Outdated</UBadge
                >
                <MarkdownBody :content="item.comment.body" empty="No content." />
              </div>

              <div v-for="reply in item.comment.replies" :key="reply.id" class="pr-reply">
                <UAvatar
                  v-if="reply.author?.avatarUrl"
                  :src="reply.author.avatarUrl"
                  :alt="userHandle(reply.author)"
                  size="sm"
                  class="shrink-0 rounded-full"
                />
                <div class="min-w-0">
                  <p class="pr-box-header">
                    <span class="pr-box-author">{{
                      reply.author ? userHandle(reply.author) : ''
                    }}</span>
                    <span class="pr-box-time text-xs">{{
                      formatRelativeTime(reply.createdAt)
                    }}</span>
                  </p>
                  <div class="pr-body">
                    <MarkdownBody :content="reply.body" empty="No content." />
                  </div>
                </div>
              </div>
            </template>

            <div v-else class="pr-body">
              <MarkdownBody :content="item.comment.body" empty="No content." />
            </div>

            <div v-if="item.kind === 'thread'" class="pr-body">
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

            <ReactionBar
              v-if="item.kind === 'comment' && reactionTarget(item.comment.id)"
              :reactions="item.comment.reactions"
              :target="reactionTarget(item.comment.id)!"
            />
          </div>
        </div>
      </li>
    </ul>

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
  left: 1rem;
  top: 0;
  bottom: 0;
  width: 2px;
  background: color-mix(in srgb, var(--ui-border) 60%, transparent);
  border-radius: 1px;
}
.pr-timeline-row {
  position: relative;
  display: flex;
  gap: 1rem;
}
.pr-timeline-avatar,
.pr-timeline-icon {
  z-index: 1;
  width: 2rem;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  align-self: flex-start;
}
.pr-timeline-main {
  min-width: 0;
  width: 100%;
}
.pr-box {
  min-width: 0;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  overflow: hidden;
}
.pr-box-thread {
  background: color-mix(in srgb, var(--ui-bg-muted) 35%, transparent);
  border-color: var(--ui-border-muted);
}
.pr-box-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.pr-box-author {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  font-size: 0.875rem;
}
.pr-box-time {
  color: var(--ui-text-dimmed);
  font-size: 0.8125rem;
  margin-left: auto;
}
.pr-body {
  margin-top: 0.5rem;
}
.pr-thread-path {
  margin-top: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-dimmed);
}
.pr-diff {
  margin-top: 0.5rem;
  border: 1px solid var(--ui-border-muted);
  border-radius: 0.375rem;
  background: var(--ui-bg-muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  max-width: 100%;
  overflow-x: auto;
}
.pr-diff-line {
  display: flex;
  gap: 0.375rem;
  white-space: nowrap;
  padding: 0 0.5rem;
  line-height: 1.5;
}
.pr-diff-more {
  margin-top: 0.375rem;
  color: var(--ui-text-dimmed);
  font-size: 0.75rem;
  text-decoration: underline;
}
.pr-reply {
  display: flex;
  gap: 0.5rem;
  margin-left: 1.25rem;
  margin-top: 0.625rem;
}
</style>
