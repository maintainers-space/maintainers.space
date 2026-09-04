<script setup lang="ts">
import { loadRepoCode } from '~/lib/repo-code'
import { useRepoContext } from '~/composables/useRepoContext'

const { provider, owner, name, forge, locator, meta, defaultBranch } = useRepoContext()
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)

const { data, pending, error, refresh } = useLiveAsyncData(
  () => `repo-code:${provider.value}:${owner.value}:${name.value}`,
  async () => {
    const f = forge.value
    // Wait for the parent-provided meta so we browse the correct default branch
    // (and avoid a duplicate repo-meta request — the parent already fetched it).
    if (!f || !meta.value) return null
    return loadRepoCode(f, locator.value, owner.value, name.value, defaultBranch.value)
  },
  { lazy: true, watch: [provider, owner, name, meta, defaultBranch] }
)

async function loadDoc(path: string): Promise<string> {
  const f = forge.value
  if (!f?.getBlob) return ''
  const blob = await f.getBlob(locator.value, defaultBranch.value, path)
  return blob.isBinary ? '' : blob.content
}
</script>

<template>
  <div class="grid gap-6">
    <div v-if="(pending || !meta) && !data" class="space-y-4">
      <USkeleton class="h-64 w-full" />
      <USkeleton class="h-40 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load files"
      :description="
        (error as { message?: string })?.message ||
        'GitHub may be rate-limiting anonymous requests. Connect your GitHub account in settings to raise the limit.'
      "
    >
      <template #actions>
        <UButton color="error" variant="soft" label="Retry" @click="refresh()" />
      </template>
    </UAlert>

    <template v-else-if="data">
      <ForgeRepoBrowser
        :entries="data.entries"
        :base="base"
        :git-ref="defaultBranch"
        :commits-href="`${base}/commits`"
      />
      <ForgeRepoHealthFiles v-if="data.health.length" :files="data.health" :load="loadDoc" />
    </template>
  </div>
</template>
