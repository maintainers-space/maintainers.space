<script setup lang="ts">
import type { ForgeInboxItem } from '~/types/forge'

const {
  inboxItems,
  dependencyCount,
  ciGroups,
  ciCount,
  resolvedItems,
  resolvedCount,
  loading,
  notes,
  unreadCount,
  loadedOnce,
  load,
  markRead,
  markManyRead,
  completeCiGroup
} = useNotifications()
const { isAuthenticated } = useAuth()

onMounted(() => {
  if (!loadedOnce.value) load()
})

/** Icon + tint for a resolved thread's final state. */
function resolvedMeta(item: ForgeInboxItem): { icon: string; class: string } {
  if (item.kind === 'pull') {
    if (item.state === 'merged') return { icon: 'i-lucide-git-merge', class: 'text-primary' }
    return { icon: 'i-lucide-git-pull-request-closed', class: 'text-error' }
  }
  return { icon: 'i-lucide-circle-check', class: 'text-primary' }
}
</script>

<template>
  <UDashboardPanel id="notifications">
    <template #header>
      <UDashboardNavbar title="Notifications">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UBadge v-if="unreadCount" color="primary" variant="subtle" size="sm">
            {{ unreadCount }} unread
          </UBadge>
        </template>
        <template #right>
          <UButton
            v-if="inboxItems.length"
            icon="i-lucide-check-check"
            color="neutral"
            variant="ghost"
            size="sm"
            label="Mark all read"
            @click="markManyRead(inboxItems)"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="loading"
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
          <p class="mt-3 text-sm text-muted">Sign in to bundle notifications across your forges.</p>
        </div>

        <template v-else>
          <div v-if="notes.length" class="space-y-2">
            <CommonDismissibleAlert
              v-for="(n, i) in notes"
              :key="i"
              :storage-key="`notifications-note:${n}`"
              :description="n"
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
            </CommonDismissibleAlert>
          </div>

          <NuxtLink
            v-if="dependencyCount"
            to="/notifications/dependencies"
            class="flex items-center gap-3 rounded-lg border border-default bg-elevated/30 px-4 py-3 transition hover:bg-elevated/60"
          >
            <div
              class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <UIcon name="i-lucide-package" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-highlighted">Dependency updates</p>
              <p class="text-xs text-muted">
                {{ dependencyCount }} automated PR{{ dependencyCount === 1 ? '' : 's' }} ready to
                review &amp; merge
              </p>
            </div>
            <UBadge color="primary" variant="subtle" size="sm">
              {{ dependencyCount }}
            </UBadge>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
          </NuxtLink>

          <div v-if="loading && !inboxItems.length" class="space-y-3">
            <USkeleton v-for="i in 4" :key="i" class="h-16 w-full" />
          </div>

          <div
            v-else-if="
              !inboxItems.length && !dependencyCount && !ciCount && !resolvedCount && !notes.length
            "
            class="space-y-4"
          >
            <div class="rounded-lg border border-dashed border-default py-8 text-center">
              <UIcon name="i-lucide-check-check" class="mx-auto size-8 text-success" />
              <p class="mt-3 text-sm text-muted">You're all caught up.</p>
            </div>
            <NotificationsSpotTheBugCard />
          </div>

          <div v-else-if="inboxItems.length" class="space-y-2.5">
            <NotificationsInboxCard
              v-for="item in inboxItems"
              :key="`${item.provider}:${item.id}`"
              :item="item"
            />
          </div>

          <!-- Awareness section: resolved threads and noisy check failures, kept
               at the bottom so they never sit above what needs attention. -->
          <div v-if="resolvedCount || ciCount" class="space-y-3 pt-2">
            <p class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              For your awareness
            </p>

            <NotificationsGroupCard
              v-if="resolvedCount"
              icon="i-lucide-circle-check-big"
              icon-class="bg-elevated text-muted"
              title="Recently resolved"
              :subtitle="`${resolvedCount} thread${resolvedCount === 1 ? '' : 's'} closed or merged — here so you know why they left your inbox`"
              :count="resolvedCount"
              count-color="neutral"
            >
              <ul class="divide-y divide-default">
                <li v-for="item in resolvedItems" :key="`${item.provider}:${item.id}`">
                  <div class="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <UIcon
                      :name="resolvedMeta(item).icon"
                      class="size-4 shrink-0"
                      :class="resolvedMeta(item).class"
                    />
                    <NuxtLink
                      :to="item.to || undefined"
                      :href="!item.to ? item.url || undefined : undefined"
                      :target="!item.to ? '_blank' : undefined"
                      class="min-w-0 flex-1 truncate text-default hover:text-primary"
                    >
                      {{ item.title }}
                      <span v-if="item.number" class="text-muted">#{{ item.number }}</span>
                    </NuxtLink>
                    <span
                      v-if="item.updatedAt"
                      class="hidden shrink-0 text-xs text-muted sm:inline"
                      >{{ formatRelativeTime(item.updatedAt) }}</span
                    >
                    <UButton
                      icon="i-lucide-check"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      aria-label="Mark as read"
                      @click="markRead(item)"
                    />
                  </div>
                </li>
              </ul>
            </NotificationsGroupCard>

            <NotificationsGroupCard
              v-if="ciCount"
              icon="i-lucide-circle-x"
              icon-class="bg-error/10 text-error"
              title="Failing checks"
              :subtitle="`${ciCount} failed check${ciCount === 1 ? '' : 's'} across ${ciGroups.length} ${ciGroups.length === 1 ? 'repository' : 'repositories'}`"
              :count="ciCount"
              count-color="error"
            >
              <ul class="divide-y divide-default">
                <li v-for="g in ciGroups" :key="g.key">
                  <div class="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <UIcon name="i-lucide-git-branch" class="size-4 shrink-0 text-muted" />
                    <NuxtLink
                      :to="g.to || undefined"
                      :href="!g.to ? g.url || undefined : undefined"
                      :target="!g.to ? '_blank' : undefined"
                      class="min-w-0 flex-1 truncate text-default transition hover:text-primary"
                    >
                      {{ g.repo.fullName }}
                    </NuxtLink>
                    <span class="shrink-0 text-xs font-medium text-error"
                      >failed {{ g.count }}&times;</span
                    >
                    <span v-if="g.latestAt" class="hidden shrink-0 text-xs text-muted sm:inline">{{
                      formatRelativeTime(g.latestAt)
                    }}</span>
                    <UButton
                      icon="i-lucide-check"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      aria-label="Mark resolved"
                      @click="completeCiGroup(g)"
                    />
                  </div>
                </li>
              </ul>
            </NotificationsGroupCard>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
