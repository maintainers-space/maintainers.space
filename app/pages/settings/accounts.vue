<script setup lang="ts">
import type { ForgeAccount } from '~/composables/useForgeAccounts'

const { accounts, pending, loaded, refresh, unlink } = useForgeAccounts()
const { connect, disconnect, isConnected } = useGithubAuth()
const { did } = useAuth()
const { isVerified, check } = useForgeAttestations()
const toast = useToast()

onMounted(() => {
  if (!loaded.value) refresh()
})

// Verify attestations whenever the account list or identity changes.
watch(
  [accounts, () => did.value],
  () => { check(did.value, accounts.value ?? []) },
  { immediate: true }
)

const githubLinked = computed(() => accounts.value.some(a => a.provider === 'github'))

// Two independent facts, previously (and wrongly) conflated:
//   • linked   → a dev.koinon.forgeAccount record exists on your PDS. This syncs
//                across every device the moment you sign in with atproto.
//   • connected→ a GitHub OAuth token is present in THIS browser. It never leaves
//                the device, so a fresh device is "linked" but not yet "connected".
// That mismatch is why another device looked connected but wasn't.
const githubState = computed<'connected' | 'needs-auth' | 'disconnected'>(() => {
  if (isConnected.value) return 'connected'
  if (githubLinked.value) return 'needs-auth'
  return 'disconnected'
})

const githubCopy = computed(() => {
  switch (githubState.value) {
    case 'connected':
      return 'Connected on this device.'
    case 'needs-auth':
      return 'Linked to your atproto identity — authorize on this device to use it.'
    default:
      return 'Sign in with GitHub to verify and link your account.'
  }
})

const githubButton = computed(() => {
  switch (githubState.value) {
    case 'connected':
      return { label: 'Reconnect', icon: 'i-lucide-refresh-cw', color: 'neutral' as const, variant: 'outline' as const }
    case 'needs-auth':
      return { label: 'Authorize on this device', icon: 'i-simple-icons-github', color: 'primary' as const, variant: 'solid' as const }
    default:
      return { label: 'Connect GitHub', icon: 'i-simple-icons-github', color: 'primary' as const, variant: 'solid' as const }
  }
})

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
            {{ githubCopy }}
          </p>
        </div>
        <UButton
          :label="githubButton.label"
          :icon="githubButton.icon"
          :color="githubButton.color"
          :variant="githubButton.variant"
          @click="connect('/settings/accounts')"
        />
      </div>
      <p v-if="githubState === 'needs-auth'" class="mt-3 text-xs text-muted">
        Your accounts stay linked to your identity, but the GitHub token that
        authorizes API access lives only on each device for security. Authorizing
        here is usually a single click — GitHub remembers you already approved koinon.
      </p>
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
          :verified="isVerified(did, account)"
          @unlink="onUnlink"
        />
      </div>
    </div>
  </div>
</template>
