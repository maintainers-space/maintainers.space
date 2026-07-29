<script setup lang="ts">
import { getForge, isForgeId } from '~/lib/forges'

definePageMeta({ layout: false })

const route = useRoute()
const providerId = String(route.params.provider ?? '')
const forge = isForgeId(providerId) ? getForge(providerId) : undefined
const label = forge?.label ?? providerId

let auth: ReturnType<typeof useForgeAuth> | null = null
try {
  if (forge) auth = useForgeAuth(forge.id)
} catch {
  auth = null
}

const status = ref<'working' | 'error'>('working')
const message = ref(`Connecting your ${label} account…`)

onMounted(async () => {
  if (!auth) {
    status.value = 'error'
    message.value = `maintainers.space doesn't support signing in with "${providerId}" this way.`
    return
  }
  try {
    const to = await auth.completeCallback()
    await navigateTo(to, { replace: true })
  } catch (error) {
    status.value = 'error'
    message.value =
      error instanceof Error ? error.message : `Could not connect your ${label} account.`
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
        <h1 class="font-semibold text-highlighted">{{ label }} connection failed</h1>
        <p class="mt-1 max-w-sm text-sm text-muted">
          {{ message }}
        </p>
      </div>
      <UButton to="/settings/accounts" label="Back to accounts" color="primary" />
    </template>
  </div>
</template>
