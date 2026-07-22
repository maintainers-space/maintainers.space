<script setup lang="ts">
import type { ForgeContribution } from '~/types/forge'

const { isAuthenticated } = useAuth()
const {
  meItems,
  friendsItems,
  meLoading,
  friendsLoading,
  meLoaded,
  friendsLoaded,
  meNote,
  friendsNote,
  loadMe,
  loadFriends
} = useTimeline()

const tab = useRouteTab('tab', ['me', 'friends'] as const, 'me')

const tabItems = [
  { label: 'Me', icon: 'i-lucide-user', value: 'me' },
  { label: 'Friends', icon: 'i-lucide-users', value: 'friends' }
]

function ensureLoaded(which: 'me' | 'friends') {
  if (!isAuthenticated.value) return
  if (which === 'me' && !meLoaded.value && !meLoading.value) loadMe()
  if (which === 'friends' && !friendsLoaded.value && !friendsLoading.value) loadFriends()
}

function refresh() {
  if (tab.value === 'me') loadMe(true)
  else loadFriends(true)
}

onMounted(() => ensureLoaded(tab.value))
watch(tab, t => ensureLoaded(t))

const activeLoading = computed(() => (tab.value === 'me' ? meLoading.value : friendsLoading.value))

// --- Day grouping: turn the flat, date-sorted feed into a real timeline. ---
interface DayGroup { key: string, label: string, items: ForgeContribution[] }

function dayLabel(d: Date): string {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return new Intl.DateTimeFormat('en', { weekday: 'long' }).format(d)
  return formatDate(d)
}

function groupByDay(items: ForgeContribution[]): DayGroup[] {
  const groups: DayGroup[] = []
  let cur: DayGroup | null = null
  for (const it of items) {
    const d = new Date(it.createdAt)
    const key = Number.isNaN(d.getTime()) ? 'unknown' : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!cur || cur.key !== key) {
      cur = { key, label: Number.isNaN(d.getTime()) ? 'Earlier' : dayLabel(d), items: [] }
      groups.push(cur)
    }
    cur.items.push(it)
  }
  return groups
}

const meGroups = computed(() => groupByDay(meItems.value))
const friendsGroups = computed(() => groupByDay(friendsItems.value))
</script>

<template>
  <UDashboardPanel id="timeline">
    <template #header>
      <UDashboardNavbar title="Timeline">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="activeLoading"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-4 py-2">
        <div v-if="!isAuthenticated" class="rounded-lg border border-dashed border-default py-16 text-center">
          <UIcon name="i-lucide-lock" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm text-muted">
            Sign in to see your activity timeline.
          </p>
        </div>

        <template v-else>
          <UTabs
            v-model="tab"
            :items="tabItems"
            :content="false"
            size="sm"
            class="w-full sm:w-64"
          />

          <p class="text-xs text-muted">
            <template v-if="tab === 'me'">
              Your recent contributions across every connected forge, newest first.
            </template>
            <template v-else>
              Recent activity from the people you follow, newest first.
            </template>
          </p>

          <!-- Me -->
          <div v-show="tab === 'me'" class="space-y-6">
            <UAlert
              v-if="meNote"
              color="neutral"
              variant="subtle"
              icon="i-lucide-info"
              :description="meNote"
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

            <div v-if="meLoading && !meItems.length" class="space-y-2">
              <USkeleton v-for="i in 6" :key="i" class="h-14 w-full" />
            </div>

            <div
              v-else-if="!meItems.length && !meNote"
              class="rounded-lg border border-dashed border-default py-16 text-center"
            >
              <UIcon name="i-lucide-activity" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm text-muted">
                No recent activity yet.
              </p>
            </div>

            <section
              v-for="g in meGroups"
              v-else
              :key="g.key"
              class="space-y-2"
            >
              <h3 class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {{ g.label }}
              </h3>
              <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default">
                <li v-for="c in g.items" :key="`${c.provider}:${c.id}`">
                  <TimelineContributionRow :contribution="c" />
                </li>
              </ul>
            </section>
          </div>

          <!-- Friends -->
          <div v-show="tab === 'friends'" class="space-y-6">
            <UAlert
              v-if="friendsNote"
              color="neutral"
              variant="subtle"
              icon="i-lucide-info"
              :description="friendsNote"
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

            <div v-if="friendsLoading && !friendsItems.length" class="space-y-2">
              <USkeleton v-for="i in 6" :key="i" class="h-14 w-full" />
            </div>

            <div
              v-else-if="!friendsItems.length && !friendsNote"
              class="rounded-lg border border-dashed border-default py-16 text-center"
            >
              <UIcon name="i-lucide-users" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm text-muted">
                No recent activity from the people you follow.
              </p>
            </div>

            <section
              v-for="g in friendsGroups"
              v-else
              :key="g.key"
              class="space-y-2"
            >
              <h3 class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {{ g.label }}
              </h3>
              <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default">
                <li v-for="c in g.items" :key="`${c.provider}:${c.id}`">
                  <TimelineContributionRow :contribution="c" show-actor />
                </li>
              </ul>
            </section>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
