<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { getForge } from '~/lib/forges'

const { isAuthenticated, profile, did } = useAuth()
const { accounts, loaded: accountsLoaded, refresh: refreshAccounts } = useForgeAccounts()
const open = ref(false)
const paletteOpen = ref(false)

// The sidebar is always visible, so load linked accounts eagerly rather than
// waiting for a page that happens to read them.
watch(isAuthenticated, (auth) => {
  if (auth && !accountsLoaded.value) void refreshAccounts()
}, { immediate: true })

const nav = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    { label: 'Home', icon: 'i-lucide-house', to: '/', onSelect: () => { open.value = false } },
    { label: 'Search', icon: 'i-lucide-search', to: '/search', onSelect: () => { open.value = false } },
    { label: 'Explore', icon: 'i-lucide-compass', to: '/explore', onSelect: () => { open.value = false } }
  ]
  if (isAuthenticated.value) {
    items.push(
      { label: 'Timeline', icon: 'i-lucide-activity', to: '/timeline', onSelect: () => { open.value = false } },
      { label: 'Notifications', icon: 'i-lucide-bell', to: '/notifications', onSelect: () => { open.value = false } }
    )
  }
  return items
})

function externalProfileUrl(provider: string, username: string, profileUrl?: string): string {
  if (profileUrl) return profileUrl
  switch (provider) {
    case 'github': return `https://github.com/${encodeURIComponent(username)}`
    case 'gitlab': return `https://gitlab.com/${encodeURIComponent(username)}`
    case 'codeberg': return `https://codeberg.org/${encodeURIComponent(username)}`
    case 'tangled': return `https://tangled.sh/@${encodeURIComponent(username)}`
    default: return '#'
  }
}

// Links to the viewer's profile on each connected provider, in a fixed order
// (GitHub, GitLab, Codeberg, Tangled, AT Protocol). The rare case where we
// intentionally leave the app for the provider's own site.
const external = computed<NavigationMenuItem[]>(() => {
  const list = accounts.value ?? []
  const find = (provider: string) => list.find(a => a.provider === provider)
  const out: NavigationMenuItem[] = []
  const pushForge = (provider: string, username?: string, profileUrl?: string) => {
    if (!username) return
    out.push({
      label: getForge(provider)?.label ?? provider,
      icon: getForge(provider)?.icon ?? 'i-lucide-git-fork',
      to: externalProfileUrl(provider, username, profileUrl),
      target: '_blank'
    })
  }
  const gh = find('github')
  pushForge('github', gh?.username, gh?.profileUrl)
  const gl = find('gitlab')
  pushForge('gitlab', gl?.username, gl?.profileUrl)
  const cb = find('codeberg')
  pushForge('codeberg', cb?.username, cb?.profileUrl)
  if (profile.value?.handle) pushForge('tangled', profile.value.handle)
  if (did.value) {
    out.push({
      label: 'AT Protocol',
      icon: 'i-simple-icons-bluesky',
      to: `https://bsky.app/profile/${did.value}`,
      target: '_blank'
    })
  }
  return out
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <AppLogo :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UButton
          :label="collapsed ? undefined : 'Search…'"
          icon="i-lucide-search"
          color="neutral"
          variant="outline"
          block
          :square="collapsed"
          :ui="{ base: collapsed ? '' : 'justify-between' }"
          @click="paletteOpen = true"
        >
          <template v-if="!collapsed" #trailing>
            <div class="ms-auto flex items-center gap-0.5">
              <UKbd value="meta" />
              <UKbd value="k" />
            </div>
          </template>
        </UButton>

        <UNavigationMenu
          :collapsed="collapsed"
          :items="nav"
          orientation="vertical"
          tooltip
        />

        <ExploreSidebar v-if="!collapsed" />

        <UNavigationMenu
          v-if="external.length"
          :collapsed="collapsed"
          :items="external"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />

    <CommandPalette v-model:open="paletteOpen" />
  </UDashboardGroup>
</template>
