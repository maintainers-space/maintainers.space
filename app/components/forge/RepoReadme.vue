<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { ForgeReadme } from '~/types/forge'

const props = defineProps<{ readme: ForgeReadme }>()

const html = computed(() => {
  const raw = marked.parse(props.readme.content, { async: false, gfm: true }) as string
  return DOMPurify.sanitize(raw)
})
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <div class="flex items-center gap-2 border-b border-default bg-elevated/50 px-4 py-2.5 text-sm">
      <UIcon name="i-lucide-book-open" class="size-4 text-muted" />
      <span class="font-medium text-default">{{ readme.filename }}</span>
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div :class="[PROSE_CLASSES, 'p-6']" v-html="html" />
  </div>
</template>
