<script setup lang="ts">
import type { Review, ReviewComment } from 'forges'
import type { ReviewConversation } from '~/lib/pull-timeline'

const props = withDefaults(
  defineProps<{
    review: Review
    conversations: ReviewConversation[]
    forgeLabel: string
    canReply?: boolean
    reply: (comment: ReviewComment, body: string) => Promise<boolean>
  }>(),
  { canReply: false }
)

const ACTIONS: Record<Review['state'], string> = {
  approved: 'approved these changes',
  changes_requested: 'requested changes',
  commented: 'reviewed',
  pending: 'started a pending review',
  dismissed: 'left a review that was dismissed',
  unknown: 'reviewed'
}

const hasBody = computed(() => !!props.review.body?.trim())
const compact = computed(() => !hasBody.value && !props.conversations.length)
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
      v-if="conversations.length"
      class="divide-y divide-default"
      :class="{ 'border-t border-default': hasBody }"
    >
      <PullReviewThread
        v-for="conversation in conversations"
        :key="conversation.id"
        :conversation="conversation"
        :can-reply="canReply"
        :reply="reply"
      />
    </div>
  </article>
</template>
