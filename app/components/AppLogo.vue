<script setup lang="ts">
import { ACCENT_COLORS } from '~/composables/useAccentColor'

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })

const { current } = useAccentColor()
const isOnline = useOnline()
const needsDarkText = computed(
  () => ACCENT_COLORS.find((c) => c.id === current.value)?.needsDarkText ?? false
)

const isSpinning = ref(false)

const triggerSpin = () => {
  if (!isSpinning.value) {
    isSpinning.value = true
  }
}
</script>

<template>
  <NuxtLink
    to="/"
    class="group flex items-center gap-2 font-semibold text-highlighted"
    :aria-label="isOnline ? 'maintainers.space home' : 'Offline — maintainers.space home'"
    :title="isOnline ? undefined : 'Offline'"
    @mouseenter="triggerSpin"
  >
    <span
      class="logo-icon inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary"
      :class="[
        needsDarkText ? 'text-neutral-900' : 'text-inverted',
        { 'spin-animation': isSpinning && isOnline }
      ]"
      @animationend="isSpinning = false"
    >
      <UIcon v-if="!isOnline" name="i-lucide-wifi-off" class="size-5" />
      <BrandMark v-else class="size-5" />
    </span>
    <span v-if="!collapsed" class="text-lg tracking-tight">maintainers</span>
  </NuxtLink>
</template>

<style scoped>
.spin-animation {
  animation: spin-smooth 1s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes spin-smooth {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
