<script setup lang="ts">
import type { FilterSuggestion } from '~/lib/search/suggestions'

defineProps<{ suggestions: FilterSuggestion[] }>()
const emit = defineEmits<{ apply: [FilterSuggestion] }>()
</script>

<template>
  <TransitionGroup
    tag="div"
    class="relative flex flex-wrap gap-2"
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 scale-90 -translate-y-1"
    enter-to-class="opacity-100 scale-100 translate-y-0"
    leave-active-class="absolute transition duration-150 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-90"
    move-class="transition duration-200 ease-out"
  >
    <button
      v-for="s in suggestions"
      :key="s.id"
      type="button"
      class="inline-flex items-center gap-1.5 rounded-full border border-default bg-elevated/40 px-3 py-1 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
      @click="emit('apply', s)"
    >
      <UIcon :name="s.icon" class="size-3.5" />{{ s.label }}
    </button>
  </TransitionGroup>
</template>
