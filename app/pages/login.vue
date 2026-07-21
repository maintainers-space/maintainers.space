<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: false })

const { loginWithHandle, isAuthenticated } = useAuth()
const route = useRoute()
const toast = useToast()

onMounted(() => {
  if (isAuthenticated.value) {
    navigateTo((route.query.redirect as string) || '/')
  }
})

const schema = z.object({ handle: z.string().min(1, 'Enter your handle or DID') })
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ handle: '' })
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    await loginWithHandle(event.data.handle)
    // The browser is redirected to the identity provider on success.
  } catch (error) {
    loading.value = false
    toast.add({
      title: 'Sign-in failed',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
    <NuxtLink to="/" class="flex items-center gap-2">
      <span class="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-neutral-900">
        <UIcon name="i-lucide-git-merge" class="size-5" />
      </span>
      <span class="text-2xl font-semibold tracking-tight text-highlighted">koinon</span>
    </NuxtLink>

    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="text-center">
          <h1 class="text-lg font-semibold text-highlighted">Sign in with atproto</h1>
          <p class="mt-1 text-sm text-muted">Enter your handle to continue. You can browse without signing in.</p>
        </div>
      </template>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField name="handle" label="Handle or DID">
          <UInput
            v-model="state.handle"
            placeholder="alice.bsky.social"
            icon="i-lucide-at-sign"
            autocapitalize="none"
            autocorrect="off"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UButton type="submit" label="Continue" trailing-icon="i-lucide-arrow-right" block :loading="loading" />
      </UForm>

      <template #footer>
        <UButton to="/" variant="link" color="neutral" label="Back to browsing" icon="i-lucide-arrow-left" class="px-0" />
      </template>
    </UCard>

    <p class="max-w-sm text-center text-xs text-dimmed">
      Koinon uses AT Protocol OAuth. Your credentials are entered on your own provider — never shared with koinon.
    </p>
  </div>
</template>
