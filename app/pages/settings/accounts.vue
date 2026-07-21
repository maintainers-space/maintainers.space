<script setup lang="ts">
import type { ForgeAccount } from '~/composables/useForgeAccounts'

const { accounts, pending, loaded, refresh, unlink } = useForgeAccounts()
const { connect, disconnect, isConnected } = useGithubAuth()
const toast = useToast()

onMounted(() => {
  if (!loaded.value) refresh()
})

const githubLinked = computed(() => accounts.value.some(a => a.provider === 'github'))

async function onUnlink(account: ForgeAccount) {
  try {
    await unlink(account.rkey)
    // A GitHub account link and its OAuth token are one connection — drop both.
    if (account.provider === 'github') disconnect()
    toast.add({ title: 'Account unlinked', color: 'success' })
  } catch (error) {
    toast.add({
      title: 'Could not unlink account',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="font-semibold text-highlighted">
        Linked accounts
      </h2>
      <p class="text-sm text-muted">
        Connect forge accounts to your atproto identity. Linking uses OAuth so an
        account can only be added by its owner — no personal access tokens needed.
      </p>
    </div>

    <UCard>
      <div class="flex items-center gap-3">
        <span class="inline-flex size-10 items-center justify-center rounded-lg bg-elevated">
          <UIcon name="i-simple-icons-github" class="size-5" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-medium text-default">
            GitHub
          </p>
          <p class="text-sm text-muted">
            {{ githubLinked || isConnected ? 'Connected via OAuth.' : 'Sign in with GitHub to verify and link your account.' }}
          </p>
        </div>
        <UButton
          :label="githubLinked || isConnected ? 'Reconnect' : 'Connect GitHub'"
          :icon="githubLinked || isConnected ? 'i-lucide-refresh-cw' : 'i-simple-icons-github'"
          :color="githubLinked || isConnected ? 'neutral' : 'primary'"
          :variant="githubLinked || isConnected ? 'outline' : 'solid'"
          @click="connect('/settings/accounts')"
        />
      </div>
    </UCard>

    <div class="space-y-2">
      <h3 class="text-sm font-medium text-muted">
        Connected accounts
      </h3>

      <div v-if="pending && !accounts.length" class="space-y-2">
        <USkeleton class="h-16 w-full" />
        <USkeleton class="h-16 w-full" />
      </div>

      <div v-else-if="!accounts.length" class="rounded-lg border border-dashed border-default p-8 text-center">
        <UIcon name="i-lucide-link-2-off" class="mx-auto size-8 text-muted" />
        <p class="mt-2 text-sm text-muted">
          No linked accounts yet. Connect GitHub above to get started.
        </p>
      </div>

      <div v-else class="space-y-2">
        <AccountLinkedAccountCard
          v-for="account in accounts"
          :key="account.uri"
          :account="account"
          @unlink="onUnlink"
        />
      </div>
    </div>
  </div>
</template>
