<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { isAuthenticated } = useAuth()
const open = ref(false)

const nav = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    { label: 'Home', icon: 'i-lucide-house', to: '/', onSelect: () => { open.value = false } }
  ]
  if (isAuthenticated.value) {
    items.push(
      { label: 'Linked accounts', icon: 'i-lucide-link', to: '/settings/accounts', onSelect: () => { open.value = false } },
      { label: 'Settings', icon: 'i-lucide-settings', to: '/settings', exact: true, onSelect: () => { open.value = false } }
    )
  }
  return items
})

const external: NavigationMenuItem[] = [
  { label: 'AT Protocol', icon: 'i-lucide-at-sign', to: 'https://atproto.com', target: '_blank' },
  { label: 'Tangled', icon: 'i-lucide-git-branch', to: 'https://tangled.org', target: '_blank' }
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
        <UNavigationMenu
          :collapsed="collapsed"
          :items="nav"
          orientation="vertical"
          tooltip
        />

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
  </UDashboardGroup>
</template>
