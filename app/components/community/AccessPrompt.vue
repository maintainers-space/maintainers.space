<script setup lang="ts">
// Community needs more of the atproto session than signing in asks for. This explains why and
// re-runs consent for the same account, coming back to this page.
defineProps<{ message: string }>()

const route = useRoute()
const { grant } = useCommunityAccess()
const busy = ref(false)
const failed = ref<string | null>(null)

async function allow(): Promise<void> {
  busy.value = true
  failed.value = null
  try {
    await grant(route.fullPath)
  } catch (e) {
    failed.value = e instanceof Error ? e.message : 'Could not start the consent screen.'
    busy.value = false
  }
}
</script>

<template>
  <div class="rounded-lg border border-dashed border-default px-4 py-12 text-center">
    <UIcon name="i-lucide-messages-square" class="mx-auto size-8 text-muted" />
    <p class="mx-auto mt-3 max-w-md text-sm text-muted">{{ message }}</p>
    <p class="mx-auto mt-2 max-w-md text-xs text-dimmed">
      Your account server asks you once to let maintainers.space read and write Community messages,
      memberships and channels for you. Signing in alone never grants this.
    </p>
    <UButton
      label="Allow Community access"
      icon="i-lucide-shield-check"
      class="mt-4"
      :loading="busy"
      @click="allow"
    />
    <p v-if="failed" role="alert" class="mt-3 text-sm text-error">{{ failed }}</p>
  </div>
</template>
