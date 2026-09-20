<script setup lang="ts">
import type { ForgePullReview } from '~/types/forge'
import { userHandle, REVIEW_STATE_LABEL } from '~/utils/pull-review'

const props = defineProps<{
  review: ForgePullReview
  commentProgress?: { hasMore: boolean; loading: boolean; error: boolean }
}>()

const emit = defineEmits<{
  loadComments: [reviewId: string]
}>()

const stateLabel = computed(() => REVIEW_STATE_LABEL[props.review.state] ?? 'reviewed')
</script>

<template>
  <div class="space-y-3">
    <!-- Header: vertically aligned inline text -->
    <div class="flex items-center gap-1.5 py-1 text-sm">
      <span class="font-medium text-default">{{ userHandle(review.author) }}</span>
      <span class="text-muted">{{ stateLabel }}</span>
      <span
        v-if="review.submittedAt"
        class="shrink-0 text-muted"
        :title="formatDate(review.submittedAt)"
      >
        {{ formatRelativeTime(review.submittedAt) }}
      </span>
      <UIcon
        v-if="commentProgress?.loading"
        name="i-lucide-loader-2"
        class="ml-1 size-3.5 animate-spin text-muted"
        title="Loading threads..."
      />
    </div>

    <!-- Optional Review Body -->
    <article
      v-if="review.body"
      class="overflow-hidden rounded-lg border border-default bg-elevated/20"
    >
      <div class="p-3">
        <MarkdownBody :content="review.body" />
      </div>
    </article>

    <!-- Global review state error -->
    <div v-if="commentProgress?.error" class="flex items-center gap-2 text-xs text-error">
      <span>Failed to load threads.</span>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        @click="emit('loadComments', review.id)"
      />
    </div>
  </div>
</template>
