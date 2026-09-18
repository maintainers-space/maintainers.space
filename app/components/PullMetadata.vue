<script setup lang="ts">
import type { ForgePullDetail, ForgePullReview } from '~/types/forge'

const props = withDefaults(
  defineProps<{
    pull: ForgePullDetail
    reviews: ForgePullReview[]
  }>(),
  {}
)

const reviewers = computed(() => {
  const latest = new Map<string, ForgePullReview>()
  for (const review of props.reviews) {
    const login = review.author?.login ?? review.id
    latest.set(login, review)
  }
  return [...latest.entries()].map(([key, r]) => ({ key, user: r.author, state: r.state }))
})

const REVIEWER_ICON: Record<string, string> = {
  APPROVED: 'i-lucide-check-circle',
  CHANGES_REQUESTED: 'i-lucide-x-circle',
  COMMENTED: 'i-lucide-message-square',
  PENDING: 'i-lucide-clock',
  DISMISSED: 'i-lucide-ban',
  UNKNOWN: 'i-lucide-circle'
}
const REVIEWER_COLOR: Record<string, 'success' | 'warning' | 'neutral'> = {
  APPROVED: 'success',
  CHANGES_REQUESTED: 'warning',
  COMMENTED: 'neutral',
  PENDING: 'neutral',
  DISMISSED: 'neutral',
  UNKNOWN: 'neutral'
}
function reviewerLabel(state: ForgePullReview['state']): string {
  return state.replaceAll('_', ' ').toLowerCase()
}
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-default bg-elevated/20"
    aria-label="Pull request metadata"
  >
    <div class="divide-y divide-default">
      <section class="px-4 py-3">
        <h2 class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
          <UIcon name="i-lucide-users" class="size-4 text-muted" />
          Reviewers
        </h2>
        <p v-if="!reviewers.length" class="mt-2 text-sm text-muted">No reviews yet.</p>
        <ul v-else class="mt-2 space-y-1.5">
          <li v-for="r in reviewers" :key="r.key" class="flex items-center gap-2 text-sm">
            <UIcon
              :name="REVIEWER_ICON[r.state] ?? 'i-lucide-circle'"
              :class="`size-3.5 ${REVIEWER_COLOR[r.state] === 'success' ? 'text-success' : REVIEWER_COLOR[r.state] === 'warning' ? 'text-warning' : 'text-muted'}`"
            />
            <UserLink :user="r.user" />
            <span class="text-xs text-muted">{{ reviewerLabel(r.state) }}</span>
          </li>
        </ul>
      </section>

      <section v-if="pull.labels?.length" class="px-4 py-3">
        <h2 class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
          <UIcon name="i-lucide-tags" class="size-4 text-muted" />
          Labels
        </h2>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <UBadge
            v-for="l in pull.labels"
            :key="l.name"
            :label="l.name"
            color="neutral"
            variant="subtle"
            size="xs"
            class="rounded-full"
          />
        </div>
      </section>

      <section class="px-4 py-3">
        <h2 class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
          <UIcon name="i-lucide-circle-info" class="size-4 text-muted" />
          About
        </h2>
        <dl class="mt-2 space-y-2 text-sm">
          <div v-if="pull.author" class="flex items-center gap-2">
            <dt class="w-20 shrink-0 text-muted">Author</dt>
            <dd class="min-w-0">
              <UserLink :user="pull.author" />
            </dd>
          </div>
          <div class="flex items-center gap-2">
            <dt class="w-20 shrink-0 text-muted">Status</dt>
            <dd>
              <StateBadge :state="pull.state" kind="pull" size="xs" />
            </dd>
          </div>
          <div v-if="pull.sourceBranch && pull.targetBranch" class="flex items-center gap-2">
            <dt class="w-20 shrink-0 text-muted">Branches</dt>
            <dd class="min-w-0 font-mono text-xs text-muted">
              <code class="truncate">{{ pull.sourceBranch }} → {{ pull.targetBranch }}</code>
            </dd>
          </div>
          <div v-if="pull.createdAt" class="flex items-center gap-2">
            <dt class="w-20 shrink-0 text-muted">Created</dt>
            <dd class="text-muted">{{ formatDate(pull.createdAt) }}</dd>
          </div>
          <div v-if="pull.updatedAt" class="flex items-center gap-2">
            <dt class="w-20 shrink-0 text-muted">Updated</dt>
            <dd class="text-muted">{{ formatDate(pull.updatedAt) }}</dd>
          </div>
          <div v-if="pull.mergedAt" class="flex items-center gap-2">
            <dt class="w-20 shrink-0 text-muted">Merged</dt>
            <dd class="text-muted">{{ formatDate(pull.mergedAt) }}</dd>
          </div>
          <div v-else-if="pull.closedAt" class="flex items-center gap-2">
            <dt class="w-20 shrink-0 text-muted">Closed</dt>
            <dd class="text-muted">{{ formatDate(pull.closedAt) }}</dd>
          </div>
          <div v-if="pull.commitCount" class="flex items-center gap-2">
            <dt class="w-20 shrink-0 text-muted">Commits</dt>
            <dd class="text-muted">{{ pull.commitCount }}</dd>
          </div>
          <div v-if="pull.stat" class="flex items-center gap-2">
            <dt class="w-20 shrink-0 text-muted">Changes</dt>
            <dd>
              <DiffStat
                :additions="pull.stat.additions"
                :deletions="pull.stat.deletions"
                :files="pull.stat.filesChanged"
              />
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>
