<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const input = ref(String(route.query.q ?? ''))
const { results, totals, loading, notes, isEmpty, run, parsed } = useSearch()

function submit(): void {
  const q = input.value.trim()
  router.replace({ query: q ? { q } : {} })
}

function applySyntaxExample(q: string): void {
  input.value = q
  submit()
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(input, () => {
  clearTimeout(debounce)
  debounce = setTimeout(submit, 450)
})

// Browsers don't expose "hard vs. soft reload" to page JS — a full page
// reload (Shift+F5/Cmd+Shift+R is always one) is the closest detectable signal
// for "give me fresh results", so bypass the search cache once on the first
// run after any reload.
const isReload =
  import.meta.client &&
  (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
    ?.type === 'reload'
let firstRun = true

watch(
  () => route.query.q,
  (q) => {
    const s = String(q ?? '')
    if (s !== input.value) input.value = s
    run(s, firstRun && isReload ? { noCache: true } : undefined)
    firstRun = false
  },
  { immediate: true }
)

const hasQuery = computed(() => !!String(route.query.q ?? '').trim())

const syntax = [
  { q: 'react OR vue', d: 'either term' },
  { q: 'auth NOT test', d: 'exclude a term' },
  { q: '"exact phrase"', d: 'match a phrase' },
  { q: 'language:rust stars:>100', d: 'qualifiers' },
  { q: 'provider:github type:issues', d: 'scope providers & types' },
  { q: 'provider:github type:discussions', d: 'scope to discussions' },
  { q: 'owner:tangled.org parser', d: 'search a Tangled owner' }
]
</script>

<template>
  <UDashboardPanel id="search">
    <template #header>
      <UDashboardNavbar title="Search">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-4xl space-y-6 py-2">
        <UInput
          v-model="input"
          size="xl"
          icon="i-lucide-search"
          placeholder="Search repos, code, issues, discussions & people across every forge…"
          autofocus
          class="w-full"
          :ui="{ trailing: 'pe-1' }"
          @keydown.enter="submit"
        >
          <template #trailing>
            <UButton size="xs" color="neutral" variant="subtle" label="Search" @click="submit" />
          </template>
        </UInput>

        <!-- Syntax hints when idle -->
        <div v-if="!hasQuery" class="space-y-4">
          <p class="text-sm text-muted">
            One search across GitHub and Tangled. Combine terms with <UKbd>OR</UKbd>,
            <UKbd>NOT</UKbd>, parentheses and <code class="text-default">key:value</code> qualifiers
            — GitHub-style.
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="s in syntax"
              :key="s.q"
              type="button"
              class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2 text-left text-sm transition hover:border-primary hover:bg-elevated/40"
              @click="applySyntaxExample(s.q)"
            >
              <code class="truncate text-primary">{{ s.q }}</code>
              <span class="shrink-0 text-xs text-muted">{{ s.d }}</span>
            </button>
          </div>
        </div>

        <template v-else>
          <!-- Provider / note banners -->
          <div v-if="notes.length" class="space-y-2">
            <UAlert
              v-for="(n, i) in notes"
              :key="i"
              color="warning"
              variant="subtle"
              icon="i-lucide-info"
              :description="n"
              :ui="{ description: 'text-xs' }"
            />
          </div>

          <div v-if="loading && isEmpty" class="space-y-3">
            <USkeleton v-for="i in 4" :key="i" class="h-16 w-full" />
          </div>

          <div
            v-else-if="isEmpty"
            class="rounded-lg border border-dashed border-default py-16 text-center"
          >
            <UIcon name="i-lucide-search-x" class="mx-auto size-8 text-muted" />
            <p class="mt-3 text-sm text-muted">
              No results for <span class="font-medium text-default">{{ parsed.raw }}</span
              >.
            </p>
            <p class="mt-1 text-xs text-muted">Try broadening your terms or removing qualifiers.</p>
          </div>

          <div v-else class="space-y-8">
            <div v-if="loading" class="flex items-center gap-2 text-xs text-muted">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />Searching…
            </div>

            <SearchGroup
              title="Repositories"
              icon="i-lucide-book-marked"
              :count="results.repos.length"
              :total="totals.repos"
            >
              <SearchResultRepo
                v-for="r in results.repos"
                :key="`${r.provider}:${r.fullName}`"
                :repo="r"
              />
            </SearchGroup>

            <SearchGroup
              title="Code"
              icon="i-lucide-code"
              :count="results.code.length"
              :total="totals.code"
            >
              <SearchResultCode v-for="(c, i) in results.code" :key="i" :code="c" />
            </SearchGroup>

            <SearchGroup
              title="Issues & pull requests"
              icon="i-lucide-circle-dot"
              :count="results.issues.length"
              :total="totals.issues"
            >
              <SearchResultIssue
                v-for="(it, i) in results.issues"
                :key="`${it.provider}:${it.id}:${i}`"
                :issue="it"
              />
            </SearchGroup>

            <SearchGroup
              title="Discussions"
              icon="i-lucide-messages-square"
              :count="results.discussions.length"
              :total="totals.discussions"
            >
              <SearchResultDiscussion
                v-for="(d, i) in results.discussions"
                :key="`${d.provider}:${d.id}:${i}`"
                :discussion="d"
              />
            </SearchGroup>

            <SearchGroup
              title="People"
              icon="i-lucide-users"
              :count="results.users.length"
              :total="totals.users"
            >
              <SearchResultUser
                v-for="u in results.users"
                :key="`${u.provider}:${u.login}`"
                :user="u"
              />
            </SearchGroup>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
