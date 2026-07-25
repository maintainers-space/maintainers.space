<script setup lang="ts">
const { isAuthenticated } = useAuth()
const { favourites, hasVisits } = useRepoVisits()
const { repos, loading, load } = useExplore()

// Signed-in users get a personal "Recent" feed only — trending is discovery
// noise once you're logged in. Anonymous visitors see the generic trending list.
const showFavourites = computed(() => isAuthenticated.value && hasVisits.value)
const showTrending = computed(() => !isAuthenticated.value)

function ensureTrending(): void {
  if (showTrending.value && !repos.value.length) {
    load({ scope: 'trending', period: 'weekly', limit: 5 })
  }
}

onMounted(ensureTrending)
watch(showTrending, ensureTrending)

const favTop = computed(() => favourites.value.slice(0, 6))
const top = computed(() => repos.value.slice(0, 5))
</script>

<template>
  <div v-if="showFavourites || showTrending" class="mt-4 space-y-4">
    <div v-if="showFavourites">
      <div class="mb-2 flex items-center justify-between px-1">
        <span
          class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"
        >
          <UIcon name="i-lucide-history" class="size-3.5" />Recent
        </span>
        <NuxtLink to="/explore" class="text-xs text-primary hover:underline">More</NuxtLink>
      </div>

      <ul class="space-y-0.5">
        <li v-for="r in favTop" :key="`${r.provider}:${r.fullName}`">
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

    <div v-else-if="showTrending">
      <div class="mb-2 flex items-center justify-between px-1">
        <span
          class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"
        >
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
