<script setup lang="ts">
const { isAuthenticated } = useAuth()
const { groups, loading, loadedOnce, load, notes } = useDependencyUpdates()

onMounted(() => {
  if (!loadedOnce.value) load()
})
</script>

<template>
  <UDashboardPanel id="notifications-dependencies">
    <template #header>
      <UDashboardNavbar title="Dependency updates">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UBadge v-if="groups.length" color="primary" variant="subtle" size="sm">
            {{ groups.length }} group{{ groups.length === 1 ? '' : 's' }}
          </UBadge>
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="loading"
            aria-label="Refresh dependency updates"
            @click="load(true)"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-4 py-2">
        <div
          v-if="!isAuthenticated"
          class="rounded-lg border border-dashed border-default py-16 text-center"
        >
          <UIcon name="i-lucide-lock" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm text-muted">
            Sign in to aggregate dependency updates across your repositories.
          </p>
        </div>

        <template v-else>
          <div v-if="notes.length" class="space-y-2">
            <CommonDismissibleAlert
              v-for="(n, i) in notes"
              :key="i"
              :storage-key="`dependencies-note:${n}`"
              :description="n"
            />
          </div>

          <p class="text-xs text-muted">
            Renovate &amp; Dependabot pull requests from every repo you can push to, grouped by what
            they update. Approve &amp; merge a whole group at once.
          </p>

          <div v-if="loading && !groups.length" class="space-y-3">
            <USkeleton v-for="i in 3" :key="i" class="h-20 w-full" />
          </div>

          <div
            v-else-if="!groups.length"
            class="rounded-lg border border-dashed border-default py-16 text-center"
          >
            <UIcon name="i-lucide-package-check" class="mx-auto size-8 text-success" />
            <p class="mt-3 text-sm text-muted">No dependency updates waiting to merge.</p>
          </div>

          <div v-else class="space-y-3">
            <NotificationsDependencyGroupCard
              v-for="group in groups"
              :key="group.key"
              :group="group"
              :default-open="group.items.length > 1"
            />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
