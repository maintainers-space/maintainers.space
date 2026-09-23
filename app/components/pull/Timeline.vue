<script setup lang="ts">
import type { ForgeComment, ForgePullReview, ForgePullReviewComment } from '~/types/forge'
import {
  arrangePullTimeline,
  buildPullTimeline,
  PULL_TIMELINE_FILTERS,
  PULL_TIMELINE_SORTS,
  type PullTimelineEntry
} from '~/lib/pull-timeline'

const props = withDefaults(
  defineProps<{
    pullId: string
    comments: ForgeComment[]
    reviews: ForgePullReview[]
    threads: ForgePullReviewComment[]
    reviewsSupported: boolean
    reviewsStatus: 'idle' | 'pending' | 'success' | 'error'
    forgeLabel: string
    canReply?: boolean
    reply: (commentId: string, body: string) => Promise<boolean>
  }>(),
  { canReply: false }
)

const emit = defineEmits<{ retry: [] }>()

defineSlots<{ composer?: () => unknown }>()

const filter = useRouteTab('activity', PULL_TIMELINE_FILTERS, 'all')
const sort = useRouteTab('sort', PULL_TIMELINE_SORTS, 'oldest')

const filterItems = [
  { label: 'All activity', value: 'all', icon: 'i-lucide-list' },
  { label: 'Comments only', value: 'comments', icon: 'i-lucide-message-square' },
  { label: 'Reviews only', value: 'reviews', icon: 'i-lucide-file-search' }
]

const sortItems = [
  { label: 'Oldest first', value: 'oldest', icon: 'i-lucide-arrow-up-narrow-wide' },
  { label: 'Newest first', value: 'newest', icon: 'i-lucide-arrow-down-wide-narrow' }
]

const loading = computed(
  () =>
    props.reviewsSupported && (props.reviewsStatus === 'idle' || props.reviewsStatus === 'pending')
)

const activeFilter = computed(() => (props.reviewsSupported ? filter.value : 'all'))

const entries = computed(() =>
  arrangePullTimeline(
    buildPullTimeline(props.comments, props.reviews, props.threads),
    activeFilter.value,
    sort.value
  )
)

const emptyMessage = computed(() => {
  if (activeFilter.value === 'comments') return 'No comments yet.'
  if (activeFilter.value === 'reviews') return 'No reviews yet.'
  return 'No activity yet.'
})

const REVIEW_MARKERS: Record<ForgePullReview['state'], { icon: string; class: string }> = {
  APPROVED: { icon: 'i-lucide-check', class: 'text-success border-success/40 bg-success/10' },
  CHANGES_REQUESTED: {
    icon: 'i-lucide-file-diff',
    class: 'text-warning border-warning/40 bg-warning/10'
  },
  COMMENTED: { icon: 'i-lucide-eye', class: 'text-muted border-default bg-default' },
  PENDING: { icon: 'i-lucide-clock', class: 'text-muted border-default bg-default' },
  DISMISSED: { icon: 'i-lucide-circle-slash', class: 'text-muted border-default bg-default' },
  UNKNOWN: { icon: 'i-lucide-eye', class: 'text-muted border-default bg-default' }
}

function marker(entry: PullTimelineEntry): { icon: string; class: string } {
  if (entry.kind === 'review') return REVIEW_MARKERS[entry.review.state]
  if (entry.kind === 'thread') {
    return { icon: 'i-lucide-file-code', class: 'text-muted border-default bg-default' }
  }
  return { icon: 'i-lucide-message-square', class: 'text-muted border-default bg-default' }
}
</script>

<template>
  <section aria-labelledby="pull-activity-heading" class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="pull-activity-heading" class="text-base font-semibold text-highlighted">Activity</h2>
      <div class="flex flex-wrap items-center gap-2">
        <USelect
          v-if="reviewsSupported"
          v-model="filter"
          :items="filterItems"
          value-key="value"
          size="sm"
          aria-label="Filter activity"
          class="w-40"
        />
        <USelect
          v-model="sort"
          :items="sortItems"
          value-key="value"
          size="sm"
          aria-label="Sort activity"
          class="w-36"
        />
      </div>
    </div>

    <slot v-if="sort === 'newest'" name="composer" />

    <UAlert
      v-if="reviewsStatus === 'error'"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Couldn't load reviews"
      description="Comments are shown, but reviews and inline threads are missing."
      :actions="[
        {
          label: 'Retry',
          icon: 'i-lucide-refresh-cw',
          color: 'neutral',
          variant: 'soft',
          onClick: () => emit('retry')
        }
      ]"
    />

    <div v-if="loading" class="space-y-4" role="status" aria-label="Loading activity">
      <div v-for="i in 3" :key="i" class="flex gap-3">
        <USkeleton class="size-7 shrink-0 rounded-full" />
        <USkeleton class="h-24 flex-1" />
      </div>
    </div>

    <ol v-else-if="entries.length" class="space-y-4">
      <li v-for="(entry, index) in entries" :key="entry.key" class="relative flex gap-3">
        <span
          v-if="index < entries.length - 1"
          aria-hidden="true"
          class="absolute top-7 -bottom-4 left-3.5 w-px -translate-x-1/2 bg-accented"
        />
        <span
          aria-hidden="true"
          class="relative flex size-7 shrink-0 items-center justify-center rounded-full border"
          :class="marker(entry).class"
        >
          <UIcon :name="marker(entry).icon" class="size-3.5" />
        </span>
        <div class="min-w-0 flex-1">
          <CommentCard
            v-if="entry.kind === 'comment'"
            :comment="entry.comment"
            thread-kind="pull"
            :thread-id="pullId"
          />
          <PullReviewCard
            v-else-if="entry.kind === 'review'"
            :review="entry.review"
            :threads="entry.threads"
            :forge-label="forgeLabel"
            :can-reply="canReply"
            :reply="reply"
          />
          <article v-else class="overflow-hidden rounded-lg border border-default">
            <PullReviewThread :thread="entry.thread" :can-reply="canReply" :reply="reply" />
          </article>
        </div>
      </li>
    </ol>

    <p
      v-else
      class="rounded-lg border border-dashed border-default py-8 text-center text-sm text-muted"
    >
      {{ emptyMessage }}
    </p>

    <slot v-if="sort === 'oldest'" name="composer" />
  </section>
</template>
