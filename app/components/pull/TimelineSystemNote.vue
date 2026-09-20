<script setup lang="ts">
import type { ForgeTimelineEvent } from '~/types/forge'
import { userHandle } from '~/utils/pull-review'

defineProps<{
  event: ForgeTimelineEvent
}>()
</script>

<template>
  <div class="flex items-center gap-1.5 py-1 text-sm text-muted">
    <span class="font-medium text-default">{{ userHandle(event.actor) }}</span>

    <template v-if="event.kind === 'labeled'">
      added
      <UBadge
        size="sm"
        variant="subtle"
        :color="event.label?.color ? undefined : 'neutral'"
        :style="
          event.label?.color
            ? `background-color: #${event.label.color}20; color: #${event.label.color}`
            : ''
        "
        >{{ event.label?.name }}</UBadge
      >
      label
    </template>

    <template v-else-if="event.kind === 'unlabeled'">
      removed
      <UBadge
        size="sm"
        variant="subtle"
        :color="event.label?.color ? undefined : 'neutral'"
        :style="
          event.label?.color
            ? `background-color: #${event.label.color}20; color: #${event.label.color}`
            : ''
        "
        >{{ event.label?.name }}</UBadge
      >
      label
    </template>

    <template v-else-if="event.kind === 'assigned'">
      assigned <span class="font-medium text-default">{{ userHandle(event.subject) }}</span>
    </template>

    <template v-else-if="event.kind === 'unassigned'">
      unassigned <span class="font-medium text-default">{{ userHandle(event.subject) }}</span>
    </template>

    <template v-else-if="event.kind === 'review_requested'">
      requested review from
      <span class="font-medium text-default">{{ userHandle(event.subject) }}</span>
    </template>

    <template v-else-if="event.kind === 'review_request_removed'">
      removed review request for
      <span class="font-medium text-default">{{ userHandle(event.subject) }}</span>
    </template>

    <template v-else-if="event.kind === 'renamed'">
      changed title from <strong class="text-default">{{ event.previousTitle }}</strong> to
      <strong class="text-default">{{ event.currentTitle }}</strong>
    </template>

    <template v-else-if="event.kind === 'milestoned'"> modified milestone </template>

    <template v-else-if="event.kind === 'demilestoned'"> removed from milestone </template>

    <template v-else-if="event.kind === 'head_ref_force_pushed'"> force-pushed branch </template>

    <template v-else-if="event.kind === 'base_changed'"> changed the base branch </template>

    <template v-else-if="event.kind === 'committed'">
      <span v-if="event.body">{{ event.body }}</span>
      <span v-else>added a commit</span>
      <code v-if="event.sha" class="font-mono text-xs text-muted">{{ event.sha.slice(0, 7) }}</code>
    </template>

    <template v-else-if="event.kind === 'merged'"> merged this pull request </template>

    <template v-else-if="event.kind === 'closed'"> closed this </template>

    <template v-else-if="event.kind === 'reopened'"> reopened this </template>

    <template v-else-if="event.kind === 'ready_for_review'">
      marked this ready for review
    </template>

    <template v-else-if="event.kind === 'converted_to_draft'"> converted to a draft </template>

    <template v-else>
      {{ event.body || 'performed an action' }}
    </template>

    <span v-if="event.createdAt" class="shrink-0" :title="formatDate(event.createdAt)">
      {{ formatRelativeTime(event.createdAt) }}
    </span>
  </div>
</template>
