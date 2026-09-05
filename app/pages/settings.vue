<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl py-2">
        <UNavigationMenu
          :items="[
            { label: 'Linked accounts', icon: 'i-lucide-link-2', to: '/settings/accounts' },
            { label: 'Offline access', icon: 'i-lucide-cloud-download', to: '/settings/offline' }
          ]"
          class="mb-4 border-b border-default"
        />
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
