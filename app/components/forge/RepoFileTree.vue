<script setup lang="ts">
import type { ForgeTreeEntry } from '~/types/forge'

defineProps<{ entries: ForgeTreeEntry[], defaultBranch?: string }>()
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <div class="flex items-center gap-2 border-b border-default bg-elevated/50 px-4 py-2.5 text-sm">
      <UIcon name="i-lucide-git-branch" class="size-4 text-muted" />
      <span class="font-medium text-default">{{ defaultBranch }}</span>
      <span class="text-muted">·</span>
      <span class="text-muted">{{ entries.length }} {{ entries.length === 1 ? 'entry' : 'entries' }}</span>
    </div>

    <ul role="list" class="divide-y divide-default">
      <li
        v-for="entry in entries"
        :key="entry.path"
        class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-elevated/40"
      >
        <UIcon
          :name="entry.type === 'dir' ? 'i-lucide-folder' : 'i-lucide-file'"
          class="size-4 shrink-0"
          :class="entry.type === 'dir' ? 'text-primary' : 'text-muted'"
        />
        <span class="truncate text-default" :class="{ 'font-medium': entry.type === 'dir' }">
          {{ entry.name }}
        </span>
        <span v-if="entry.lastCommit?.message" class="ml-2 hidden min-w-0 truncate text-muted md:inline">
          {{ entry.lastCommit.message }}
        </span>
        <span class="ml-auto shrink-0 text-xs text-muted">
          <span v-if="entry.lastCommit?.when">{{ formatRelativeTime(entry.lastCommit.when) }}</span>
          <span v-else-if="entry.type === 'file' && entry.size !== undefined">{{ formatBytes(entry.size) }}</span>
        </span>
      </li>

      <li v-if="!entries.length" class="px-4 py-8 text-center text-sm text-muted">
        This repository is empty.
      </li>
    </ul>
  </div>
</template>
