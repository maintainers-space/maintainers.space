<script setup lang="ts">
import type { ForgeAccount } from '~/composables/useForgeAccounts'

const { accounts, pending, loaded, refresh, unlink } = useForgeAccounts()
const github = useGithubAuth()
const gitlab = useGitlabAuth()
const codeberg = useCodebergAuth()
const { did } = useAuth()
const { isVerified, check } = useForgeAttestations()
const toast = useToast()

onMounted(() => {
  if (!loaded.value) refresh()
})

// Verify attestations whenever the account list or identity changes.
watch(
  [accounts, () => did.value],
  () => {
    check(did.value, accounts.value ?? [])
  },
  { immediate: true }
)

// Two independent facts, previously (and wrongly) conflated:
//   • linked   → a dev.koinon.forgeAccount record exists on your PDS. This syncs
//                across every device the moment you sign in with atproto.
//   • connected→ an OAuth token is present in THIS browser. It never leaves the
//                device, so a fresh device is "linked" but not yet "connected".
type ConnState = 'connected' | 'connected-unlinked' | 'needs-auth' | 'disconnected'

function connState(provider: string, isConnected: boolean): ConnState {
  const linked = accounts.value.some((a) => a.provider === provider)
  if (isConnected) return linked ? 'connected' : 'connected-unlinked'
  if (linked) return 'needs-auth'
  return 'disconnected'
}

function connCopy(state: ConnState, label: string): string {
  switch (state) {
    case 'connected':
      return 'Connected on this device.'
    case 'connected-unlinked':
      return `Connected on this device, but not yet linked to your atproto identity. Reconnect to finish linking ${label}.`
    case 'needs-auth':
      return 'Linked to your atproto identity — authorize on this device to use it.'
    default:
      return `Sign in with ${label} to verify and link your account.`
  }
}

interface ProviderView {
  id: string
  label: string
  icon: string
  copy: string
  state: ConnState
  button: {
    label: string
    icon: string
    color: 'neutral' | 'primary'
    variant: 'outline' | 'solid'
  }
  connect: () => void
}

function buttonFor(state: ConnState, icon: string, label: string): ProviderView['button'] {
  switch (state) {
    case 'connected':
      return {
        label: 'Reconnect',
        icon: 'i-lucide-refresh-cw',
        color: 'neutral',
        variant: 'outline'
      }
    case 'connected-unlinked':
      return { label: 'Finish linking', icon, color: 'primary', variant: 'solid' }
    case 'needs-auth':
      return { label: 'Authorize on this device', icon, color: 'primary', variant: 'solid' }
    default:
      return { label: `Connect ${label}`, icon, color: 'primary', variant: 'solid' }
  }
}

const providers = computed<ProviderView[]>(() => {
  const gh = connState('github', github.isConnected.value)
  const gl = connState('gitlab', gitlab.isConnected.value)
  const cb = connState('codeberg', codeberg.isConnected.value)
  return [
    {
      id: 'github',
      label: 'GitHub',
      icon: 'i-simple-icons-github',
      copy: connCopy(gh, 'GitHub'),
      state: gh,
      button: buttonFor(gh, 'i-simple-icons-github', 'GitHub'),
      connect: () => github.connect('/settings/accounts')
    },
    {
      id: 'gitlab',
      label: 'GitLab',
      icon: 'i-simple-icons-gitlab',
      copy: connCopy(gl, 'GitLab'),
      state: gl,
      button: buttonFor(gl, 'i-simple-icons-gitlab', 'GitLab'),
      connect: () => gitlab.connect('/settings/accounts')
    },
    {
      id: 'codeberg',
      label: 'Codeberg',
      icon: 'i-simple-icons-codeberg',
      copy: connCopy(cb, 'Codeberg'),
      state: cb,
      button: buttonFor(cb, 'i-simple-icons-codeberg', 'Codeberg'),
      connect: () => codeberg.connect('/settings/accounts')
    }
  ]
})

async function onUnlink(account: ForgeAccount) {
  try {
    await unlink(account.rkey)
    // An account link and its OAuth token are one connection — drop both.
    if (account.provider === 'github') github.disconnect()
    if (account.provider === 'gitlab') gitlab.disconnect()
    if (account.provider === 'codeberg') codeberg.disconnect()
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
      <h2 class="font-semibold text-highlighted">Linked accounts</h2>
      <p class="text-sm text-muted">
        Connect forge accounts to your atproto identity. Linking uses OAuth so an account can only
        be added by its owner — no personal access tokens needed.
      </p>
    </div>

    <UCard v-for="p in providers" :key="p.id">
      <div class="flex items-center gap-3">
        <span class="inline-flex size-10 items-center justify-center rounded-lg bg-elevated">
          <UIcon :name="p.icon" class="size-5" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-medium text-default">
            {{ p.label }}
          </p>
          <p class="text-sm text-muted">
            {{ p.copy }}
          </p>
        </div>
        <UButton
          :label="p.button.label"
          :icon="p.button.icon"
          :color="p.button.color"
          :variant="p.button.variant"
          @click="p.connect()"
        />
      </div>
      <p v-if="p.state === 'needs-auth'" class="mt-3 text-xs text-muted">
        Your accounts stay linked to your identity, but the OAuth token that authorizes API access
        lives only on each device for security. Authorizing here is usually a single click —
        {{ p.label }} remembers you already approved koinon.
      </p>
    </UCard>

    <div class="space-y-2">
      <h3 class="text-sm font-medium text-muted">Connected accounts</h3>

      <div v-if="pending && !accounts.length" class="space-y-2">
        <USkeleton class="h-16 w-full" />
        <USkeleton class="h-16 w-full" />
      </div>

      <div
        v-else-if="!accounts.length"
        class="rounded-lg border border-dashed border-default p-8 text-center"
      >
        <UIcon name="i-lucide-link-2-off" class="mx-auto size-8 text-muted" />
        <p class="mt-2 text-sm text-muted">
          No linked accounts yet. Connect a forge above to get started.
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
