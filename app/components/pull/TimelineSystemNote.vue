<script setup lang="ts">
import type { ForgeTimelineEvent } from '~/types/forge'

defineProps<{
  event: ForgeTimelineEvent
}>()

const EVENT_ICON: Record<string, string> = {
  labeled: 'i-lucide-tag',
  unlabeled: 'i-lucide-tag',
  assigned: 'i-lucide-user-plus',
  unassigned: 'i-lucide-user-minus',
  review_requested: 'i-lucide-eye',
  review_request_removed: 'i-lucide-eye-off',
  milestoned: 'i-lucide-milestone',
  demilestoned: 'i-lucide-milestone',
  renamed: 'i-lucide-pencil',
  base_changed: 'i-lucide-git-branch',
  head_ref_force_pushed: 'i-lucide-git-commit-horizontal',
  committed: 'i-lucide-git-commit-horizontal',
  merged: 'i-lucide-git-merge',
  closed: 'i-lucide-circle-slash',
  reopened: 'i-lucide-circle-dot',
  ready_for_review: 'i-lucide-circle-dot',
  converted_to_draft: 'i-lucide-git-pull-request-draft',
  other: 'i-lucide-activity'
}

const EVENT_COLOR: Record<string, string> = {
  merged: 'text-primary',
  closed: 'text-error',
  reopened: 'text-success',
  ready_for_review: 'text-success'
}

function eventDescription(event: ForgeTimelineEvent): string {
  switch (event.kind) {
    case 'labeled':
      return 'added label'
    case 'unlabeled':
      return 'removed label'
    case 'assigned':
      return 'assigned'
    case 'unassigned':
      return 'unassigned'
    case 'review_requested':
      return 'requested review from'
    case 'review_request_removed':
      return 'removed review request for'
    case 'milestoned':
      return 'added to milestone'
    case 'demilestoned':
      return 'removed from milestone'
    case 'renamed':
      return 'changed title'
    case 'base_changed':
      return 'changed the base branch'
    case 'head_ref_force_pushed':
      return 'force-pushed'
    case 'committed':
      return 'added a commit'
    case 'merged':
      return 'merged'
    case 'closed':
      return 'closed'
    case 'reopened':
      return 'reopened'
    case 'ready_for_review':
      return 'marked as ready for review'
    case 'converted_to_draft':
      return 'marked as draft'
    case 'other':
      return event.body ?? 'updated'
  }
}
</script>

<template>
  <div class="flex items-center gap-3 py-1">
    <span
      class="flex size-7 shrink-0 items-center justify-center rounded-full border border-default bg-elevated"
    >
      <UIcon
        :name="EVENT_ICON[event.kind] ?? 'i-lucide-activity'"
        :class="EVENT_COLOR[event.kind] ?? 'text-muted'"
        class="size-3.5"
      />
    </span>

    <p class="min-w-0 text-sm text-muted">
      <UserLink v-if="event.actor" :user="event.actor" class="font-medium text-default" />
      <span>{{ ' ' }}{{ eventDescription(event) }}</span>

      <!-- Label badge for labeled/unlabeled -->
      <UBadge
        v-if="event.label"
        :label="event.label.name"
        color="neutral"
        variant="subtle"
        size="xs"
        class="ml-1 rounded-full"
      />

      <!-- Subject user for assigned/review_requested -->
      <UserLink v-if="event.subject" :user="event.subject" class="ml-1 font-medium text-default" />

      <!-- Rename: old → new -->
      <template v-if="event.kind === 'renamed' && event.previousTitle">
        <span class="ml-1 line-through opacity-60">{{ event.previousTitle }}</span>
        <span class="mx-1">→</span>
        <span class="font-medium text-highlighted">{{ event.currentTitle }}</span>
      </template>

      <!-- Commit SHA -->
      <code
        v-if="event.sha && (event.kind === 'head_ref_force_pushed' || event.kind === 'committed')"
        class="ml-1 font-mono text-xs text-muted"
        >{{ event.sha.slice(0, 7) }}</code
      >

      <span v-if="event.createdAt" class="ml-2 text-xs text-dimmed">{{
        formatRelativeTime(event.createdAt)
      }}</span>
    </p>
  </div>
</template>
