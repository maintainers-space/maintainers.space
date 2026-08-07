<script setup lang="ts">
import { useRepoContext } from '~/composables/useRepoContext'
import { chatErrorMessage } from '~/composables/useChatCommunity'
import type { ChatOwnerRef, CommunityPreview } from '~/composables/useChatCommunity'
import { getChatScope } from '~/lib/atproto/oauth'
import { getMissingScopeSets, scopeSetLabel } from '@colibri-social/client/scopes'

const route = useRoute()
const router = useRouter()
const { provider, owner, name } = useRepoContext()
const { isAuthenticated, requestScopes, grantedScope, did } = useAuth()

const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)

const ownerRef = computed<ChatOwnerRef>(() => ({ provider: provider.value, owner: owner.value }))
const {
  communityUri,
  pending,
  enabling,
  linking,
  error,
  loadError,
  canEnable,
  hasLinkedAccount,
  linkedButUnattested,
  needsForgeToken,
  enableChat,
  linkCommunity,
  previewCommunity
} = useChatCommunity(ownerRef)

const linkOpen = ref(false)
const linkDid = ref('')
const linkError = ref<string | null>(null)
const resolving = ref(false)
const preview = ref<CommunityPreview | null>(null)

const previewIsOwned = computed(() => !!preview.value && preview.value.ownerDid === did.value)

async function resolveCommunity(): Promise<void> {
  const value = linkDid.value.trim()
  preview.value = null
  linkError.value = null
  if (!value) return
  resolving.value = true
  try {
    preview.value = await previewCommunity(value)
    if (!previewIsOwned.value) {
      linkError.value = 'You are not the owner of that community, so it cannot be linked here.'
    }
  } catch (e) {
    linkError.value = chatErrorMessage(e, 'Could not find a Colibri community on that DID.')
  } finally {
    resolving.value = false
  }
}

async function confirmLink(): Promise<void> {
  if (!preview.value || !previewIsOwned.value) return
  linkError.value = null
  try {
    await linkCommunity(preview.value.communityDid)
  } catch (e) {
    linkError.value = chatErrorMessage(e, 'Could not link that community.')
    return
  }
  linkOpen.value = false
  preview.value = null
  linkDid.value = ''
}

watch(linkDid, () => {
  preview.value = null
  linkError.value = null
})

const routeChannel = computed(() => {
  const raw = route.params.channel
  const seg = Array.isArray(raw) ? raw[0] : raw
  return seg ? decodeURIComponent(seg) : null
})

const approving = ref(false)
const approveError = ref<string | null>(null)

/** Sets the embed itself reported, which wins over our own read when it fires. */
const reportedMissing = ref<string[] | null>(null)

/**
 * Checked before mounting rather than only in response to the embed's
 * `scopes.missing`, because creating or linking a community needs the same
 * permissions and happens with no embed on screen at all.
 */
const missingScopes = computed(() =>
  isAuthenticated.value ? (reportedMissing.value ?? getMissingScopeSets(grantedScope.value)) : []
)

const missingScopeLabels = computed(() => [
  ...new Set(missingScopes.value.map((nsid) => scopeSetLabel(nsid)))
])

function syncRoute(channel: string | undefined): void {
  if (!channel || channel === routeChannel.value) return
  router.replace(`${base.value}/chat/${encodeURIComponent(channel)}`)
}

async function approveChatAccess(): Promise<void> {
  approving.value = true
  approveError.value = null
  try {
    await requestScopes(getChatScope(), route.fullPath)
  } catch (e) {
    approving.value = false
    approveError.value = e instanceof Error ? e.message : 'Could not start the approval.'
  }
}

watch(communityUri, () => {
  reportedMissing.value = null
})
</script>

