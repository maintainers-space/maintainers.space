<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Unique, stable key for this banner's dismissal (e.g. `search-note:${text}`). */
    storageKey: string
    description: string
    color?: 'primary' | 'neutral' | 'warning' | 'error' | 'success' | 'info'
    icon?: string
    title?: string
  }>(),
  {
    color: 'neutral',
    icon: 'i-lucide-info'
  }
)

// Once closed, a hint stays gone for good — these are recurring system-status
// banners (rate limits, missing connections), not a promo worth re-surfacing.
const { dismissed, dismiss } = useDismissible(props.storageKey, Infinity)
</script>

<template>
  <UAlert
    v-if="!dismissed"
    :color="color"
    variant="subtle"
    :icon="icon"
    :title="title"
    :description="description"
    :ui="{ description: 'text-xs' }"
    close
    @update:open="dismiss()"
  >
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </UAlert>
</template>
