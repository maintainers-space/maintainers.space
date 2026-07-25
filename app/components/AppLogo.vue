<script setup lang="ts">
withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })
</script>

<template>
  <NuxtLink to="/" class="flex items-center gap-2 font-semibold text-highlighted">
    <span
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-neutral-900"
    >
      <UIcon name="i-lucide-git-merge" class="size-5" />
    </span>
    <span v-if="!collapsed" class="text-lg tracking-tight">koinon</span>
  </NuxtLink>
</template>
