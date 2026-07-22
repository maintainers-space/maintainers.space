<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = withDefaults(defineProps<{ content?: string | null, empty?: string }>(), {
  content: '',
  empty: 'No description provided.'
})

const html = computed(() => {
  const src = props.content?.trim()
  if (!src) return ''
  const raw = marked.parse(src, { async: false, gfm: true, breaks: true }) as string
  return DOMPurify.sanitize(raw)
})
</script>

<template>
  <div v-if="html" :class="PROSE_CLASSES">
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-html="html" />
  </div>
  <p v-else class="text-sm italic text-muted">
    {{ empty }}
  </p>
</template>
