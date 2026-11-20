<script setup lang="ts">
import type { Comment, ThreadRef } from 'forges'

defineProps<{
  comments: Comment[]
  /** Thread this comment list belongs to. Omit to hide the reaction bars. */
  thread?: ThreadRef
}>()
</script>

<template>
  <div class="space-y-4">
    <CommentCard v-for="c in comments" :key="c.ref.id" :comment="c" :thread="thread" />
  </div>
</template>
