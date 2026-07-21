<script setup lang="ts">
import { getForge, isForgeId } from '~/lib/forges'
import type { ForgeRepo } from '~/types/forge'
import { provideRepoContext, useRepoParams } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge, locator } = useRepoParams()

const { data: meta, pending, error, refresh } = useAsyncData<ForgeRepo | null>(
  () => `repo-meta:${provider.value}:${owner.value}:${name.value}`,
  async () => {
    const f = getForge(provider.value)
    if (!f) throw createError({ statusCode: 404, statusMessage: `Unknown provider "${provider.value}"` })
    if (f.getRepo) return await f.getRepo(owner.value, name.value)
    const ov = await f.getOverview(owner.value, name.value)
    return ov.repo
  },
  { lazy: true, watch: [provider, owner, name], default: () => null }
)

const defaultBranch = computed(() => meta.value?.defaultBranch ?? 'main')

provideRepoContext({ provider, owner, name, forge, locator, meta, defaultBranch })

const base = computed(() => repoPath({ provider: provider.value, owner: owner.value, name: name.value }))
const caps = computed(() => forge.value?.capabilities)

function startsWith(seg: string): boolean {
  return route.path === `${base.value}/${seg}` || route.path.startsWith(`${base.value}/${seg}/`)
}

const isCode = computed(() =>
  route.path === base.value
  || ['tree', 'blob', 'commits', 'commit'].some(startsWith)
)

const tabs = computed(() => {
  const items = [
    { label: 'Code', icon: 'i-lucide-code', to: base.value, active: isCode.value }
  ]
  if (caps.value?.issues) items.push({ label: 'Issues', icon: 'i-lucide-circle-dot', to: `${base.value}/issues`, active: startsWith('issues') })
  if (caps.value?.pulls) items.push({ label: 'Pull requests', icon: 'i-lucide-git-pull-request', to: `${base.value}/pulls`, active: startsWith('pulls') })
  if (caps.value?.actions) items.push({ label: 'Actions', icon: 'i-lucide-play', to: `${base.value}/actions`, active: startsWith('actions') })
  if (caps.value?.discussions) items.push({ label: 'Discussions', icon: 'i-lucide-messages-square', to: `${base.value}/discussions`, active: startsWith('discussions') })
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
        <template #trailing>
          <ForgeIcon :provider="provider" class="size-4 text-muted" />
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
          :description="(error as any)?.statusMessage || (error as any)?.message || 'We could not load this repository.'"
        >
          <template #actions>
            <UButton
              color="error"
              variant="soft"
              label="Retry"
              @click="refresh()"
            />
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
