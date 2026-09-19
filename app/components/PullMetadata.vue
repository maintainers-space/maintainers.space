<script setup lang="ts">
import type { ForgePullDetail, ForgePullReview } from '~/types/forge'
import { REVIEW_STATE_COLOR, REVIEW_STATE_ICON, reviewStateLabel } from '~/utils/pull-review'

const props = withDefaults(
  defineProps<{
    pull: ForgePullDetail
    reviews: ForgePullReview[]
    reviewsComplete?: boolean
  }>(),
  { reviewsComplete: true }
)

const toast = useToast()

const branchName = computed(() => props.pull.sourceBranch?.split(':').pop())

function copyBranch(): void {
  const name = branchName.value
  if (!name) return
  void navigator.clipboard.writeText(name).then(() => {
    toast.add({ title: 'Branch copied', icon: 'i-lucide-copy', color: 'success' })
  })
}

const reviewers = computed(() => {
  const latest = new Map<string, ForgePullReview>()
  for (const review of props.reviews) {
    const login = review.author?.login ?? review.id
    latest.set(login, review)
  }
  return [...latest.entries()].map(([key, r]) => ({ key, user: r.author, state: r.state }))
})

function reviewerIcon(state: string): string {
  return REVIEW_STATE_ICON[state] ?? 'i-lucide-circle'
}
function reviewerColorClass(state: string): string {
  const color = REVIEW_STATE_COLOR[state] ?? 'neutral'
  return color === 'success' ? 'text-success' : color === 'error' ? 'text-error' : 'text-muted'
}
</script>

<template>
  <div
    class="lg:sticky lg:top-1 overflow-hidden rounded-lg border border-default bg-elevated/20"
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
              :name="reviewerIcon(r.state)"
              :class="reviewerColorClass(r.state)"
              :title="reviewStateLabel(r.state)"
              class="size-3.5 shrink-0"
            />
            <UserLink :user="r.user" />
          </li>
        </ul>
        <p v-if="!reviewsComplete" class="mt-2 text-xs text-muted">
          More reviews load as you scroll the conversation.
        </p>
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
          <UIcon name="i-lucide-info" class="size-4 text-muted" />
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
          <div v-if="branchName" class="flex items-center gap-2">
            <dt class="w-20 shrink-0 text-muted">Branch</dt>
            <dd class="min-w-0">
              <code class="block w-full truncate font-mono text-xs text-muted">{{
                branchName
              }}</code>
            </dd>
            <button
              type="button"
              class="shrink-0 text-muted hover:text-highlighted"
              :title="`Copy branch ${branchName}`"
              aria-label="Copy branch name"
              @click="copyBranch"
            >
              <UIcon name="i-lucide-copy" class="size-4" />
            </button>
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
