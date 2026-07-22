<script setup lang="ts">
definePageMeta({ layout: false })

const { completeCallback } = useCodebergAuth()

const status = ref<'working' | 'error'>('working')
const message = ref('Connecting your Codeberg account…')

onMounted(async () => {
  try {
    const to = await completeCallback()
    await navigateTo(to, { replace: true })
  } catch (error) {
    status.value = 'error'
    message.value = error instanceof Error ? error.message : 'Could not connect your Codeberg account.'
  }
})
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
    <template v-if="status === 'working'">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
      <p class="text-sm text-muted">
        {{ message }}
      </p>
    </template>

    <template v-else>
      <UIcon name="i-lucide-circle-alert" class="size-8 text-error" />
      <div>
        <h1 class="font-semibold text-highlighted">
          Codeberg connection failed
        </h1>
        <p class="mt-1 max-w-sm text-sm text-muted">
          {{ message }}
        </p>
      </div>
      <UButton to="/settings/accounts" label="Back to accounts" color="primary" />
    </template>
  </div>
</template>
