<script setup lang="ts">
import type { ExplorePeriod, ExploreScope } from '~/composables/useExplore'

const { repos, loading, notes, load } = useExplore()
const { isAuthenticated } = useAuth()

const route = useRoute()
const scope = ref<ExploreScope>('trending')
const period = ref<ExplorePeriod>('weekly')
const language = ref(String(route.query.lang || 'all'))

const scopeItems = computed(() => [
  { label: 'Trending', value: 'trending', icon: 'i-lucide-flame' },
  { label: 'Popular', value: 'popular', icon: 'i-lucide-star' },
  ...(isAuthenticated.value ? [{ label: 'Following', value: 'following', icon: 'i-lucide-users' }] : [])
])

const periodItems = [
  { label: 'Today', value: 'daily' },
  { label: 'This week', value: 'weekly' },
  { label: 'This month', value: 'monthly' }
]

const languages = ['all', 'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Vue', 'C++', 'Zig']

function reload(): void {
  const lang = language.value && language.value !== 'all' ? language.value : undefined
  load({ scope: scope.value, period: period.value, language: lang, limit: 30 })
}

watch([scope, period, language], reload)
onMounted(reload)
</script>

<template>
  <UDashboardPanel id="explore">
    <template #header>
      <UDashboardNavbar title="Explore">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="loading"
            aria-label="Refresh"
            @click="reload"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6 py-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UTabs
            v-model="scope"
            :items="scopeItems"
            :content="false"
            size="sm"
            class="w-auto"
          />
          <div class="flex items-center gap-2">
            <USelect
              v-if="scope === 'trending'"
              v-model="period"
              :items="periodItems"
              size="sm"
              class="w-36"
            />
            <USelect
              v-model="language"
              :items="languages.map((l) => ({ label: l === 'all' ? 'Any language' : l, value: l }))"
              size="sm"
              class="w-40"
            />
          </div>
        </div>

        <div v-if="notes.length" class="space-y-2">
          <UAlert
            v-for="(n, i) in notes"
            :key="i"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :description="n"
            :ui="{ description: 'text-xs' }"
          />
        </div>

        <div v-if="loading && !repos.length" class="grid gap-3 sm:grid-cols-2">
          <USkeleton v-for="i in 6" :key="i" class="h-28 w-full" />
        </div>

        <div v-else-if="!repos.length" class="rounded-lg border border-dashed border-default py-16 text-center">
          <UIcon name="i-lucide-telescope" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm text-muted">
            Nothing to explore right now.
          </p>
          <p class="mx-auto mt-1 max-w-md text-xs text-muted">
            GitHub throttles anonymous discovery to a few requests per minute. Connect your GitHub account in
            <NuxtLink to="/settings/accounts" class="text-primary hover:underline">settings</NuxtLink>
            to raise the limit, or try again in a moment.
          </p>
          <UButton
            class="mt-4"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="subtle"
            size="sm"
            label="Try again"
            :loading="loading"
            @click="reload"
          />
        </div>

        <div v-else class="grid gap-3 sm:grid-cols-2">
          <SearchResultRepo v-for="r in repos" :key="`${r.provider}:${r.fullName}`" :repo="r" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
