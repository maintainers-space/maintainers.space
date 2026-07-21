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
const networkHint = ref(false)

const suggestions = ['bsky.social', 'npmx.social', 'tangled.org']

function useSuggestion(host: string): void {
  const current = (state.handle ?? '').split('.')[0]?.replace(/^@/, '') ?? ''
  state.handle = current ? `${current}.${host}` : `you.${host}`
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  networkHint.value = false
  try {
    await loginWithHandle(event.data.handle)
    // The browser is redirected to the identity provider on success.
  } catch (error) {
    loading.value = false
    const message = error instanceof Error ? error.message : String(error)
    // A blocked Bluesky auth server surfaces as a generic fetch/network failure.
    networkHint.value = /fetch|network|load failed|timeout|failed to|blocked/i.test(message)
    toast.add({
      title: 'Sign-in failed',
      description: message,
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
          <h1 class="text-lg font-semibold text-highlighted">
            Sign in with atproto
          </h1>
          <p class="mt-1 text-sm text-muted">
            Enter your handle to continue. You can browse without signing in.
          </p>
        </div>
      </template>

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UAlert
          v-if="networkHint"
          color="warning"
          variant="soft"
          icon="i-lucide-shield-alert"
          title="Can't reach your provider"
          description="Your network may be blocking Bluesky domains. Browsing works through koinon's built-in proxy, but the sign-in redirect must reach your account's provider directly — try a different network for the initial sign-in, or ask IT to allow your PDS (e.g. bsky.social)."
          class="mb-1"
        />
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

        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs text-dimmed">Try:</span>
          <UButton
            v-for="host in suggestions"
            :key="host"
            :label="host"
            color="neutral"
            variant="soft"
            size="xs"
            @click="useSuggestion(host)"
          />
        </div>

        <UButton
          type="submit"
          label="Continue"
          trailing-icon="i-lucide-arrow-right"
          block
          :loading="loading"
        />
      </UForm>

      <USeparator label="New to AT Protocol?" class="my-4" />

      <div class="space-y-2">
        <UButton
          to="https://bsky.app"
          target="_blank"
          color="neutral"
          variant="outline"
          block
          icon="i-lucide-user-plus"
          label="Create an atproto account"
          trailing-icon="i-lucide-external-link"
        />
        <p class="text-center text-xs text-dimmed">
          koinon uses your AT Protocol identity — create one on any PDS (Bluesky, npmx, or self-hosted) and sign in here.
        </p>
      </div>

      <template #footer>
        <div class="flex items-center justify-between">
          <UButton
            to="/"
            variant="link"
            color="neutral"
            label="Back to browsing"
            icon="i-lucide-arrow-left"
            class="px-0"
          />
          <UButton
            to="https://github.com"
            target="_blank"
            variant="link"
            color="neutral"
            label="GitHub"
            icon="i-simple-icons-github"
            class="px-0"
          />
        </div>
      </template>
    </UCard>

    <p class="max-w-sm text-center text-xs text-dimmed">
      Koinon uses AT Protocol OAuth. Your credentials are entered on your own provider — never shared with koinon.
    </p>
  </div>
</template>
