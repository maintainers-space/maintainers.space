<script setup lang="ts">
import type { Thread } from 'forges'
import { fetchPublicProfile, listPublicRecords } from '~/lib/atproto/public'
import { FORGE_ACCOUNT_COLLECTION, type ForgeAccountRecord } from '~/composables/useForgeAccounts'
import { listOwnerRepos } from '~/lib/forges/reads'
import { ownerWebUrl, repoRefOf } from '~/lib/forges/registry'
import { toRepoCard } from '~/lib/forges/view'
import type { RepoCard } from '~/lib/forges/view'
import { toWorkItem, type WorkItem } from '~/lib/work'

const route = useRoute()
const { providerFor } = useForges()

function forgeFor(providerId: string) {
  const ref = repoRefOf(providerId, '', '')
  return ref ? providerFor(ref) : undefined
}
const handle = computed(() => String(route.params.handle))

const {
  data: profile,
  pending: profilePending,
  error: profileError
} = useLiveAsyncData(`profile:${handle.value}`, () => fetchPublicProfile(handle.value), {
  watch: [handle]
})

const { data: publicAccounts } = useLiveAsyncData(
  `profile-accounts:${handle.value}`,
  async () => {
    const recs = await listPublicRecords<ForgeAccountRecord>(handle.value, FORGE_ACCOUNT_COLLECTION)
    return recs
      .map((r) => r.value)
      .filter((a) => a?.provider && a?.username)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  { watch: [handle], default: () => [] as ForgeAccountRecord[] }
)

const { did: myDid } = useAuth()
const isOwn = computed(() => !!myDid.value && myDid.value === profile.value?.did)

// Public PDS reads can be CORS-blocked on self-hosted PDSes, so your own links
// may not come back over the public endpoint. The authenticated client always
// succeeds, so merge it in (deduped) when viewing your own profile.
const {
  accounts: myAccounts,
  loaded: myAccountsLoaded,
  refresh: refreshMyAccounts
} = useForgeAccounts()
watch(
  isOwn,
  (own) => {
    if (own && !myAccountsLoaded.value) refreshMyAccounts()
  },
  { immediate: true }
)

const accounts = computed<ForgeAccountRecord[]>(() => {
  const base = publicAccounts.value ?? []
  if (!isOwn.value) return base
  const seen = new Set(base.map((a) => `${a.provider}:${a.username}`.toLowerCase()))
  const extra = (myAccounts.value ?? []).filter(
    (a) => !seen.has(`${a.provider}:${a.username}`.toLowerCase())
  )
  return [...base, ...extra]
})

// Repos and activity are gathered uniformly across every linked provider, never
// a single hard-coded one.
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
  () => {
    check(profile.value?.did, accounts.value ?? [])
  },
  { immediate: true }
)

interface LinkedAccountView {
  provider: string
  username: string
  href: string
  verified: boolean
}

/** Public profile URL on the provider's own site. Linked accounts point here. */
function externalProfileUrl(provider: string, username: string, profileUrl?: string): string {
  return profileUrl || ownerWebUrl(provider, username) || '#'
}

// The atproto identity leads the list and is inherently verified; other forges
// are verified only when their server-signed attestation checks out.
const linkedAccounts = computed<LinkedAccountView[]>(() => {
  const out: LinkedAccountView[] = []
  const p = profile.value
  if (p) {
    out.push({
      provider: 'tangled',
      username: p.handle,
      href: externalProfileUrl('tangled', p.handle),
      verified: true
    })
  }
  for (const a of accounts.value ?? []) {
    out.push({
      provider: a.provider,
      username: a.username,
      href: externalProfileUrl(a.provider, a.username, a.profileUrl),
      verified: isVerified(p?.did, a)
    })
  }
  return out
})

