<script setup lang="ts">
// Re-runs consent for the signed-in account with Community's scopes, coming back to this page.
const route = useRoute()
const { grant } = useCommunityAccess()
const toast = useToast()
const busy = ref(false)

async function allow(): Promise<void> {
  busy.value = true
  try {
    await grant(route.fullPath)
  } catch (e) {
    busy.value = false
    toast.add({
      color: 'error',
      description: e instanceof Error ? e.message : undefined,
      title: 'Could not open the consent screen'
    })
  }
}
</script>

<template>
  <UButton
    label="Allow Community access"
    icon="i-lucide-shield-check"
    size="sm"
    :loading="busy"
    @click="allow"
  />
</template>
