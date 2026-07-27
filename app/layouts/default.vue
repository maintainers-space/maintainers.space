<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { forgeList, getForge } from '~/lib/forges'

const { isAuthenticated, profile, did } = useAuth()
const { accounts, loaded: accountsLoaded, refresh: refreshAccounts } = useForgeAccounts()
const open = ref(false)
const paletteOpen = ref(false)

// The sidebar is always visible, so load linked accounts eagerly rather than
// waiting for a page that happens to read them.
watch(
  isAuthenticated,
  (auth) => {
    if (auth && !accountsLoaded.value) void refreshAccounts()
  },
  { immediate: true }
)

const nav = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    {
      label: 'Home',
      icon: 'i-lucide-house',
      to: '/',
      onSelect: () => {
        open.value = false
      }
    },
    {
      label: 'Search',
      icon: 'i-lucide-search',
      to: '/search',
      onSelect: () => {
        open.value = false
      }
    },
    {
      label: 'Explore',
      icon: 'i-lucide-compass',
      to: '/explore',
      onSelect: () => {
        open.value = false
      }
    }
  ]
  if (isAuthenticated.value) {
    items.push(
      {
        label: 'Timeline',
        icon: 'i-lucide-activity',
        to: '/timeline',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Notifications',
        icon: 'i-lucide-bell',
        to: '/notifications',
        onSelect: () => {
          open.value = false
        }
      }
    )
  }
  return items
})

// Links to the viewer's profile on each connected provider, in registry order
// (OAuth-connected forges, then Tangled via its atproto handle, then AT
// Protocol itself). The rare case where we intentionally leave the app for the
// provider's own site.
const external = computed<NavigationMenuItem[]>(() => {
  const list = accounts.value ?? []
  const out: NavigationMenuItem[] = []
  for (const forge of forgeList) {
    if (forge.id === 'tangled') continue // uses the atproto handle below, not a linked account
    const account = list.find((a) => a.provider === forge.id)
    if (!account?.username) continue
    out.push({
      label: forge.label,
      icon: forge.icon,
      to: account.profileUrl || forge.ownerWebUrl?.(account.username) || '#',
      target: '_blank'
    })
  }
  if (profile.value?.handle) {
    const tangled = getForge('tangled')
    out.push({
      label: tangled?.label ?? 'Tangled',
      icon: tangled?.icon ?? 'i-lucide-git-fork',
      to: tangled?.ownerWebUrl?.(profile.value.handle) ?? '#',
      target: '_blank'
    })
  }
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

        <UNavigationMenu :collapsed="collapsed" :items="nav" orientation="vertical" tooltip />

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
