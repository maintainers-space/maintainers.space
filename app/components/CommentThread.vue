<script setup lang="ts">
import type { ForgeComment } from '~/types/forge'

defineProps<{ comments: ForgeComment[] }>()
</script>

<template>
  <div class="space-y-4">
    <article
      v-for="c in comments"
      :key="c.id"
      class="overflow-hidden rounded-lg border border-default"
    >
      <header class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2 text-sm">
        <UserLink :user="c.author" />
        <span v-if="c.createdAt" class="text-muted">commented {{ formatRelativeTime(c.createdAt) }}</span>
      </header>
      <div class="px-4 py-3">
        <MarkdownBody :content="c.body" empty="No content." />
      </div>
    </article>
  </div>
</template>
