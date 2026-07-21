<script setup lang="ts">
import { getForge, isForgeId } from '~/lib/forges'

const route = useRoute()
const provider = computed(() => String(route.params.provider))
const owner = computed(() => String(route.params.owner))
const repo = computed(() => String(route.params.repo))

const { data, pending, error, refresh } = useAsyncData(
  'repo-overview',
  async () => {
    const forge = getForge(provider.value)
    if (!forge) {
      throw createError({ statusCode: 404, statusMessage: `Unknown provider "${provider.value}"` })
    }
    return await forge.getOverview(owner.value, repo.value)
  },
  { lazy: true, watch: [provider, owner, repo] }
)
</script>

<template>
  <UDashboardPanel :id="`repo-${provider}`">
    <template #header>
      <UDashboardNavbar :title="`${owner}/${repo}`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6 py-2">
        <div v-if="pending" class="space-y-4">
          <USkeleton class="h-7 w-64" />
          <USkeleton class="h-4 w-96" />
          <USkeleton class="h-64 w-full" />
        </div>

        <UAlert
          v-else-if="error || !data"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="isForgeId(provider) ? 'Repository not found' : `Unknown provider: ${provider}`"
          :description="error?.statusMessage || error?.message || 'We could not load this repository.'"
        >
          <template #actions>
            <UButton color="error" variant="soft" label="Retry" @click="refresh()" />
          </template>
        </UAlert>

        <template v-else>
          <ForgeRepoHeader :repo="data.repo" />
          <div class="grid gap-6">
            <ForgeRepoFileTree :entries="data.entries" :default-branch="data.repo.defaultBranch" />
            <ForgeRepoReadme v-if="data.readme" :readme="data.readme" />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
