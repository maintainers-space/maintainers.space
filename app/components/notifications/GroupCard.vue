<script setup lang="ts">
type BadgeColor = 'primary' | 'error' | 'neutral' | 'success' | 'warning'

const props = withDefaults(defineProps<{
  icon: string
  /** Chip classes, e.g. 'bg-error/10 text-error'. */
  iconClass?: string
  title: string
  subtitle?: string
  count?: number
  countColor?: BadgeColor
  defaultOpen?: boolean
}>(), {
  iconClass: 'bg-elevated text-muted',
  countColor: 'neutral',
  defaultOpen: false
})

const open = ref(props.defaultOpen)
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default bg-default">
    <button
      type="button"
      class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-elevated/40"
      @click="open = !open"
    >
      <div class="flex size-9 shrink-0 items-center justify-center rounded-md" :class="iconClass">
        <UIcon :name="icon" class="size-5" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-highlighted">
          {{ title }}
        </p>
        <p v-if="subtitle" class="text-xs text-muted">
          {{ subtitle }}
        </p>
      </div>
      <UBadge
        v-if="count != null"
        :color="countColor"
        variant="subtle"
        size="sm"
      >
        {{ count }}
      </UBadge>
      <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 shrink-0 text-muted" />
    </button>
    <div
      class="grid transition-[grid-template-rows] duration-200 ease-out"
      :class="open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="overflow-hidden">
        <div class="border-t border-default">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
