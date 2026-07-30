<script setup lang="ts">
import { aggregateTimeline, type TimelineEntry } from '~/lib/timeline-aggregate'

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

onMounted(() => {
  ensureLoaded(tab.value)
})
watch(tab, (t) => ensureLoaded(t))

const activeLoading = computed(() => (tab.value === 'me' ? meLoading.value : friendsLoading.value))

interface DayGroup {
  key: string
  label: string
  entries: TimelineEntry[]
}

function dayLabel(d: Date): string {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return new Intl.DateTimeFormat('en', { weekday: 'long' }).format(d)
  return formatDate(d)
}

function groupByDay(entries: TimelineEntry[]): DayGroup[] {
  const groups: DayGroup[] = []
  let cur: DayGroup | null = null
  for (const it of entries) {
    const d = new Date(it.createdAt)
    const key = Number.isNaN(d.getTime())
      ? 'unknown'
      : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!cur || cur.key !== key) {
      cur = { key, label: Number.isNaN(d.getTime()) ? 'Earlier' : dayLabel(d), entries: [] }
      groups.push(cur)
    }
    cur.entries.push(it)
  }
  return groups
}

// Cache the aggregation itself (not just the raw fetch) — folding a burst of
// events into one entry is cheap per item but the list can be a few hundred
// long, so avoid redoing it on every unrelated reactive update.
const meGroups = computed(() => groupByDay(aggregateTimeline(meItems.value)))
const friendsGroups = computed(() => groupByDay(aggregateTimeline(friendsItems.value)))
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
        <div
          v-if="!isAuthenticated"
          class="rounded-lg border border-dashed border-default py-16 text-center"
        >
          <UIcon name="i-lucide-lock" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm text-muted">Sign in to see your activity timeline.</p>
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
              Your recent contributions across every connected forge, newest first. Related events
              (like a PR's opens, reviews and merge, or a run of pushes) are folded together — open
              one to see the details.
            </template>
            <template v-else>
              Recent activity from the people you follow, newest first, folded the same way.
            </template>
          </p>

          <!-- Me -->
          <div v-show="tab === 'me'" class="space-y-6">
            <CommonDismissibleAlert
              v-if="meNote"
              storage-key="timeline-note:me"
              :description="meNote"
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

            <div v-if="meLoading && !meItems.length" class="space-y-2">
              <USkeleton v-for="i in 6" :key="i" class="h-14 w-full" />
            </div>

            <div
              v-else-if="!meItems.length && !meNote"
              class="rounded-lg border border-dashed border-default py-16 text-center"
            >
              <UIcon name="i-lucide-activity" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm text-muted">No recent activity yet.</p>
            </div>

            <section v-for="g in meGroups" v-else :key="g.key" class="space-y-2">
              <h3 class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {{ g.label }}
              </h3>
              <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default">
                <li v-for="entry in g.entries" :key="entry.key">
                  <TimelineContributionRow :entry="entry" />
                </li>
              </ul>
            </section>
          </div>

          <!-- Friends -->
          <div v-show="tab === 'friends'" class="space-y-6">
            <CommonDismissibleAlert
              v-if="friendsNote"
              storage-key="timeline-note:friends"
              :description="friendsNote"
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

            <div v-if="friendsLoading && !friendsItems.length" class="space-y-2">
              <USkeleton v-for="i in 6" :key="i" class="h-14 w-full" />
            </div>

            <div
              v-else-if="!friendsItems.length && !friendsNote"
              class="rounded-lg border border-dashed border-default py-16 text-center"
            >
              <UIcon name="i-lucide-users" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm text-muted">No recent activity from the people you follow.</p>
            </div>

            <section v-for="g in friendsGroups" v-else :key="g.key" class="space-y-2">
              <h3 class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {{ g.label }}
              </h3>
              <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default">
                <li v-for="entry in g.entries" :key="entry.key">
                  <TimelineContributionRow :entry="entry" show-actor />
                </li>
              </ul>
            </section>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
