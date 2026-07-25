<script setup lang="ts">
import type { ForgeCommit } from '~/types/forge'

const props = defineProps<{
  commits: ForgeCommit[]
  provider: string
  owner: string
  repo: string
}>()

function commitPath(sha: string): string {
  return `/${props.provider}/${props.owner}/${props.repo}/commit/${sha}`
}

function title(message: string): string {
  return message.split('\n')[0] ?? ''
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <div
      v-for="(c, i) in commits"
      :key="c.sha || i"
      class="flex items-center gap-3 px-4 py-3"
      :class="{ 'border-t border-default': i > 0 }"
    >
      <UIcon name="i-lucide-git-commit-horizontal" class="size-4 shrink-0 text-muted" />
      <div class="min-w-0 flex-1">
        <NuxtLink
          :to="commitPath(c.sha)"
          class="block truncate text-sm font-medium text-default hover:text-primary"
        >
          {{ title(c.message) || '(no message)' }}
        </NuxtLink>
        <div class="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span v-if="c.author">{{ c.author.name || userLabel({ login: c.author.login }) }}</span>
          <span v-if="c.author?.when">· {{ formatRelativeTime(c.author.when) }}</span>
        </div>
      </div>
      <NuxtLink
        :to="commitPath(c.sha)"
        class="shrink-0 rounded border border-default px-2 py-0.5 font-mono text-xs text-muted hover:text-primary"
      >
        {{ c.shortSha }}
      </NuxtLink>
    </div>
  </div>
</template>
