<script setup lang="ts">
import type { ForgeComment, ForgeReactionTargetKind } from '~/types/forge'

const props = defineProps<{
  comment: ForgeComment
  /** Thread this comment belongs to, for reactions. Omit to hide the reaction bar. */
  threadKind?: ForgeReactionTargetKind
  threadId?: string
}>()

function reactionTarget(commentId: string) {
  if (!props.threadKind || !props.threadId) return undefined
  return { kind: props.threadKind, threadId: props.threadId, commentId }
}
</script>

<template>
  <article class="overflow-hidden rounded-lg border border-default">
    <header
      class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-default bg-elevated/40 px-4 py-2 text-sm"
    >
      <UserLink :user="comment.author" />
      <span v-if="comment.createdAt" class="text-muted"
        >commented {{ formatRelativeTime(comment.createdAt) }}</span
      >
    </header>
    <div class="px-4 py-3">
      <MarkdownBody :content="comment.body" empty="No content." />
    </div>
    <ReactionBar
      v-if="reactionTarget(comment.id)"
      :reactions="comment.reactions"
      :target="reactionTarget(comment.id)!"
    />

    <div v-if="comment.replies?.length" class="divide-y divide-default border-t border-default">
      <div v-for="reply in comment.replies" :key="reply.id">
        <header class="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3 text-sm">
          <UserLink :user="reply.author" />
          <span v-if="reply.createdAt" class="text-muted"
            >replied {{ formatRelativeTime(reply.createdAt) }}</span
          >
        </header>
        <div class="px-4 py-1.5">
          <MarkdownBody :content="reply.body" empty="No content." />
        </div>
        <ReactionBar
          v-if="reactionTarget(reply.id)"
          :reactions="reply.reactions"
          :target="reactionTarget(reply.id)!"
        />
      </div>
    </div>
  </article>
</template>
