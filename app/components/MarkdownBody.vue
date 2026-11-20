<script setup lang="ts">
import { renderSafeMarkdown } from '~/utils/markdown'

const props = withDefaults(
  defineProps<{
    content?: string | null
    empty?: string
    /**
     * Turn single line breaks into `<br>`, matching how GitHub renders issue/PR/
     * discussion comments. File-based markdown (READMEs and friends) follows
     * plain CommonMark instead, where a lone `\n` just joins text onto the same
     * line — set to false there, or consecutive lines (e.g. a row of badge
     * links) get forced one per line instead of flowing together.
     */
    breaks?: boolean
  }>(),
  {
    content: '',
    empty: 'No description provided.',
    breaks: true
  }
)

const html = computed(() => {
  const src = props.content?.trim()
  if (!src) return ''
  return renderSafeMarkdown(src, props.breaks)
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
