<script setup lang="ts">
const emit = defineEmits<{ close: [boolean] }>()

const colorMode = useColorMode()
const { colors, current, setAccent } = useAccentColor()

const modes = [
  { value: 'light', label: 'Light', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Dark', icon: 'i-lucide-moon' },
  { value: 'system', label: 'System', icon: 'i-lucide-monitor' }
] as const
</script>

<template>
  <UModal title="Appearance" description="Choose your theme and accent color.">
    <template #body>
      <div class="space-y-5">
        <div>
          <p class="mb-2 text-sm font-medium text-highlighted">Theme</p>
          <div class="flex gap-2">
            <UButton
              v-for="mode in modes"
              :key="mode.value"
              :color="colorMode.preference === mode.value ? 'primary' : 'neutral'"
              :variant="colorMode.preference === mode.value ? 'solid' : 'soft'"
              :icon="mode.icon"
              :label="mode.label"
              size="sm"
              class="flex-1 justify-center"
              @click="colorMode.preference = mode.value"
            />
          </div>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium text-highlighted">Accent color</p>
          <div class="grid grid-cols-9 gap-2">
            <button
              v-for="c in colors"
              :key="c.id"
              type="button"
              class="flex size-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-default transition"
              :class="current === c.id ? 'ring-default' : 'ring-transparent hover:ring-default/60'"
              :style="{ backgroundColor: c.swatch }"
              :title="c.label"
              :aria-label="c.label"
              @click="setAccent(c.id)"
            >
              <UIcon
                v-if="current === c.id"
                name="i-lucide-check"
                class="size-4 text-white mix-blend-difference"
              />
            </button>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end">
        <UButton color="neutral" variant="soft" label="Done" @click="emit('close', true)" />
      </div>
    </template>
  </UModal>
</template>
