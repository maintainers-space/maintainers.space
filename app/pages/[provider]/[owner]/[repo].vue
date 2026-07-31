<script setup lang="ts">
import { getForge, isForgeId } from '~/lib/forges'
import type { ForgeRepo } from '~/types/forge'
import { provideRepoContext, useRepoParams } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge, locator } = useRepoParams()

const {
  data: meta,
  pending,
  error,
  refresh
} = useLiveAsyncData<ForgeRepo | null>(
  () => `repo-meta:${provider.value}:${owner.value}:${name.value}`,
  async () => {
    const f = getForge(provider.value)
    if (!f)
      throw createError({ statusCode: 404, statusMessage: `Unknown provider "${provider.value}"` })
    if (f.getRepo) return await f.getRepo(owner.value, name.value)
    const ov = await f.getOverview(owner.value, name.value)
    return ov.repo
  },
  { lazy: true, watch: [provider, owner, name], default: () => null }
)

const defaultBranch = computed(() => meta.value?.defaultBranch ?? 'main')

provideRepoContext({ provider, owner, name, forge, locator, meta, defaultBranch })

// Track visits locally so signed-in users get a personal recent/favourite feed.
const { record, recordSection } = useRepoVisits()
watch(
  meta,
  (m) => {
    if (m) record(m)
  },
  { immediate: true }
)

const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)
const caps = computed(() => forge.value?.capabilities)

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
    if (m && section) recordSection(m, section)
  },
  { immediate: true }
)

const isCode = computed(
  () => route.path === base.value || ['tree', 'blob', 'commits', 'commit'].some(startsWith)
)

// Forge-level capability says this provider supports the feature at all;
// per-repo `features` (when the forge reports it, e.g. GitHub Discussions is
// opt-in per repo) says whether *this* repo actually has it turned on.
// `undefined` means the forge didn't report it — don't hide on a guess.
const features = computed(() => meta.value?.features)

const tabs = computed(() => {
  const items = [{ label: 'Code', icon: 'i-lucide-code', to: base.value, active: isCode.value }]
  if (caps.value?.issues && features.value?.issues !== false)
    items.push({
      label: 'Issues',
      icon: 'i-lucide-circle-dot',
      to: `${base.value}/issues`,
      active: startsWith('issues')
    })
  if (caps.value?.pulls && features.value?.pulls !== false)
    items.push({
      label: pullsTerm(provider.value, { plural: true, capitalize: true }),
      icon: 'i-lucide-git-pull-request',
      to: `${base.value}/pulls`,
      active: startsWith('pulls')
    })
  if (caps.value?.actions)
    items.push({
      label: 'Actions',
      icon: 'i-lucide-play',
      to: `${base.value}/actions`,
      active: startsWith('actions')
    })
  if (caps.value?.discussions && features.value?.discussions !== false)
    items.push({
      label: 'Discussions',
      icon: 'i-lucide-messages-square',
      to: `${base.value}/discussions`,
      active: startsWith('discussions')
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
          :description="
            error?.statusMessage || error?.message || 'We could not load this repository.'
          "
        >
          <template #actions>
            <UButton color="error" variant="soft" label="Retry" @click="refresh()" />
          </template>
        </UAlert>

        <template v-else-if="meta">
          <ForgeRepoHeader :repo="meta" />
          <UNavigationMenu :items="tabs" highlight class="mt-5 border-b border-default" />
          <div class="mt-6">
            <NuxtPage />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
