<script setup lang="ts">
const route = useRoute()
const group = computed(() => String(route.params.group ?? ''))

const {
  dependencyItems,
  dependencyCount,
  loading,
  loadedOnce,
  load,
  approveAndMerge,
  mergeAll,
  isMerging
} = useNotifications()
const { isAuthenticated } = useAuth()

const title = computed(() => (group.value === 'dependencies' ? 'Dependency updates' : 'Notifications'))
const bulkMerging = ref(false)

onMounted(() => {
  if (!loadedOnce.value) load()
})

async function onMergeAll(): Promise<void> {
  bulkMerging.value = true
  try {
    await mergeAll()
  } finally {
    bulkMerging.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="notifications-group">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UButton
            to="/notifications"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </template>
        <template #trailing>
          <UBadge
            v-if="dependencyCount"
            color="primary"
            variant="subtle"
            size="sm"
          >
            {{ dependencyCount }}
          </UBadge>
        </template>
        <template #right>
          <UButton
            v-if="dependencyCount"
            icon="i-lucide-git-merge"
            color="primary"
            variant="soft"
            size="sm"
            label="Approve & merge all"
            :loading="bulkMerging"
            @click="onMergeAll"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="loading"
            @click="load"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-4 py-2">
        <div v-if="!isAuthenticated" class="rounded-lg border border-dashed border-default py-16 text-center">
          <UIcon name="i-lucide-lock" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm text-muted">
            Sign in to review dependency updates.
          </p>
        </div>

        <template v-else>
          <p class="text-xs text-muted">
            Automated pull requests from dependabot and renovate. Approve and merge them individually, or clear the whole batch at once.
          </p>

          <div v-if="loading && !dependencyItems.length" class="space-y-3">
            <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
          </div>

          <div
            v-else-if="!dependencyItems.length"
            class="rounded-lg border border-dashed border-default py-16 text-center"
          >
            <UIcon name="i-lucide-package-check" class="mx-auto size-8 text-success" />
            <p class="mt-3 text-sm text-muted">
              No dependency updates waiting.
            </p>
          </div>

          <div v-else class="space-y-3">
            <NotificationsInboxCard
              v-for="item in dependencyItems"
              :key="`${item.provider}:${item.id}`"
              :item="item"
              :allow-reply="false"
            >
              <template #actions>
                <UButton
                  icon="i-lucide-git-merge"
                  color="primary"
                  variant="soft"
                  size="xs"
                  label="Approve &amp; merge"
                  :loading="isMerging(item)"
                  :disabled="bulkMerging"
                  @click="approveAndMerge(item)"
                />
              </template>
            </NotificationsInboxCard>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
