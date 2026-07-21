<script setup lang="ts">
definePageMeta({ layout: false })

const { completeCallback } = useAuth()

const status = ref<'working' | 'error'>('working')
const message = ref('Completing sign-in…')

onMounted(async () => {
  try {
    await completeCallback()
    await navigateTo('/', { replace: true })
  } catch (error) {
    status.value = 'error'
    message.value = error instanceof Error ? error.message : 'Sign-in could not be completed.'
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
          Sign-in failed
        </h1>
        <p class="mt-1 max-w-sm text-sm text-muted">
          {{ message }}
        </p>
      </div>
      <UButton to="/login" label="Try again" color="primary" />
    </template>
  </div>
</template>
