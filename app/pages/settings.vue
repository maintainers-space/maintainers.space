<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({ middleware: 'auth' })

const links: NavigationMenuItem[] = [
  { label: 'Profile', icon: 'i-lucide-user', to: '/settings', exact: true },
  { label: 'Linked accounts', icon: 'i-lucide-link', to: '/settings/accounts' }
]
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl py-2">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
