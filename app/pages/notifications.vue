<script setup lang="ts">
import type { ForgeNotificationKind } from '~/types/forge'

const { items, loading, notes, unreadCount, load } = useNotifications()
const { isAuthenticated } = useAuth()

onMounted(load)

const kindIcon: Record<ForgeNotificationKind, string> = {
  issue: 'i-lucide-circle-dot',
  pull: 'i-lucide-git-pull-request',
  discussion: 'i-lucide-messages-square',
  commit: 'i-lucide-git-commit-horizontal',
  release: 'i-lucide-tag',
  mention: 'i-lucide-at-sign',
  ci: 'i-lucide-play',
  other: 'i-lucide-bell'
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

          <div v-if="loading && !items.length" class="space-y-2">
            <USkeleton v-for="i in 5" :key="i" class="h-14 w-full" />
          </div>

          <div
            v-else-if="!items.length && !notes.length"
            class="rounded-lg border border-dashed border-default py-16 text-center"
          >
            <UIcon name="i-lucide-check-check" class="mx-auto size-8 text-success" />
            <p class="mt-3 text-sm text-muted">
              You're all caught up.
            </p>
          </div>

          <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default">
            <li v-for="n in items" :key="`${n.provider}:${n.id}`">
              <NuxtLink
                :to="n.to || undefined"
                :href="!n.to ? (n.url || undefined) : undefined"
                :target="!n.to ? '_blank' : undefined"
                class="flex items-start gap-3 px-4 py-3 transition hover:bg-elevated/40"
              >
                <span
                  class="mt-1.5 size-2 shrink-0 rounded-full"
                  :class="n.unread ? 'bg-primary' : 'bg-transparent'"
                />
                <UIcon :name="kindIcon[n.kind]" class="mt-0.5 size-4 shrink-0 text-muted" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-default">{{ n.title }}</p>
                  <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    <ForgeIcon :provider="n.provider" class="size-3" />
                    <span v-if="n.repo">{{ n.repo.fullName }}</span>
                    <span v-if="n.reason" class="capitalize">· {{ n.reason.replace(/_/g, ' ') }}</span>
                    <span v-if="n.updatedAt">· {{ formatRelativeTime(n.updatedAt) }}</span>
                  </div>
                </div>
              </NuxtLink>
            </li>
          </ul>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
