<script setup lang="ts">
import type { ForgePullReview } from '~/types/forge'
import { REVIEW_STATE_COLOR, REVIEW_STATE_ICON, reviewStateLabel } from '~/utils/pull-review'

defineProps<{
  review: ForgePullReview
  commentProgress: { hasMore: boolean; loading: boolean; error: boolean }
}>()

const emit = defineEmits<{
  loadComments: [reviewId: string]
}>()

function stateColorClass(state: string): string {
  const color = REVIEW_STATE_COLOR[state] ?? 'neutral'
  return color === 'success' ? 'text-success' : color === 'error' ? 'text-error' : 'text-muted'
}
</script>

<template>
  <div class="space-y-2">
    <!-- Review header: compact one-liner with icon -->
    <div class="flex items-center gap-3 py-1">
      <span
        class="flex size-7 shrink-0 items-center justify-center rounded-full border border-default bg-elevated"
      >
        <UIcon
          :name="REVIEW_STATE_ICON[review.state] ?? 'i-lucide-circle'"
          :class="stateColorClass(review.state)"
          class="size-4"
        />
      </span>

      <p class="min-w-0 text-sm">
        <UserLink v-if="review.author" :user="review.author" class="font-medium text-highlighted" />
        <span class="ml-1 text-muted">{{ reviewStateLabel(review.state) }}</span>
        <span v-if="review.submittedAt" class="ml-2 text-xs text-dimmed">{{
          formatRelativeTime(review.submittedAt)
        }}</span>
      </p>
    </div>

    <!-- Review body (optional — only shown when the reviewer wrote a summary) -->
    <article v-if="review.body" class="ml-10 overflow-hidden rounded-lg border border-default">
      <div class="px-4 py-3">
        <MarkdownBody :content="review.body" />
      </div>
    </article>

    <!-- Thread loading sentinel -->
    <div class="ml-10">
      <p v-if="commentProgress.loading" class="text-xs text-muted" role="status">
        Loading threads…
      </p>
      <div v-else-if="commentProgress.error" class="flex items-center gap-2 text-xs text-muted">
        <span>Couldn't load the review threads.</span>
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-lucide-refresh-cw"
          label="Retry"
          @click="emit('loadComments', review.id)"
        />
      </div>
      <UButton
        v-else-if="commentProgress.hasMore"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-plus"
        label="Load more threads"
        @click="emit('loadComments', review.id)"
      />
    </div>
  </div>
</template>
