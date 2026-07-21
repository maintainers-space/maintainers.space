<script setup lang="ts">
const { repos, loading, load } = useExplore()
const { unreadCount, hasTokens, load: loadNotifs } = useNotifications()

onMounted(() => {
  load({ scope: 'trending', period: 'weekly', limit: 5 })
  if (hasTokens.value) loadNotifs()
})

const top = computed(() => repos.value.slice(0, 5))
</script>

<template>
  <div class="mt-4 space-y-4">
    <NuxtLink
      v-if="hasTokens"
      to="/notifications"
      class="flex items-center justify-between rounded-lg border border-default px-3 py-2 text-sm transition hover:border-primary hover:bg-elevated/40"
    >
      <span class="inline-flex items-center gap-2 text-default">
        <UIcon name="i-lucide-bell" class="size-4" />Notifications
      </span>
      <UBadge
        v-if="unreadCount"
        color="primary"
        variant="solid"
        size="xs"
      >{{ unreadCount }}</UBadge>
    </NuxtLink>

    <div>
      <div class="mb-2 flex items-center justify-between px-1">
        <span class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <UIcon name="i-lucide-flame" class="size-3.5" />Trending
        </span>
        <NuxtLink to="/explore" class="text-xs text-primary hover:underline">More</NuxtLink>
      </div>

      <div v-if="loading && !top.length" class="space-y-2">
        <USkeleton v-for="i in 3" :key="i" class="h-8 w-full" />
      </div>

      <ul v-else class="space-y-0.5">
        <li v-for="r in top" :key="`${r.provider}:${r.fullName}`">
          <NuxtLink
            :to="repoPath(r)"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-elevated/60"
          >
            <ForgeIcon :provider="r.provider" class="size-3.5 shrink-0 text-muted" />
            <span class="min-w-0 flex-1 truncate text-default">{{ r.name }}</span>
            <span v-if="r.stars" class="inline-flex items-center gap-0.5 text-xs text-muted">
              <UIcon name="i-lucide-star" class="size-3" />{{ formatCompactNumber(r.stars) }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
