<script setup lang="ts">
import type { RepoOverview } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const { provider, owner, name, forge, defaultBranch } = useRepoContext()
const base = computed(() => repoPath({ provider: provider.value, owner: owner.value, name: name.value }))

const { data, pending, error } = useAsyncData<RepoOverview | null>(
  () => `repo-overview:${provider.value}:${owner.value}:${name.value}`,
  async () => {
    if (!forge.value) return null
    return await forge.value.getOverview(owner.value, name.value)
  },
  { lazy: true, watch: [provider, owner, name] }
)
</script>

<template>
  <div class="grid gap-6">
    <div v-if="pending && !data" class="space-y-4">
      <USkeleton class="h-40 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load files"
      :description="(error as any)?.message"
    />

    <template v-else-if="data">
      <div class="flex items-center justify-end">
        <UButton
          :to="`${base}/commits`"
          icon="i-lucide-history"
          size="xs"
          color="neutral"
          variant="subtle"
          label="Commits"
        />
      </div>
      <RepoBrowser
        :entries="data.entries"
        :base="base"
        :git-ref="defaultBranch"
      />
      <RepoReadme v-if="data.readme" :readme="data.readme" />
    </template>
  </div>
</template>