<template>
  <div
    class="-mx-1 flex h-[calc(100vh-13rem)] min-h-[28rem] overflow-hidden rounded-lg border border-default overflow-hidden"
  >
    <div v-if="pending" class="flex w-full items-center justify-center">
      <USkeleton class="h-8 w-40" />
    </div>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load chat"
      :description="loadError"
      class="m-4 w-full"
    />

    <div
      v-else-if="!communityUri"
      class="flex w-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <UIcon name="i-lucide-message-circle" class="size-9 text-muted" />
      <p class="text-sm font-medium text-default">No chat yet for {{ owner }}</p>
      <p class="max-w-sm text-sm text-muted">
        Every repo under an owner shares one chat. Create a new one, prefilled with
        <code class="text-xs">#general</code>, <code class="text-xs">#off-topic</code>,
        <code class="text-xs">#support</code>, <code class="text-xs">#contributing</code> and a
        voice channel, or link a Colibri community you already run.
      </p>

      <template v-if="!isAuthenticated">
        <p class="text-xs text-muted">Sign in with atproto to enable chat.</p>
      </template>
      <template v-else-if="linkedButUnattested">
        <p class="max-w-sm text-xs text-muted">
          Your {{ provider }} account is linked, but the record carries no signed attestation, so we
          can't prove it's yours. Reconnect it in
          <NuxtLink to="/settings/accounts" class="text-primary hover:underline">Settings</NuxtLink>
          to mint one.
        </p>
      </template>
      <template v-else-if="!hasLinkedAccount">
        <p class="text-xs text-muted">
          Link a {{ provider }} account in
          <NuxtLink to="/settings/accounts" class="text-primary hover:underline">Settings</NuxtLink>
          to enable chat for <strong>{{ owner }}</strong
          >.
        </p>
      </template>
      <template v-else-if="missingScopes.length">
        <UButton
          label="Approve chat access"
          icon="i-lucide-shield-check"
          color="primary"
          :loading="approving"
          @click="approveChatAccess"
        />
        <p v-if="approveError" class="max-w-sm text-sm text-error">
          {{ approveError }}
        </p>
      </template>
      <template v-else-if="canEnable">
        <p v-if="needsForgeToken" class="max-w-sm text-xs text-muted">
          <strong>{{ owner }}</strong> looks like an organisation, so we need to check your role in
          it. If this fails, reconnect your {{ provider }} account in
          <NuxtLink to="/settings/accounts" class="text-primary hover:underline">Settings</NuxtLink
          >. You must be an owner or admin.
        </p>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="error"
          class="max-w-md text-left"
        />

        <div class="flex flex-wrap items-center justify-center gap-2">
          <UButton
            label="Create a chat"
            icon="i-lucide-message-circle-plus"
            color="primary"
            :loading="enabling"
            :disabled="linking"
            @click="enableChat"
          />
          <UButton
            label="Link an existing community"
            icon="i-lucide-link"
            color="neutral"
            variant="subtle"
            :disabled="enabling"
            @click="linkOpen = true"
          />
        </div>

        <UModal v-model:open="linkOpen" title="Link an existing Colibri community">
          <template #body>
            <div class="flex flex-col gap-3">
              <p class="text-sm text-muted">
                Enter the DID of a community you already own. We read its Owner role straight from
                its repo, so only a community you own can be linked to
                <strong>{{ owner }}</strong
                >.
              </p>

              <UFormField label="Community DID">
                <UInput
                  v-model="linkDid"
                  placeholder="did:plc:…"
                  autofocus
                  class="w-full"
                  @keydown.enter.prevent="resolveCommunity"
                />
              </UFormField>

              <UAlert
                v-if="linkError"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :description="linkError"
              />

              <div
                v-if="preview && previewIsOwned"
                class="flex items-start gap-2 rounded-md border border-default bg-elevated/30 p-3 text-left"
              >
                <UIcon name="i-lucide-circle-check" class="mt-0.5 size-4 shrink-0 text-success" />
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ preview.name || 'Untitled community' }}
                  </p>
                  <p class="truncate text-xs text-muted">You own this community.</p>
                </div>
              </div>
            </div>
          </template>

          <template #footer>
            <div class="flex w-full justify-end gap-2">
              <UButton label="Cancel" color="neutral" variant="ghost" @click="linkOpen = false" />
              <UButton
                v-if="!preview || !previewIsOwned"
                label="Look up"
                color="primary"
                :loading="resolving"
                :disabled="!linkDid.trim()"
                @click="resolveCommunity"
              />
              <UButton
                v-else
                label="Link community"
                icon="i-lucide-link"
                color="primary"
                :loading="linking"
                @click="confirmLink"
              />
            </div>
          </template>
        </UModal>
      </template>
    </div>

    <div
      v-else-if="!isAuthenticated"
      class="flex w-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <UIcon name="i-lucide-message-circle" class="size-9 text-muted" />
      <p class="text-sm font-medium text-default">{{ owner }} has a chat</p>
      <p class="max-w-sm text-sm text-muted">
        Sign in with atproto to read along and join the conversation.
      </p>
      <UButton
        :to="`/login?redirect=${encodeURIComponent(route.fullPath)}`"
        label="Sign in"
        icon="i-lucide-log-in"
        color="primary"
      />
    </div>

    <div
      v-else-if="missingScopes.length"
      class="flex w-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <UIcon name="i-lucide-shield-alert" class="size-9 text-warning" />
      <p class="text-sm font-medium text-default">Chat needs your permission</p>
      <p class="max-w-sm text-sm text-muted">
        Chat permissions are only requested when you open chat, so signing in never asked for them.
        Approving keeps you signed in and brings you straight back here.
      </p>
      <p v-if="missingScopeLabels.length" class="max-w-sm text-xs text-dimmed">
        Still to approve: {{ missingScopeLabels.join(', ') }}
      </p>
      <UButton
        label="Approve chat access"
        icon="i-lucide-shield-check"
        color="primary"
        :loading="approving"
        @click="approveChatAccess"
      />
      <p v-if="approveError" class="max-w-sm text-sm text-error">
        {{ approveError }}
      </p>
    </div>

    <LazyChatColibriEmbed
      v-else
      :community-uri="communityUri"
      :channel="routeChannel"
      @navigate="syncRoute"
      @scopes-missing="reportedMissing = $event"
    />
  </div>
</template>
