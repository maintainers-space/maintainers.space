<script setup lang="ts">
const { inboxItems, dependencyCount, ciGroups, ciCount, loading, notes, unreadCount, loadedOnce, load } = useNotifications()
const { isAuthenticated } = useAuth()

const ciOpen = ref(false)

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

          <!-- Failing checks: repetitive CI failures collapsed to one row per repo. -->
          <div v-if="ciCount" class="overflow-hidden rounded-lg border border-default bg-elevated/30">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-elevated/60"
              @click="ciOpen = !ciOpen"
            >
              <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-error/10 text-error">
                <UIcon name="i-lucide-circle-x" class="size-5" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-highlighted">
                  Failing checks
                </p>
                <p class="text-xs text-muted">
                  {{ ciCount }} failed check{{ ciCount === 1 ? '' : 's' }} across
                  {{ ciGroups.length }} {{ ciGroups.length === 1 ? 'repository' : 'repositories' }}
                </p>
              </div>
              <UBadge color="error" variant="subtle" size="sm">
                {{ ciCount }}
              </UBadge>
              <UIcon :name="ciOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 shrink-0 text-muted" />
            </button>
            <div
              class="grid transition-[grid-template-rows] duration-200 ease-out"
              :class="ciOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
            >
              <div class="overflow-hidden">
                <ul class="divide-y divide-default border-t border-default">
                  <li v-for="g in ciGroups" :key="g.key">
                    <NuxtLink
                      :to="g.to || undefined"
                      :href="!g.to ? (g.url || undefined) : undefined"
                      :target="!g.to ? '_blank' : undefined"
                      class="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-elevated/40"
                    >
                      <UIcon name="i-lucide-git-branch" class="size-4 shrink-0 text-muted" />
                      <span class="min-w-0 flex-1 truncate text-default">{{ g.repo.fullName }}</span>
                      <span class="shrink-0 text-xs font-medium text-error">failed {{ g.count }}&times;</span>
                      <span v-if="g.latestAt" class="hidden shrink-0 text-xs text-muted sm:inline">{{ formatRelativeTime(g.latestAt) }}</span>
                    </NuxtLink>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div v-if="loading && !inboxItems.length" class="space-y-3">
            <USkeleton v-for="i in 4" :key="i" class="h-16 w-full" />
          </div>

          <div
            v-else-if="!inboxItems.length && !dependencyCount && !ciCount && !notes.length"
            class="rounded-lg border border-dashed border-default py-16 text-center"
          >
            <UIcon name="i-lucide-check-check" class="mx-auto size-8 text-success" />
            <p class="mt-3 text-sm text-muted">
              You're all caught up.
            </p>
            <p class="mt-1 text-xs text-muted">
              Resolved issues, merged PRs and repetitive check failures are filtered out automatically.
            </p>
          </div>

          <div v-else-if="inboxItems.length" class="space-y-2.5">
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
