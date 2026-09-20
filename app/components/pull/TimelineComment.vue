<script setup lang="ts">
import type { ForgeComment } from '~/types/forge'

defineProps<{
  comment: ForgeComment
  threadId?: string
  /** Show an "Author" badge when the commenter is the PR/MR author. */
  isAuthor?: boolean
}>()

function reactionTarget(commentId: string, threadId?: string) {
  if (!threadId) return undefined
  return { kind: 'pull' as const, threadId, commentId }
}
</script>

<template>
  <article class="overflow-hidden rounded-lg border border-default">
    <header
      class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2 text-sm"
    >
      <UserLink :user="comment.author" />
      <UBadge
        v-if="isAuthor"
        label="Author"
        color="neutral"
        variant="subtle"
        size="xs"
        class="rounded-full"
      />
      <span v-if="comment.createdAt" class="ml-auto text-xs text-dimmed">{{
        formatRelativeTime(comment.createdAt)
      }}</span>
    </header>
    <div class="px-4 py-3">
      <MarkdownBody :content="comment.body" empty="No content." />
    </div>
    <ReactionBar
      v-if="reactionTarget(comment.id, threadId)"
      :reactions="comment.reactions"
      :target="reactionTarget(comment.id, threadId)!"
    />

    <!-- Replies (GitHub Discussions style — 2-level nesting) -->
    <div v-if="comment.replies?.length" class="divide-y divide-default border-t border-default">
      <div v-for="reply in comment.replies" :key="reply.id">
        <header class="flex items-center gap-2 px-4 pt-3 text-sm">
          <UserLink :user="reply.author" />
          <span v-if="reply.createdAt" class="ml-auto text-xs text-dimmed">{{
            formatRelativeTime(reply.createdAt)
          }}</span>
        </header>
        <div class="px-4 py-1.5">
          <MarkdownBody :content="reply.body" empty="No content." />
        </div>
        <ReactionBar
          v-if="reactionTarget(reply.id, threadId)"
          :reactions="reply.reactions"
          :target="reactionTarget(reply.id, threadId)!"
        />
      </div>
    </div>
  </article>
</template>
