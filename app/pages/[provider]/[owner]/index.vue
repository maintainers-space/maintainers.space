<script setup lang="ts">
import type { Repo } from 'forges'
import { getForge, ownerWebUrl, repoRefOf } from '~/lib/forges/registry'
import { listOwnerRepos, OWNER_REPO_LIMIT } from '~/lib/forges/reads'
import { toRepoCard } from '~/lib/forges/view'
import type { RepoCard } from '~/lib/forges/view'

const route = useRoute()
const provider = computed(() => String(route.params.provider))
const owner = computed(() => String(route.params.owner))

const forge = computed(() => getForge(provider.value))
const { providerFor } = useForges()

const { data, pending, error, refresh } = useLiveAsyncData<RepoCard[]>(
  () => `owner-repos:${provider.value}:${owner.value}`,
  async () => {
    const ref = repoRefOf(provider.value, owner.value, '')
    const f = ref ? providerFor(ref) : undefined
    if (!f) {
      throw createError({ statusCode: 404, statusMessage: `Unknown provider "${provider.value}"` })
    }
    const list: Repo[] = await listOwnerRepos(f, owner.value)
    return list.map(toRepoCard)
  },
  { lazy: true, watch: [provider, owner] }
)

const avatar = computed(() => data.value?.find((r) => r.ownerAvatar)?.ownerAvatar)
const webUrl = computed(() => ownerWebUrl(provider.value, owner.value))
</script>

<template>
  <UDashboardPanel :id="`owner-${provider}`">
    <template #header>
      <UDashboardNavbar :title="owner">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-4xl space-y-4 py-2">
        <div class="flex items-center gap-3">
          <UAvatar :src="avatar" :alt="owner" icon="i-lucide-user" size="xl" />
          <div class="min-w-0 flex-1">
            <h2 class="text-xl font-semibold text-highlighted [overflow-wrap:anywhere]">
              {{ owner }}
            </h2>
            <p class="flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span class="inline-flex items-center gap-1.5">
                <ForgeIcon :provider="provider" class="size-4" />
                {{ forge?.label ?? provider }} {{ (forge?.ownerLabel ?? 'Owner').toLowerCase() }}
              </span>
              <template v-if="data?.length">
                <span aria-hidden="true">·</span>
                <span
                  >{{ data.length >= OWNER_REPO_LIMIT ? `${OWNER_REPO_LIMIT}+` : data.length }}
                  {{ data.length === 1 ? 'repository' : 'repositories' }}</span
                >
              </template>
            </p>
          </div>
          <UButton
            v-if="webUrl"
            :to="webUrl"
            target="_blank"
            color="neutral"
            variant="outline"
            size="sm"
            trailing-icon="i-lucide-external-link"
            :label="`Open on ${forge?.label ?? provider}`"
            class="shrink-0 max-sm:hidden"
          />
        </div>

        <div v-if="pending" class="space-y-2">
          <USkeleton v-for="i in 4" :key="i" class="h-20 w-full" />
        </div>

        <UAlert
          v-else-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Could not load repositories"
          :description="forgeErrorMessage(error, `No repositories found for ${owner}.`)"
        >
          <template #actions>
            <UButton color="error" variant="soft" label="Retry" @click="refresh()" />
          </template>
        </UAlert>

        <div
          v-else-if="!data?.length"
          class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
        >
          No repositories found for {{ owner }}.
        </div>

        <div v-else class="grid gap-3 sm:grid-cols-2">
          <NuxtLink
            v-for="(r, i) in data"
            :key="`${r.fullName}:${i}`"
            :to="`/${provider}/${owner}/${r.name}`"
            class="group rounded-lg border border-default p-4 transition hover:border-primary hover:bg-elevated/40"
          >
            <div
              class="flex items-center gap-1.5 font-medium text-default group-hover:text-primary"
            >
              <UIcon name="i-lucide-book-marked" class="size-4 text-muted" />
              {{ r.name }}
            </div>
            <p v-if="r.description" class="mt-1 line-clamp-2 text-sm text-muted">
              {{ r.description }}
            </p>
            <div v-if="r.topics.length" class="mt-2 flex flex-wrap gap-1">
              <UBadge
                v-for="t in r.topics.slice(0, 4)"
                :key="t"
                :label="t"
                color="primary"
                variant="subtle"
                size="sm"
                class="rounded-full"
              />
            </div>
          </NuxtLink>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
