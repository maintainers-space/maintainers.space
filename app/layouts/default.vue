<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { isAuthenticated } = useAuth()
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
      </template>

      <template #footer="{ collapsed }">
        <div class="w-full space-y-2">
          <UserMenu :collapsed="collapsed" />
          <div v-if="!collapsed" class="flex items-center justify-center gap-2 text-xs text-dimmed">
            <NuxtLink to="/privacy" class="hover:text-muted hover:underline">Privacy</NuxtLink>
            <span aria-hidden="true">·</span>
            <NuxtLink to="/terms" class="hover:text-muted hover:underline">Terms</NuxtLink>
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />

    <CommandPalette v-model:open="paletteOpen" />
  </UDashboardGroup>
</template>
