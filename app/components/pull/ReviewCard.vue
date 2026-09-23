<script setup lang="ts">
import type { ForgePullReview, ForgePullReviewComment } from '~/types/forge'

const props = withDefaults(
  defineProps<{
    review: ForgePullReview
    threads: ForgePullReviewComment[]
    forgeLabel: string
    canReply?: boolean
    reply: (commentId: string, body: string) => Promise<boolean>
  }>(),
  { canReply: false }
)

const ACTIONS: Record<ForgePullReview['state'], string> = {
  APPROVED: 'approved these changes',
  CHANGES_REQUESTED: 'requested changes',
  COMMENTED: 'reviewed',
  PENDING: 'started a pending review',
  DISMISSED: 'left a review that was dismissed',
  UNKNOWN: 'reviewed'
}

const hasBody = computed(() => !!props.review.body?.trim())
const compact = computed(() => !hasBody.value && !props.threads.length)
</script>

<template>
  <div v-if="compact" class="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
    <UserLink :user="review.author" />
    <span class="text-muted">{{ ACTIONS[review.state] }}</span>
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
      :label="`View on ${forgeLabel}`"
      class="px-0"
    />
  </div>

  <article v-else class="overflow-hidden rounded-lg border border-default">
    <header
      class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-default bg-elevated/40 px-4 py-2 text-sm"
    >
      <UserLink :user="review.author" />
      <span class="text-muted">{{ ACTIONS[review.state] }}</span>
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
        :label="`View on ${forgeLabel}`"
        class="ml-auto px-0"
      />
    </header>

    <div v-if="hasBody" class="px-4 py-3">
      <MarkdownBody :content="review.body" />
    </div>

    <div
      v-if="threads.length"
      class="divide-y divide-default"
      :class="{ 'border-t border-default': hasBody }"
    >
      <PullReviewThread
        v-for="thread in threads"
        :key="thread.id"
        :thread="thread"
        :can-reply="canReply"
        :reply="reply"
      />
    </div>
  </article>
</template>
