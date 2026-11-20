<script setup lang="ts">
import type { Repo } from 'forges'
import { isForgeId } from '~/lib/forges/registry'
import { fetchRepo, repoSections } from '~/lib/forges/reads'
import { toRepoCard } from '~/lib/forges/view'
import { cacheExists, invalidateRepoCache } from '~/lib/cache'
import { provideRepoContext, useRepoParams } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge } = useRepoParams()

const {
  data: meta,
  pending,
  error,
  refresh
} = useLiveAsyncData<Repo | null>(
  () => `repo-meta:${provider.value}:${owner.value}:${name.value}`,
  async () => {
    const f = forge.value
    if (!f)
      throw createError({ statusCode: 404, statusMessage: `Unknown provider "${provider.value}"` })
    return await fetchRepo(f, owner.value, name.value)
  },
  { lazy: true, watch: [provider, owner, name], default: () => null }
)

const defaultBranch = computed(() => meta.value?.defaultBranch ?? 'main')

provideRepoContext({ provider, owner, name, forge, meta, defaultBranch })

// Track visits locally so signed-in users get a personal recent/favourite feed.
const { record, recordSection } = useRepoVisits()
const offline = useOfflineRepos()
watch(
  meta,
  (m) => {
    if (m) {
      const card = toRepoCard(m)
      record(card)
      if (card.isPrivate) {
        // Metadata is the first response that can identify visibility. Remove
        // any current or legacy IndexedDB entries before child pages load.
        invalidateRepoCache(card.provider, card.owner, card.name)
        return
      }
      // Fill the repo's bounded offline surface after the visible header has
      // loaded; the prefetcher deduplicates these entries with the page's own
      // requests and stays within the configured repository/request limits.
      offline.visit(card)
    }
  },
  { immediate: true }
)

const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)
const sections = computed(() =>
  forge.value ? repoSections(forge.value, meta.value ?? undefined) : null
)
const isOnline = useOnline()
const { get: getToken } = useForgeTokens()
const sectionAvailability = ref<Record<string, boolean>>({})

const sectionCacheKeys = computed<Record<string, string>>(() => ({
  code: `repo-code:${provider.value}:${owner.value}:${name.value}`,
  issues: `issues:${provider.value}:${owner.value}:${name.value}:open`,
  pulls: `pulls:${provider.value}:${owner.value}:${name.value}:open`,
  actions: `actions:${provider.value}:${owner.value}:${name.value}`,
  discussions: `discussions:${provider.value}:${owner.value}:${name.value}:${
    getToken(provider.value) ? 'auth' : 'anon'
  }`
}))

async function checkSectionAvailability(): Promise<void> {
  if (!import.meta.client || isOnline.value) {
    sectionAvailability.value = {}
    return
  }
  const entries = await Promise.all(
    Object.entries(sectionCacheKeys.value).map(async ([section, key]) => [
      section,
      await cacheExists(key)
    ])
  )
  sectionAvailability.value = Object.fromEntries(entries)
}

watch([isOnline, provider, owner, name], () => void checkSectionAvailability(), {
  immediate: true
})

function unavailableOffline(section: string): boolean {
  return !isOnline.value && !sectionAvailability.value[section]
}

function tabIcon(section: string, normal: string): string {
  return unavailableOffline(section) ? 'i-lucide-wifi-off' : normal
}

function startsWith(seg: string): boolean {
  return route.path === `${base.value}/${seg}` || route.path.startsWith(`${base.value}/${seg}/`)
}

// Track which section of the repo is actually being read (not just the
// landing page) so "Jump back in" can tell a deep dive from a quick glance.
const currentSection = computed<string | null>(() => {
  const rest = route.path.slice(base.value.length).replace(/^\//, '')
  return rest.split('/')[0] || (route.path === base.value ? 'code' : null)
})
watch(
  [meta, currentSection],
  ([m, section]) => {
    if (m && section) recordSection(toRepoCard(m), section)
  },
  { immediate: true }
)

const isCode = computed(
  () => route.path === base.value || ['tree', 'blob', 'commits', 'commit'].some(startsWith)
)

const tabs = computed(() => {
  const items = [
    {
      label: 'Code',
      icon: tabIcon('code', 'i-lucide-code'),
      to: base.value,
      active: isCode.value,
      disabled: unavailableOffline('code')
    }
  ]
  if (sections.value?.issues)
    items.push({
      label: 'Issues',
      icon: tabIcon('issues', 'i-lucide-circle-dot'),
      to: `${base.value}/issues`,
      active: startsWith('issues'),
      disabled: unavailableOffline('issues')
    })
  if (sections.value?.pulls)
    items.push({
      label: pullsTerm(provider.value, { plural: true, capitalize: true }),
      icon: tabIcon('pulls', 'i-lucide-git-pull-request'),
      to: `${base.value}/pulls`,
      active: startsWith('pulls'),
      disabled: unavailableOffline('pulls')
    })
  if (sections.value?.actions)
    items.push({
      label: 'Actions',
      icon: tabIcon('actions', 'i-lucide-play'),
      to: `${base.value}/actions`,
      active: startsWith('actions'),
      disabled: unavailableOffline('actions')
    })
  if (sections.value?.discussions)
    items.push({
      label: 'Discussions',
      icon: tabIcon('discussions', 'i-lucide-messages-square'),
      to: `${base.value}/discussions`,
      active: startsWith('discussions'),
      disabled: unavailableOffline('discussions')
    })
  return items
})
</script>

<template>
  <UDashboardPanel :id="`repo-${provider}`">
    <template #header>
      <UDashboardNavbar :title="`${owner}/${name}`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl px-1 py-4">
        <div v-if="pending && !meta" class="space-y-4">
          <USkeleton class="h-7 w-64" />
          <USkeleton class="h-4 w-96" />
        </div>

        <UAlert
          v-else-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="isForgeId(provider) ? 'Repository not found' : `Unknown provider: ${provider}`"
          :description="forgeErrorMessage(error, 'We could not load this repository.')"
        >
          <template #actions>
            <UButton color="error" variant="soft" label="Retry" @click="refresh()" />
          </template>
        </UAlert>

        <template v-else-if="meta">
          <ForgeRepoHeader :repo="meta" />
          <UNavigationMenu
            :items="tabs"
            highlight
            aria-label="Repository"
            class="mt-5 border-b border-default"
            :ui="{
              root: 'overflow-x-auto [scrollbar-width:none]',
              list: 'min-w-max',
              linkLabel: 'overflow-visible'
            }"
          />
          <div class="mt-6">
            <NuxtPage />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
