<script setup lang="ts">
// A forge owner's Community: the Colibri community its admins set up, with a channel for every
// repository. Lives at /community/:provider/:owner so it never clashes with a repository that
// happens to be called "community".
import { forgeLabel, type ForgeOwner } from '~/lib/community/link'
import { loadPlanInput } from '~/lib/community/forge-data'
import { planCommunity } from '~/lib/community/structure'
import type { ResolvedCommunity } from '~/lib/community/discovery'
import { getForge, isForgeId, repoRefOf } from '~/lib/forges/registry'

const route = useRoute()
const router = useRouter()
const provider = computed(() => String(route.params.provider))
const owner = computed(() => String(route.params.owner))
const channel = computed(() =>
  typeof route.query.channel === 'string' ? route.query.channel : null
)

const forge = computed<ForgeOwner | undefined>(() =>
  isForgeId(provider.value) ? { owner: owner.value, provider: provider.value } : undefined
)
const forgeName = computed(() => forgeLabel(provider.value))

useHead({ title: () => `${owner.value} Community` })

const { isAuthenticated, restoring } = useAuth()
const { hasAccess } = useCommunityAccess()
const { community, error, isManager, pending, refresh, reload, show } = useCommunity(forge)
const { providerFor } = useForges()

// The layout is only needed to set a community up or sync it, so it loads on demand.
const wantsPlan = computed(() => isAuthenticated.value && (!community.value || isManager.value))
const {
  data: plan,
  pending: planPending,
  refresh: refreshPlan
} = useAsyncData(
  () => `community-plan:${provider.value}:${owner.value}`,
  async () => {
    const ref = repoRefOf(provider.value, owner.value, '')
    const f = ref ? providerFor(ref) : undefined
    if (!f || !wantsPlan.value) return null
    return planCommunity({ owner: owner.value, ...(await loadPlanInput(f, owner.value)) })
  },
  { default: () => null, lazy: true, server: false, watch: [wantsPlan] }
)

const syncOpen = ref(false)

function onNavigate(rkey: string): void {
  if (rkey === channel.value) return
  void router.push({ query: { channel: rkey } })
}

function onCreated(created: ResolvedCommunity): void {
  show(created)
  void reload()
}

async function onSynced(): Promise<void> {
  await reload()
  await refreshPlan()
}
</script>

<template>
  <UDashboardPanel
    :id="`community-${provider}`"
    :ui="{ body: community ? 'p-0 sm:p-0 overflow-hidden' : undefined }"
  >
    <template #header>
      <UDashboardNavbar :title="`${owner} Community`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="community && isManager && hasAccess"
            :label="`Sync with ${forgeName}`"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            size="sm"
            @click="syncOpen = true"
          />
          <UButton
            :to="`/${provider}/${owner}`"
            :aria-label="`Repositories of ${owner}`"
            icon="i-lucide-book-marked"
            color="neutral"
            variant="ghost"
            size="sm"
            class="max-sm:hidden"
            label="Repositories"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!getForge(provider)" class="mx-auto w-full max-w-4xl py-2">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="`Unknown provider: ${provider}`"
        />
      </div>

      <div v-else-if="pending || restoring" class="mx-auto w-full max-w-4xl space-y-3 py-2">
        <USkeleton class="h-8 w-56" />
        <USkeleton class="h-64 w-full" />
      </div>

      <div v-else-if="error" class="mx-auto w-full max-w-4xl py-2">
        <UAlert
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
      </div>

      <template v-else-if="community">
        <CommunityShell :community="community" :channel="channel" @navigate="onNavigate" />
        <CommunitySyncModal
          v-if="isManager"
          v-model:open="syncOpen"
          :community="community"
          :plan="plan"
          @synced="onSynced"
        />
      </template>

      <div v-else class="mx-auto w-full max-w-4xl py-2">
        <CommonSignInPrompt
          v-if="!isAuthenticated"
          :message="`${owner} has no Community yet. Sign in to set one up, if you maintain it.`"
        />
        <CommunityAccessPrompt
          v-else-if="!hasAccess"
          :message="`${owner} has no Community yet. Allow Community access to set one up.`"
        />
        <CommunitySetup
          v-else-if="forge"
          :forge="forge"
          :plan="plan"
          :plan-pending="planPending"
          @created="onCreated"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
