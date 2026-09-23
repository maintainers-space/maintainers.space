<script setup lang="ts">
import type { ForgeComment, ForgeReactionTargetKind } from '~/types/forge'

defineProps<{
  comments: ForgeComment[]
  /** Thread this comment list belongs to, for reactions. Omit to hide the reaction bar. */
  threadKind?: ForgeReactionTargetKind
  threadId?: string
}>()
</script>

<template>
  <div class="space-y-4">
    <CommentCard
      v-for="c in comments"
      :key="c.id"
      :comment="c"
      :thread-kind="threadKind"
      :thread-id="threadId"
    />
  </div>
</template>
