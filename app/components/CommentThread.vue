<script setup lang="ts">
import type { ForgeComment, ForgeReactionTargetKind } from '~/types/forge'

const props = defineProps<{
  comments: ForgeComment[]
  /** Thread this comment list belongs to, for reactions. Omit to hide the reaction bar. */
  threadKind?: ForgeReactionTargetKind
  threadId?: string
}>()

function reactionTarget(commentId: string) {
  if (!props.threadKind || !props.threadId) return undefined
  return { kind: props.threadKind, threadId: props.threadId, commentId }
}
</script>

<template>
  <div class="space-y-4">
    <article
      v-for="c in comments"
      :key="c.id"
      class="overflow-hidden rounded-lg border border-default"
    >
      <header
        class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2 text-sm"
      >
        <UserLink :user="c.author" />
        <span v-if="c.createdAt" class="text-muted"
          >commented {{ formatRelativeTime(c.createdAt) }}</span
        >
      </header>
      <div class="px-4 py-3">
        <MarkdownBody :content="c.body" empty="No content." />
      </div>
      <div v-if="reactionTarget(c.id)" class="border-t border-default px-4 py-2">
        <ReactionBar :reactions="c.reactions" :target="reactionTarget(c.id)!" />
      </div>
      <div v-if="c.replies?.length" class="space-y-3 border-t border-default bg-elevated/20 p-3">
        <div
          v-for="reply in c.replies"
          :key="reply.id"
          class="ml-4 rounded-lg border-l-2 border-default pl-4"
        >
          <header class="flex items-center gap-2 text-sm">
            <UserLink :user="reply.author" />
            <span v-if="reply.createdAt" class="text-muted"
              >replied {{ formatRelativeTime(reply.createdAt) }}</span
            >
          </header>
          <div class="py-2">
            <MarkdownBody :content="reply.body" empty="No content." />
          </div>
          <div v-if="reactionTarget(reply.id)" class="pb-2">
            <ReactionBar :reactions="reply.reactions" :target="reactionTarget(reply.id)!" />
          </div>
        </div>
      </div>
    </article>
  </div>
</template>
