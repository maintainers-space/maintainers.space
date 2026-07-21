<script setup lang="ts">
defineProps<{
  search: string
  placeholder?: string
  count?: number
}>()

defineEmits<{ 'update:search': [value: string] }>()
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-1">
      <slot name="filters" />
      <span v-if="count !== undefined" class="ml-1 text-xs text-muted">{{ count }} shown</span>
    </div>
    <UInput
      :model-value="search"
      icon="i-lucide-search"
      size="sm"
      :placeholder="placeholder ?? 'Filter by title…'"
      class="w-full sm:w-64"
      @update:model-value="$emit('update:search', String($event))"
    />
  </div>
</template>
