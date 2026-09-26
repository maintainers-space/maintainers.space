<script setup lang="ts">
import type { BadgeProps } from '@nuxt/ui'
import type { ForgeFileDiff } from '~/types/forge'

withDefaults(
  defineProps<{
    files: ForgeFileDiff[]
    activePath?: string | null
    /** When true, highlight the file whose diff is rendered in the main pane. */
    showActive?: boolean
  }>(),
  { activePath: null, showActive: true }
)

const emit = defineEmits<{ jump: [path: string] }>()

const STATUS_COLOR: Record<string, BadgeProps['color']> = {
  added: 'success',
  removed: 'error',
  modified: 'warning',
  renamed: 'info',
  copied: 'neutral',
  changed: 'warning'
}
</script>

<template>
  <ul
    class="max-h-[calc(100vh-12rem)] overflow-y-auto"
    :aria-label="`${files.length} changed files`"
  >
    <li v-for="file in files" :key="file.path">
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
        :class="
          showActive && file.path === activePath
            ? 'bg-elevated/70 text-highlighted'
            : 'text-default hover:bg-elevated/40'
        "
        :aria-current="showActive && file.path === activePath ? 'true' : undefined"
        @click="emit('jump', file.path)"
      >
        <UBadge
          :color="STATUS_COLOR[file.status] ?? 'neutral'"
          variant="subtle"
          size="xs"
          class="capitalize shrink-0"
        >
          {{ file.status }}
        </UBadge>
        <span class="min-w-0 truncate font-mono text-xs">
          {{ file.path }}
        </span>
        <span class="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
          <span v-if="file.additions" class="text-success">+{{ file.additions }}</span>
          <span v-if="file.deletions" class="text-error">-{{ file.deletions }}</span>
        </span>
      </button>
    </li>
  </ul>
</template>
