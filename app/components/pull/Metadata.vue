<script setup lang="ts">
import type { ForgePullDetail, ForgePullReview } from '~/types/forge'
import { summarizePullReviews, type PullReviewerState } from '~/lib/pull-metadata'

const props = defineProps<{
  pull: ForgePullDetail
  reviews: ForgePullReview[]
  reviewsSupported: boolean
  reviewsStatus: 'idle' | 'pending' | 'success' | 'error'
}>()

const id = useId()

const summary = computed(() => summarizePullReviews(props.reviews, props.pull.author?.login))

const reviewsLoading = computed(
  () => props.reviewsStatus === 'idle' || props.reviewsStatus === 'pending'
)

const REVIEWER_STATES: Record<PullReviewerState, { icon: string; class: string; label: string }> = {
  APPROVED: { icon: 'i-lucide-check', class: 'text-success', label: 'Approved' },
  CHANGES_REQUESTED: {
    icon: 'i-lucide-file-diff',
    class: 'text-warning',
    label: 'Requested changes'
  },
  COMMENTED: { icon: 'i-lucide-message-square', class: 'text-muted', label: 'Commented' },
  DISMISSED: { icon: 'i-lucide-circle-slash', class: 'text-muted', label: 'Review dismissed' }
}

const closed = computed(() =>
  props.pull.mergedAt
    ? { label: 'Merged', at: props.pull.mergedAt }
    : props.pull.closedAt
      ? { label: 'Closed', at: props.pull.closedAt }
      : null
)
</script>

<template>
  <div class="divide-y divide-default text-sm">
    <section v-if="reviewsSupported" :aria-labelledby="`${id}-reviewers`" class="px-4 py-3">
      <h2 :id="`${id}-reviewers`" class="font-semibold text-highlighted">Reviewers</h2>
      <div v-if="reviewsLoading" class="mt-2 space-y-2" role="status" aria-label="Loading reviews">
        <USkeleton v-for="i in 2" :key="i" class="h-5 w-3/4" />
      </div>
      <p v-else-if="reviewsStatus === 'error'" class="mt-2 text-muted">Couldn't load reviews.</p>
      <p v-else-if="!summary.reviewers.length" class="mt-2 text-muted">No reviews yet.</p>
      <ul v-else class="mt-2 space-y-1.5">
        <li
          v-for="reviewer in summary.reviewers"
          :key="reviewer.key"
          class="flex min-w-0 items-center justify-between gap-2"
        >
          <UserLink :user="reviewer.user" class="min-w-0" />
          <UIcon
            :name="REVIEWER_STATES[reviewer.state].icon"
            :class="REVIEWER_STATES[reviewer.state].class"
            class="size-4 shrink-0"
            aria-hidden="true"
          />
          <span class="sr-only">{{ REVIEWER_STATES[reviewer.state].label }}</span>
        </li>
      </ul>
    </section>

    <section :aria-labelledby="`${id}-labels`" class="px-4 py-3">
      <h2 :id="`${id}-labels`" class="font-semibold text-highlighted">Labels</h2>
      <div v-if="pull.labels?.length" class="mt-2 flex flex-wrap gap-1.5">
        <UBadge
          v-for="label in pull.labels"
          :key="label.name"
          :label="label.name"
          :title="label.description ?? undefined"
          color="neutral"
          variant="subtle"
          size="xs"
          class="rounded-full"
        />
      </div>
      <p v-else class="mt-2 text-muted">None yet.</p>
    </section>

    <section :aria-labelledby="`${id}-about`" class="px-4 py-3">
      <h2 :id="`${id}-about`" class="font-semibold text-highlighted">About</h2>
      <dl class="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <template v-if="pull.author">
          <dt class="text-muted">Author</dt>
          <dd class="min-w-0"><UserLink :user="pull.author" /></dd>
        </template>
        <template v-if="pull.createdAt">
          <dt class="text-muted">Created</dt>
          <dd>
            <time :datetime="pull.createdAt" :title="formatDate(pull.createdAt)">
              {{ formatRelativeTime(pull.createdAt) }}
            </time>
          </dd>
        </template>
        <template v-if="pull.updatedAt">
          <dt class="text-muted">Updated</dt>
          <dd>
            <time :datetime="pull.updatedAt" :title="formatDate(pull.updatedAt)">
              {{ formatRelativeTime(pull.updatedAt) }}
            </time>
          </dd>
        </template>
        <template v-if="closed">
          <dt class="text-muted">{{ closed.label }}</dt>
          <dd>
            <time :datetime="closed.at" :title="formatDate(closed.at)">
              {{ formatRelativeTime(closed.at) }}
            </time>
          </dd>
        </template>
        <template v-if="reviewsSupported && reviewsStatus === 'success'">
          <dt class="text-muted">Reviews</dt>
          <dd>{{ summary.reviewCount }}</dd>
          <dt class="text-muted">Approvals</dt>
          <dd>{{ summary.approvals }}</dd>
          <template v-if="summary.changesRequested">
            <dt class="text-muted">Changes requested</dt>
            <dd>{{ summary.changesRequested }}</dd>
          </template>
        </template>
        <template v-if="pull.commitCount">
          <dt class="text-muted">Commits</dt>
          <dd>{{ pull.commitCount }}</dd>
        </template>
        <template v-if="pull.stat">
          <dt class="text-muted">Changes</dt>
          <dd>
            <DiffStat
              :additions="pull.stat.additions"
              :deletions="pull.stat.deletions"
              :files="pull.stat.filesChanged"
            />
          </dd>
        </template>
        <template v-if="pull.sourceBranch && pull.targetBranch">
          <dt class="text-muted">Branches</dt>
          <dd class="min-w-0 font-mono text-xs leading-5">
            <span class="block truncate" :title="pull.sourceBranch">{{ pull.sourceBranch }}</span>
            <span class="block truncate text-muted" :title="pull.targetBranch"
              >→ {{ pull.targetBranch }}</span
            >
          </dd>
        </template>
      </dl>
    </section>
  </div>
</template>
