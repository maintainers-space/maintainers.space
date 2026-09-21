<script setup lang="ts">
import { forgeList } from '~/lib/forges'
import type { ForgeAccount } from '~/composables/useForgeAccounts'

const { accounts, pending, loaded, refresh, unlink } = useForgeAccounts()
const { did } = useAuth()
const { isVerified, check } = useForgeAttestations()
const toast = useToast()
const { tokens, set: setForgeToken, remove: removeForgeToken } = useForgeTokens()

const repoOverrides = computed(() => {
  return Object.keys(tokens.value)
    .filter((key) => key.includes(':'))
    .map((key) => {
      const [provider, ...rest] = key.split(':')
      return { key, provider: provider as string, repoFullName: rest.join(':') }
    })
})

// Tangled signs in via the atproto identity itself, not this OAuth flow.
const oauthForges = forgeList.filter((f) => f.id !== 'tangled')
const authByProvider = new Map(oauthForges.map((f) => [f.id, useForgeAuth(f.id)]))

const route = useRoute()
const router = useRouter()

const isPatModalOpen = ref(false)
const patTarget = ref({ provider: '', repoFullName: '' })
const patInput = ref('')

onMounted(() => {
  if (!loaded.value) refresh()

  if (route.query.pat && typeof route.query.pat === 'string') {
    const [provider, ...rest] = route.query.pat.split(':')
    patTarget.value = { provider: provider || '', repoFullName: rest.join(':') }
    isPatModalOpen.value = true
  }
})

function savePat() {
  if (patInput.value && patTarget.value.provider) {
    setForgeToken(
      patTarget.value.provider,
      patInput.value,
      patTarget.value.repoFullName || undefined
    )
    toast.add({ title: 'Repository token saved', color: 'success' })
    isPatModalOpen.value = false
    patInput.value = ''
    router.replace({ query: {} })
  }
}

// Verify attestations whenever the account list or identity changes.
watch(
  [accounts, () => did.value],
  () => {
    check(did.value, accounts.value ?? [])
  },
  { immediate: true }
)

// Two independent facts, previously (and wrongly) conflated:
//   • linked   → a space.maintainers.forgeAccount record exists on your PDS. This syncs
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

const providers = computed<ProviderView[]>(() =>
  oauthForges.map((forge) => {
    const auth = authByProvider.get(forge.id)!
    const state = connState(forge.id, auth.isConnected.value)
    return {
      id: forge.id,
      label: forge.label,
      icon: forge.icon,
      copy: connCopy(state, forge.label),
      state,
      button: buttonFor(state, forge.icon, forge.label),
      connect: () => auth.connect('/settings/accounts')
    }
  })
)

async function onUnlink(account: ForgeAccount) {
  try {
    await unlink(account.rkey)
    // An account link and its OAuth token are one connection — drop both.
    authByProvider.get(account.provider)?.disconnect()
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
        {{ p.label }} remembers you already approved maintainers.space.
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

    <div class="space-y-2 mt-8">
      <h3 class="text-sm font-medium text-muted">Repository Overrides (Hybrid Auth)</h3>
      <p class="text-xs text-muted mb-4">
        Fine-grained Personal Access Tokens used to bypass organization restrictions on specific
        repositories. These are stored securely on this device and are only used for the specified
        repository.
      </p>

      <UCard>
        <div v-if="repoOverrides.length === 0" class="text-sm text-muted text-center py-4">
          No repository overrides configured. You will be prompted to add one if you encounter a 403
          error on an organization-restricted repository.
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="override in repoOverrides"
            :key="override.key"
            class="flex items-center justify-between py-2 border-b border-default last:border-0"
          >
            <div>
              <p class="font-medium text-sm text-default">{{ override.repoFullName }}</p>
              <p class="text-xs text-muted">
                {{
                  forgeList.find((f) => f.id === override.provider)?.label ?? override.provider
                }}
                Token
              </p>
            </div>
            <UButton
              label="Remove"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              @click="removeForgeToken(override.provider, override.repoFullName)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model="isPatModalOpen">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-key" class="size-5 text-primary" />
            <h3 class="font-semibold text-default">Provide Repository Token</h3>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-default">
            Your organization restricts third-party OAuth apps from modifying
            <span class="font-mono">{{ patTarget.repoFullName }}</span
            >.
          </p>
          <p class="text-sm text-muted">
            To bypass this, you can provide a fine-grained Personal Access Token scoped strictly to
            this repository.
          </p>

          <div
            v-if="patTarget.provider === 'github'"
            class="bg-elevated p-3 rounded-md text-sm text-muted space-y-2"
          >
            <p>
              1. Go to
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                class="text-primary hover:underline"
                >GitHub Fine-grained PATs</a
              >
            </p>
            <p>
              2. Set <strong>Repository access</strong> to "Only select repositories" and select
              <code>{{ patTarget.repoFullName.split('/')[1] }}</code>
            </p>
            <p>3. Grant <strong>Read & Write</strong> access for Issues and Pull Requests</p>
          </div>

          <UInput v-model="patInput" placeholder="ghp_..." type="password" icon="i-lucide-key" />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Cancel"
              @click="isPatModalOpen = false"
            />
            <UButton color="primary" label="Save Token" :disabled="!patInput" @click="savePat" />
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
