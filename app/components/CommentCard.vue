<script setup lang="ts">
import type { Comment, ThreadRef } from 'forges'

const props = defineProps<{
  comment: Comment
  /** Thread this comment belongs to. Omit to hide the reaction bar. */
  thread?: ThreadRef
}>()
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
    <ReactionBar v-if="thread" :reactions="comment.reactions" :target="comment.ref" />
  </article>
</template>
