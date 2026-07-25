<script setup lang="ts">
const props = withDefaults(
  defineProps<{ title: string; icon: string; count: number; total?: number }>(),
  {
    total: undefined
  }
)
const open = ref(true)
</script>

<template>
  <section v-if="count > 0" class="space-y-3">
    <button type="button" class="flex w-full items-center gap-2 text-left" @click="open = !open">
      <UIcon
        :name="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="size-4 text-muted"
      />
      <UIcon :name="icon" class="size-4 text-muted" />
      <h2 class="text-sm font-semibold text-highlighted">
        {{ title }}
      </h2>
      <UBadge color="neutral" variant="subtle" size="xs">
        {{
          props.total != null && props.total > count
            ? `${count} of ${formatCompactNumber(props.total)}`
            : count
        }}
      </UBadge>
    </button>
    <div v-show="open" class="space-y-2">
      <slot />
    </div>
  </section>
</template>
