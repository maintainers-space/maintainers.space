<script setup lang="ts">
import { getForge } from '~/lib/forges'
import { fetchPublicProfile, listPublicRecords } from '~/lib/atproto/public'
import { FORGE_ACCOUNT_COLLECTION, type ForgeAccountRecord } from '~/composables/useForgeAccounts'
import type { ForgeIssue, ForgeRepo } from '~/types/forge'

const route = useRoute()
const { get: getToken } = useForgeTokens()
const handle = computed(() => String(route.params.handle))

// 1) atproto identity + profile card.
const { data: profile, pending: profilePending, error: profileError } = useAsyncData(
  `profile:${handle.value}`,
  () => fetchPublicProfile(handle.value),
  { watch: [handle] }
)

// 2) Linked forge accounts (public dev.koinon.forgeAccount records).
const { data: accounts } = useAsyncData(
  `profile-accounts:${handle.value}`,
  async () => {
    const recs = await listPublicRecords<ForgeAccountRecord>(handle.value, FORGE_ACCOUNT_COLLECTION)
    return recs
      .map(r => r.value)
      .filter(a => a?.provider && a?.username)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  { watch: [handle], default: () => [] as ForgeAccountRecord[] }
)

const githubLogins = computed(() =>
  (accounts.value ?? []).filter(a => a.provider === 'github').map(a => a.username)
)

// Gate the "verified" badge on a real signature check, not the record's own
// (forgeable) `verified` flag.
const { isVerified, check } = useForgeAttestations()
watch(
  [accounts, () => profile.value?.did],
  () => { check(profile.value?.did, accounts.value ?? []) },
  { immediate: true }
)

// 3) Repositories across the atproto (Tangled) identity + linked GitHub accounts.
const { data: repos, pending: reposPending } = useAsyncData(
  `profile-repos:${handle.value}`,
  async () => {
    const token = getToken('github')
    const tangled = getForge('tangled')
    const gh = getForge('github')
    const jobs: Promise<ForgeRepo[]>[] = []

    if (tangled?.listRepos) {
      jobs.push(tangled.listRepos(handle.value).catch(() => [] as ForgeRepo[]))
    }
    if (gh?.listRepos) {
      for (const login of githubLogins.value) {
        jobs.push(gh.listRepos(login, { token }).catch(() => [] as ForgeRepo[]))
      }
    }
    const out = (await Promise.all(jobs)).flat()
    return out
      .filter(r => !r.isFork)
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
      .slice(0, 24)
  },
  { watch: [handle, accounts], default: () => [] as ForgeRepo[] }
)

// 4) Recent activity — issues/PRs authored and commented on (GitHub, best-effort).
const { data: activity, pending: activityPending } = useAsyncData(
  `profile-activity:${handle.value}`,
  async (): Promise<{ authored: ForgeIssue[], commented: ForgeIssue[] }> => {
    const gh = getForge('github')
    const primary = githubLogins.value[0]
    if (!gh?.searchIssues || !primary) return { authored: [], commented: [] }
    const token = getToken('github')
    const opts = { token, sort: 'updated' as const, order: 'desc' as const, limit: 8 }
    const [authored, commented] = await Promise.all([
      gh.searchIssues(`author:${primary}`, opts).then(r => r.items).catch(() => [] as ForgeIssue[]),
      gh.searchIssues(`commenter:${primary} -author:${primary}`, opts).then(r => r.items).catch(() => [] as ForgeIssue[])
    ])
    return { authored, commented }
  },
  { watch: [handle, accounts], default: () => ({ authored: [], commented: [] }) }
)

const displayName = computed(() => profile.value?.displayName || profile.value?.handle || handle.value)
const bskyUrl = computed(() => profile.value ? `https://bsky.app/profile/${profile.value.did}` : undefined)

function accountUrl(a: ForgeAccountRecord): string | undefined {
  if (a.profileUrl) return a.profileUrl
  const f = getForge(a.provider)
  return f?.ownerWebUrl ? f.ownerWebUrl(a.username) : undefined
}

useHead(() => ({ title: `${displayName.value} · koinon` }))
</script>

<template>
  <UDashboardPanel id="profile">
    <template #header>
      <UDashboardNavbar :title="displayName">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-8 py-6">
        <div v-if="profilePending && !profile" class="space-y-4">
          <div class="flex items-center gap-4">
            <USkeleton class="size-16 rounded-full" />
            <div class="space-y-2">
              <USkeleton class="h-6 w-48" />
              <USkeleton class="h-4 w-32" />
            </div>
          </div>
        </div>

        <UAlert
          v-else-if="profileError || !profile"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Profile not found"
          :description="`We couldn't resolve an atproto identity for “${handle}”.`"
        />

        <template v-else>
          <!-- Identity header -->
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
            <UAvatar
              :src="profile.avatar"
              :alt="displayName"
              size="3xl"
              :icon="!profile.avatar ? 'i-lucide-user' : undefined"
            />
            <div class="min-w-0 flex-1">
              <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
                {{ displayName }}
              </h1>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span>@{{ profile.handle }}</span>
                <span class="font-mono text-xs">· {{ shortDid(profile.did) }}</span>
              </div>
              <p v-if="profile.description" class="mt-2 max-w-2xl whitespace-pre-line text-sm text-default">
                {{ profile.description }}
              </p>
            </div>
            <UButton
              v-if="bskyUrl"
              :to="bskyUrl"
              target="_blank"
              icon="i-lucide-external-link"
              color="neutral"
              variant="subtle"
              size="sm"
              label="Bluesky"
            />
          </div>

          <!-- Linked accounts -->
          <section class="space-y-3">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
              Linked accounts
            </h2>
            <div v-if="accounts && accounts.length" class="flex flex-wrap gap-2">
              <UButton
                v-for="a in accounts"
                :key="`${a.provider}:${a.username}`"
                :to="accountUrl(a)"
                :target="accountUrl(a) ? '_blank' : undefined"
                color="neutral"
                variant="outline"
                size="md"
                class="gap-2"
              >
                <ForgeIcon :provider="a.provider" class="size-4" />
                <span>{{ a.username }}</span>
                <UIcon
                  v-if="isVerified(profile?.did, a)"
                  name="i-lucide-shield-check"
                  class="size-4 text-primary"
                />
              </UButton>
            </div>
            <p v-else class="text-sm text-muted">
              No forge accounts linked yet.
            </p>
          </section>

          <!-- Repositories -->
          <section class="space-y-3">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
              Repositories
            </h2>
            <div v-if="reposPending && !repos?.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <USkeleton v-for="i in 3" :key="i" class="h-28 w-full" />
            </div>
            <div v-else-if="repos && repos.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <HomeRepoMiniCard
                v-for="r in repos"
                :key="`${r.provider}:${r.fullName}`"
                :repo="r"
              />
            </div>
            <p v-else class="text-sm text-muted">
              No public repositories found.
            </p>
          </section>

          <!-- Activity -->
          <section v-if="githubLogins.length" class="grid gap-4 lg:grid-cols-2">
            <HomeActionList
              title="Created"
              icon="i-lucide-git-pull-request"
              :items="activity?.authored ?? []"
              :loading="activityPending"
              empty-text="No recent issues or pull requests."
            />
            <HomeActionList
              title="Participated in"
              icon="i-lucide-messages-square"
              :items="activity?.commented ?? []"
              :loading="activityPending"
              empty-text="No recent comments."
            />
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
