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

const { did: myDid } = useAuth()
const isOwn = computed(() => !!myDid.value && myDid.value === profile.value?.did)

// Any forge account linked to this identity, grouped by provider, so repos and
// activity below are gathered uniformly across GitHub, GitLab, … — never a
// single hard-coded provider.
const providerLogins = computed<Record<string, string[]>>(() => {
  const map: Record<string, string[]> = {}
  for (const a of accounts.value ?? []) {
    if (!a.provider || !a.username) continue
    ;(map[a.provider] ??= []).push(a.username)
  }
  return map
})

const hasLinkedForges = computed(() => Object.keys(providerLogins.value).length > 0)

// Gate the "verified" badge on a real signature check, not the record's own
// (forgeable) `verified` flag.
const { isVerified, check } = useForgeAttestations()
watch(
  [accounts, () => profile.value?.did],
  () => { check(profile.value?.did, accounts.value ?? []) },
  { immediate: true }
)

interface LinkedAccountView { provider: string, username: string, to: string, verified: boolean }

// Unified linked-accounts list. The atproto identity itself *is* a Tangled
// account, so it leads the list and is inherently verified — we resolved the DID
// to render this page. Other forges (GitHub, GitLab, …) are verified only when
// their server-signed attestation checks out. Every entry links to the owner's
// in-app page so browsing stays on koinon instead of bouncing to the forge.
const linkedAccounts = computed<LinkedAccountView[]>(() => {
  const out: LinkedAccountView[] = []
  const p = profile.value
  if (p) {
    out.push({
      provider: 'tangled',
      username: p.handle,
      to: `/tangled/${encodeURIComponent(p.handle)}`,
      verified: true
    })
  }
  for (const a of accounts.value ?? []) {
    out.push({
      provider: a.provider,
      username: a.username,
      to: `/${a.provider}/${encodeURIComponent(a.username)}`,
      verified: isVerified(p?.did, a)
    })
  }
  return out
})

// 3) Repositories across the atproto (Tangled) identity + every linked forge
//    account (GitHub, GitLab, …). All repos are pooled and sorted together so
//    the grid never separates one provider from another.
const { data: repos, pending: reposPending } = useAsyncData(
  `profile-repos:${handle.value}`,
  async () => {
    const tangled = getForge('tangled')
    const jobs: Promise<ForgeRepo[]>[] = []

    if (tangled?.listRepos) {
      jobs.push(tangled.listRepos(handle.value).catch(() => [] as ForgeRepo[]))
    }
    for (const [providerId, logins] of Object.entries(providerLogins.value)) {
      const forge = getForge(providerId)
      if (!forge?.listRepos) continue
      const token = getToken(providerId)
      for (const login of logins) {
        jobs.push(forge.listRepos(login, { token }).catch(() => [] as ForgeRepo[]))
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

// 4) Recent activity — issues/PRs authored and commented on across every forge
//    that supports issue search (GitHub, GitLab, …), pooled and mixed.
const { data: activity, pending: activityPending } = useAsyncData(
  `profile-activity:${handle.value}`,
  async (): Promise<{ authored: ForgeIssue[], commented: ForgeIssue[] }> => {
    const authoredJobs: Promise<ForgeIssue[]>[] = []
    const commentedJobs: Promise<ForgeIssue[]>[] = []
    for (const [providerId, logins] of Object.entries(providerLogins.value)) {
      const forge = getForge(providerId)
      const primary = logins[0]
      if (!forge?.searchIssues || !primary) continue
      const token = getToken(providerId)
      const opts = { token, sort: 'updated' as const, order: 'desc' as const, limit: 8 }
      authoredJobs.push(forge.searchIssues(`author:${primary}`, opts).then(r => r.items).catch(() => [] as ForgeIssue[]))
      commentedJobs.push(forge.searchIssues(`commenter:${primary} -author:${primary}`, opts).then(r => r.items).catch(() => [] as ForgeIssue[]))
    }
    const byRecency = (a: ForgeIssue, b: ForgeIssue) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
    const authored = (await Promise.all(authoredJobs)).flat().sort(byRecency).slice(0, 8)
    const commented = (await Promise.all(commentedJobs)).flat().sort(byRecency).slice(0, 8)
    return { authored, commented }
  },
  { watch: [handle, accounts], default: () => ({ authored: [], commented: [] }) }
)

const displayName = computed(() => profile.value?.displayName || profile.value?.handle || handle.value)
const bskyUrl = computed(() => profile.value ? `https://bsky.app/profile/${profile.value.did}` : undefined)

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
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="isOwn"
                to="/settings"
                icon="i-lucide-settings"
                color="neutral"
                variant="subtle"
                size="sm"
                label="Settings"
              />
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
          </div>

          <!-- Linked accounts -->
          <section class="space-y-3">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
              Linked accounts
            </h2>
            <div v-if="linkedAccounts.length" class="flex flex-wrap gap-2">
              <UButton
                v-for="a in linkedAccounts"
                :key="`${a.provider}:${a.username}`"
                :to="a.to"
                color="neutral"
                variant="outline"
                size="md"
                class="gap-2"
              >
                <ForgeIcon :provider="a.provider" class="size-4" />
                <span>{{ a.username }}</span>
                <UIcon
                  v-if="a.verified"
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
          <section v-if="hasLinkedForges" class="grid gap-4 lg:grid-cols-2">
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
