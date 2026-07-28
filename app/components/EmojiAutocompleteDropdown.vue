<script setup lang="ts">
import type { EmojiEntry } from '~/utils/emoji'

defineProps<{
  open: boolean
  results: EmojiEntry[]
  activeIndex: number
  top: number
  left: number
}>()
const emit = defineEmits<{ select: [EmojiEntry] }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && results.length"
      class="fixed z-50 max-h-56 w-56 overflow-y-auto rounded-lg border border-default bg-default p-1 shadow-lg"
      :style="{ top: `${top}px`, left: `${left}px` }"
    >
      <button
        v-for="(entry, i) in results"
        :key="entry.slug"
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm"
        :class="i === activeIndex ? 'bg-elevated' : 'hover:bg-elevated/60'"
        @mousedown.prevent="emit('select', entry)"
      >
        <span class="text-base">{{ entry.emoji }}</span>
        <span class="text-muted">:{{ entry.slug }}:</span>
      </button>
    </div>
  </Teleport>
</template>
