<script setup lang="ts">
withDefaults(defineProps<{
  additions?: number | null
  deletions?: number | null
  files?: number | null
  showFiles?: boolean
}>(), { showFiles: true })
</script>

<template>
  <span class="inline-flex items-center gap-2 font-mono text-xs">
    <span v-if="showFiles && files != null" class="font-sans text-muted">
      {{ files }} file{{ files === 1 ? '' : 's' }}
    </span>
    <span v-if="additions != null" class="text-success">+{{ additions }}</span>
    <span v-if="deletions != null" class="text-error">-{{ deletions }}</span>
  </span>
</template>
