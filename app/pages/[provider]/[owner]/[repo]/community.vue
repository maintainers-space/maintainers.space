<script setup lang="ts">
// A repository's Community tab: the owner's Community, opened on this repository's channel.
import { repoChannel } from '~/lib/community/structure'
import { isForgeId, ownerWebUrl } from '~/lib/forges/registry'
import type { ForgeOwner } from '~/lib/community/link'

const route = useRoute()
const provider = computed(() => String(route.params.provider))
const owner = computed(() => String(route.params.owner))
const name = computed(() => String(route.params.repo))

const forge = computed<ForgeOwner | undefined>(() =>
  isForgeId(provider.value) ? { owner: owner.value, provider: provider.value } : undefined
)
const ownerPage = computed(() => `/community/${provider.value}/${owner.value}`)

const { isAuthenticated, restoring } = useAuth()
const { hasAccess } = useCommunityAccess()
const { community, error, pending, refresh } = useCommunity(forge)

/** The channel the sync made for this repository, matched by its URL. */
const channel = computed(() => {
  if (!community.value) return null
  const url = `${ownerWebUrl(provider.value, owner.value) ?? ''}/${name.value}`
  return repoChannel(community.value.data, url) ?? null
})
</script>

<template>
  <div v-if="pending || restoring" class="space-y-3">
    <USkeleton class="h-96 w-full" />
  </div>

  <UAlert
    v-else-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    title="Could not look up the Community"
    :description="error.message"
  >
    <template #actions>
      <UButton color="error" variant="soft" label="Retry" @click="refresh()" />
    </template>
  </UAlert>

  <template v-else-if="community">
    <div
      v-if="hasAccess"
      class="h-[calc(100dvh-18rem)] min-h-[28rem] overflow-hidden rounded-lg border border-default"
    >
      <CommunityColibriEmbed
        :community-uri="community.record.community"
        :channel="channel"
        class="h-full"
      />
    </div>
    <CommonSignInPrompt
      v-else-if="!isAuthenticated"
      :message="`Sign in with your atproto account to talk about ${name} in the ${owner} Community.`"
    />
    <CommunityAccessPrompt
      v-else
      :message="`Allow Community access to talk about ${name} in the ${owner} Community.`"
    />
    <div class="mt-2 flex justify-end">
      <UButton
        :to="ownerPage"
        label="Open the whole Community"
        trailing-icon="i-lucide-arrow-right"
        color="neutral"
        variant="link"
        size="sm"
      />
    </div>
  </template>

  <div v-else class="rounded-lg border border-dashed border-default px-4 py-16 text-center">
    <UIcon name="i-lucide-messages-square" class="mx-auto size-8 text-muted" />
    <p class="mx-auto mt-3 max-w-md text-sm text-muted">
      {{ owner }} has no Community yet. Its maintainers can set one up, with a channel for
      {{ name }} and every other repository.
    </p>
    <UButton :to="ownerPage" label="Set up a Community" icon="i-lucide-sparkles" class="mt-4" />
  </div>
</template>
