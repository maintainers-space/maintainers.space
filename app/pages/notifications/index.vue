<script setup lang="ts">
const { inboxItems, dependencyCount, loading, notes, unreadCount, loadedOnce, load } = useNotifications()
const { isAuthenticated } = useAuth()

onMounted(() => {
  if (!loadedOnce.value) load()
})
</script>

<template>
  <UDashboardPanel id="notifications">
    <template #header>
      <UDashboardNavbar title="Notifications">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UBadge
            v-if="unreadCount"
            color="primary"
            variant="subtle"
            size="sm"
          >
            {{ unreadCount }} unread
          </UBadge>
        </template>
        <template #right>
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
            Sign in to bundle notifications across your forges.
          </p>
        </div>

        <template v-else>
          <div v-if="notes.length" class="space-y-2">
            <UAlert
              v-for="(n, i) in notes"
              :key="i"
              color="neutral"
              variant="subtle"
              icon="i-lucide-info"
              :description="n"
              :ui="{ description: 'text-xs' }"
            >
              <template #actions>
                <UButton
                  to="/settings/accounts"
                  size="xs"
                  color="neutral"
                  variant="link"
                  label="Manage accounts"
                />
              </template>
            </UAlert>
          </div>

          <NuxtLink
            v-if="dependencyCount"
            to="/notifications/dependencies"
            class="flex items-center gap-3 rounded-lg border border-default bg-elevated/30 px-4 py-3 transition hover:bg-elevated/60"
          >
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <UIcon name="i-lucide-package" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-highlighted">
                Dependency updates
              </p>
              <p class="text-xs text-muted">
                {{ dependencyCount }} automated PR{{ dependencyCount === 1 ? '' : 's' }} ready to review &amp; merge
              </p>
            </div>
            <UBadge color="primary" variant="subtle" size="sm">
              {{ dependencyCount }}
            </UBadge>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
          </NuxtLink>

          <div v-if="loading && !inboxItems.length" class="space-y-3">
            <USkeleton v-for="i in 4" :key="i" class="h-24 w-full" />
          </div>

          <div
            v-else-if="!inboxItems.length && !notes.length"
            class="rounded-lg border border-dashed border-default py-16 text-center"
          >
            <UIcon name="i-lucide-check-check" class="mx-auto size-8 text-success" />
            <p class="mt-3 text-sm text-muted">
              You're all caught up.
            </p>
            <p class="mt-1 text-xs text-muted">
              Resolved issues and merged PRs are filtered out automatically.
            </p>
          </div>

          <div v-else class="space-y-3">
            <NotificationsInboxCard
              v-for="item in inboxItems"
              :key="`${item.provider}:${item.id}`"
              :item="item"
            />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
