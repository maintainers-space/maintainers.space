<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { isAuthenticated } = useAuth()
const open = ref(false)
const paletteOpen = ref(false)

const nav = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    { label: 'Home', icon: 'i-lucide-house', to: '/', onSelect: () => { open.value = false } },
    { label: 'Search', icon: 'i-lucide-search', to: '/search', onSelect: () => { open.value = false } },
    { label: 'Explore', icon: 'i-lucide-compass', to: '/explore', onSelect: () => { open.value = false } }
  ]
  if (isAuthenticated.value) {
    items.push(
      { label: 'Notifications', icon: 'i-lucide-bell', to: '/notifications', onSelect: () => { open.value = false } },
      { label: 'Linked accounts', icon: 'i-lucide-link', to: '/settings/accounts', onSelect: () => { open.value = false } },
      { label: 'Settings', icon: 'i-lucide-settings', to: '/settings', exact: true, onSelect: () => { open.value = false } }
    )
  }
  return items
})

const external: NavigationMenuItem[] = [
  { label: 'GitHub', icon: 'i-simple-icons-github', to: 'https://github.com', target: '_blank' },
  { label: 'AT Protocol', icon: 'i-lucide-at-sign', to: 'https://atproto.com', target: '_blank' },
  { label: 'Tangled', icon: 'i-koinon-tangled', to: 'https://tangled.org', target: '_blank' }
]
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