// Repos from the Tangled identity and every linked forge are pooled and sorted
// together so the grid never separates one provider from another.
const { data: repos, pending: reposPending } = useLiveAsyncData(
  `profile-repos:${handle.value}`,
  async () => {
    const jobs: Promise<RepoCard[]>[] = []
    const lists: Array<[string, string]> = [['tangled', handle.value]]
    for (const [providerId, logins] of Object.entries(providerLogins.value)) {
      for (const login of logins) lists.push([providerId, login])
    }
    for (const [providerId, owner] of lists) {
      const forge = forgeFor(providerId)
      if (!forge) continue
      jobs.push(
        listOwnerRepos(forge, owner)
          .then((list) => list.map(toRepoCard))
          .catch(() => [] as RepoCard[])
      )
    }
    const out = (await Promise.all(jobs)).flat()
    return out
      .filter((r) => !r.isFork)
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
      .slice(0, 24)
  },
  { watch: [handle, accounts], default: () => [] as RepoCard[] }
)

// Issues/PRs authored and commented on across every forge, pooled and mixed.
const { data: activity, pending: activityPending } = useLiveAsyncData(
  `profile-activity:${handle.value}`,
  async (): Promise<{ authored: WorkItem[]; commented: WorkItem[] }> => {
    const authoredJobs: Promise<Thread[]>[] = []
    const commentedJobs: Promise<Thread[]>[] = []
    for (const [providerId, logins] of Object.entries(providerLogins.value)) {
      const forge = forgeFor(providerId)
      const primary = logins[0]
      if (!forge?.can('search.threads') || !primary) continue
      const query = { direction: 'desc' as const, perPage: 8, sort: 'updated' as const }
      authoredJobs.push(
        forge.search
          .threads({ ...query, author: primary })
          .page()
          .then((r) => r.items)
          .catch(() => [] as Thread[])
      )
      commentedJobs.push(
        forge.search
          .threads({ ...query, involves: primary })
          .page()
          .then((r) => r.items.filter((t) => t.author?.login !== primary))
          .catch(() => [] as Thread[])
      )
    }
    const byRecency = (a: Thread, b: Thread) =>
      (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
    const authored = (await Promise.all(authoredJobs))
      .flat()
      .sort(byRecency)
      .slice(0, 8)
      .map(toWorkItem)
    const commented = (await Promise.all(commentedJobs))
      .flat()
      .sort(byRecency)
      .slice(0, 8)
      .map(toWorkItem)
    return { authored, commented }
  },
  { watch: [handle, accounts], default: () => ({ authored: [], commented: [] }) }
)

const displayName = computed(
  () => profile.value?.displayName || profile.value?.handle || handle.value
)
const bskyUrl = computed(() =>
  profile.value ? `https://bsky.app/profile/${profile.value.did}` : undefined
)

useHead(() => ({ title: `${displayName.value} · maintainers.space` }))
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
              <h2 class="text-2xl font-semibold tracking-tight text-highlighted">
                {{ displayName }}
              </h2>
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
                :to="a.href"
                target="_blank"
                rel="noopener noreferrer"
                color="neutral"
                variant="outline"
                size="md"
                class="gap-2"
              >
                <ForgeIcon :provider="a.provider" class="size-4" />
                <span>{{ a.username }}</span>
                <UIcon v-if="a.verified" name="i-lucide-shield-check" class="size-4 text-primary" />
                <UIcon name="i-lucide-external-link" class="size-3.5 text-muted" />
              </UButton>
            </div>
            <p v-else class="text-sm text-muted">No forge accounts linked yet.</p>
          </section>

          <!-- Repositories -->
          <section class="space-y-3">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">Repositories</h2>
            <div
              v-if="reposPending && !repos?.length"
              class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <USkeleton v-for="i in 3" :key="i" class="h-28 w-full" />
            </div>
            <div v-else-if="repos && repos.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <HomeRepoMiniCard v-for="r in repos" :key="`${r.provider}:${r.fullName}`" :repo="r" />
            </div>
            <p v-else class="text-sm text-muted">No public repositories found.</p>
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
