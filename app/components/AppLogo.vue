<script setup lang="ts">
import { ACCENT_COLORS } from '~/composables/useAccentColor'

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })

const { current } = useAccentColor()
const needsDarkText = computed(
  () => ACCENT_COLORS.find((c) => c.id === current.value)?.needsDarkText ?? false
)
</script>

<template>
  <NuxtLink to="/" class="flex items-center gap-2 font-semibold text-highlighted">
    <span
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary"
      :class="needsDarkText ? 'text-neutral-900' : 'text-inverted'"
    >
      <UIcon name="i-lucide-git-merge" class="size-5" />
    </span>
    <span v-if="!collapsed" class="text-lg tracking-tight">koinon</span>
  </NuxtLink>
</template>
