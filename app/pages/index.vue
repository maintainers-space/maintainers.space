<script setup lang="ts">
import { forgeList, getForge } from '~/lib/forges'

const { isAuthenticated, profile } = useAuth()
const { recent } = useRepoVisits()
const home = useHomeFeed()
const following = useExplore()
const connectBanner = useDismissible('home-connect-account')

const greetingName = computed(() => {
  const p = profile.value
  if (!p) return ''
  if (p.displayName) return p.displayName
  return p.handle?.startsWith('did:') ? shortDid(p.handle) : p.handle
})

const recentRepos = computed(() => recent.value.slice(0, 3))
const followingRepos = computed(() => following.repos.value.slice(0, 6))

// Quick-search: start typing and jump straight into the search page.
const quickQuery = ref('')
function quickSearch(): void {
  const q = quickQuery.value.trim()
  navigateTo(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
}

onMounted(() => {
  if (isAuthenticated.value) {
    home.load()
    following.load({ scope: 'following', limit: 12 })
  }
})

// If the session restores after mount, kick off the loads once.
watch(isAuthenticated, (v) => {
  if (v && !home.loaded.value) {
    home.load()
    following.load({ scope: 'following', limit: 12 })
  }
})

const provider = ref('github')
const owner = ref('')
const repo = ref('')
const providerItems = forgeList.map((f) => ({ label: f.label, value: f.id, icon: f.icon }))
const current = computed(() => getForge(provider.value))

function go(): void {
  const o = owner.value.trim()
  const r = repo.value.trim()
  if (!o || !r) return
  navigateTo(`/${provider.value}/${encodeURIComponent(o)}/${encodeURIComponent(r)}`)
}

// One representative example per registered forge, so no single platform
// dominates this list by accident.
const examples = [
  { provider: 'github', owner: 'nuxt', repo: 'nuxt', description: 'The Nuxt web framework' },
  { provider: 'gitlab', owner: 'gitlab-org', repo: 'gitlab', description: 'GitLab itself' },
  { provider: 'codeberg', owner: 'forgejo', repo: 'forgejo', description: 'Forgejo, on Codeberg' },
  { provider: 'gitea', owner: 'gitea', repo: 'docs', description: 'Gitea documentation' },
  { provider: 'bitbucket', owner: 'atlassian', repo: 'aui', description: 'Atlassian UI library' },
  { provider: 'tangled', owner: 'tangled.org', repo: 'core', description: 'Tangled core' }
]
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Home">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            to="/search"
            icon="i-lucide-search"
            color="neutral"
            variant="ghost"
            size="sm"
            label="Search"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- ============================ Signed in ============================ -->
      <div v-if="isAuthenticated" class="mx-auto w-full max-w-5xl space-y-8 py-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
              {{ greetingName ? `Welcome back, ${greetingName}` : 'Welcome back' }}
            </h1>
            <p class="mt-1 text-sm text-muted">
              Pick up where you left off, or jump into what needs your attention.
            </p>
          </div>
          <UInput
            v-model="quickQuery"
            icon="i-lucide-search"
            placeholder="Search repositories, code, issues…"
            class="w-full sm:w-72"
            @keydown.enter="quickSearch"
          />
        </div>

        <!-- Jump back in: locally-tracked recent repos -->
        <section v-if="recentRepos.length" class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-history" class="size-4 text-muted" />
            <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">Jump back in</h2>
          </div>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <HomeRepoMiniCard
              v-for="r in recentRepos"
              :key="`${r.provider}:${r.fullName}`"
              :repo="r"
            />
          </div>
        </section>

        <!-- Connect account prompt -->
        <UAlert
          v-if="!home.connected.value && !connectBanner.dismissed.value"
          color="primary"
          variant="subtle"
          icon="i-lucide-plug"
          title="Connect a forge account"
          description="Link GitHub or GitLab to see your open pull requests, review requests and assigned issues in one place."
          close
          @update:open="connectBanner.dismiss()"
        >
          <template #actions>
            <UButton
              to="/settings/accounts"
              color="primary"
              variant="solid"
              size="xs"
              label="Connect account"
            />
          </template>
        </UAlert>

        <!-- Actionable feed -->
        <section v-if="home.connected.value" class="grid gap-4 lg:grid-cols-2">
          <HomeActionList
            title="Your pull requests"
            icon="i-lucide-git-pull-request"
            :items="home.myPulls.value"
            :loading="home.loading.value"
            empty-text="No open pull requests authored by you."
          />
          <HomeActionList
            title="Needs your review"
            icon="i-lucide-eye"
            :items="home.reviewRequests.value"
            :loading="home.loading.value"
            empty-text="No pull requests are waiting on your review."
          />
          <HomeActionList
            title="Assigned to you"
            icon="i-lucide-circle-dot"
            :items="home.assignedIssues.value"
            :loading="home.loading.value"
            empty-text="No issues are assigned to you."
            class="lg:col-span-2"
          />
        </section>

        <!-- From people you follow -->
        <section v-if="followingRepos.length" class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-users" class="size-4 text-muted" />
              <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
                From people you follow
              </h2>
            </div>
            <NuxtLink to="/explore" class="text-xs text-primary hover:underline">Explore</NuxtLink>
          </div>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <HomeRepoMiniCard
              v-for="r in followingRepos"
              :key="`${r.provider}:${r.fullName}`"
              :repo="r"
            />
          </div>
        </section>
      </div>

      <!-- ============================ Anonymous =========================== -->
      <div v-else class="mx-auto w-full max-w-3xl space-y-10 py-6">
        <div class="space-y-3 text-center">
          <h1 class="text-3xl font-semibold tracking-tight text-highlighted">
            One place for every forge.
          </h1>
          <p class="text-muted">
            Browse repositories across GitHub and Tangled — and link your forge accounts to your
            atproto identity.
          </p>
        </div>

        <UCard>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <UFormField label="Provider" class="sm:w-40">
              <USelect v-model="provider" :items="providerItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField :label="current?.ownerLabel ?? 'Owner'" class="flex-1">
              <UInput
                v-model="owner"
                :placeholder="current?.ownerPlaceholder"
                class="w-full"
                @keydown.enter="go"
              />
            </UFormField>
            <UFormField label="Repository" class="flex-1">
              <UInput
                v-model="repo"
                :placeholder="current?.repoPlaceholder"
                class="w-full"
                @keydown.enter="go"
              />
            </UFormField>
            <UButton
              label="View"
              icon="i-lucide-arrow-right"
              class="justify-center"
              :disabled="!owner.trim() || !repo.trim()"
              @click="go"
            />
          </div>
        </UCard>

        <div class="space-y-3">
          <h2 class="text-sm font-medium text-muted">Try an example</h2>
          <div class="grid gap-3 sm:grid-cols-3">
            <NuxtLink
              v-for="ex in examples"
              :key="`${ex.provider}/${ex.owner}/${ex.repo}`"
              :to="`/${ex.provider}/${ex.owner}/${ex.repo}`"
              class="group rounded-lg border border-default p-4 transition hover:border-primary hover:bg-elevated/40"
            >
              <div class="flex items-center gap-2 text-sm text-muted">
                <ForgeIcon :provider="ex.provider" class="size-4" />{{ ex.provider }}
              </div>
              <div class="mt-1 font-medium text-default group-hover:text-primary">
                {{ ex.owner }}/{{ ex.repo }}
              </div>
              <p class="mt-1 text-sm text-muted">{{ ex.description }}</p>
            </NuxtLink>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
