<script setup lang="ts">
import { cacheExists } from '~/lib/cache'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  to: string
  /** Cache entry that contains the target page's complete initial payload. */
  cacheKey: string
}>()

const attrs = useAttrs()
const isOnline = useOnline()
const available = ref(false)

async function checkAvailability(): Promise<void> {
  if (!import.meta.client) return
  available.value = await cacheExists(props.cacheKey)
}

watch(
  [isOnline, () => props.cacheKey],
  ([online]) => {
    // A target can always be opened online. Read IndexedDB only when its
    // availability determines whether a link must be disabled.
    if (online) {
      available.value = true
      return
    }
    void checkAvailability()
  },
  { immediate: true }
)

const unavailable = computed(() => !isOnline.value && !available.value)
</script>

<template>
  <NuxtLink v-if="!unavailable" :to="to" v-bind="attrs">
    <slot :offline="false" />
  </NuxtLink>
  <span
    v-else
    v-bind="attrs"
    role="link"
    aria-disabled="true"
    title="Not available offline"
    class="cursor-not-allowed text-muted opacity-60"
  >
    <slot :offline="true" />
  </span>
</template>
