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
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
