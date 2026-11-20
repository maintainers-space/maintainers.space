<script setup lang="ts">
import type { TreeEntry } from 'forges'
import { useRepoContext } from '~/composables/useRepoContext'
import { readTree } from '~/lib/forges/reads'

const route = useRoute()
const { provider, owner, name, forge, meta, defaultBranch } = useRepoContext()
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)

const parts = computed(() => {
  const raw = route.params.path
  const arr = Array.isArray(raw) ? raw : String(raw ?? '').split('/')
  return arr.filter(Boolean)
})
const gitRef = computed(() => parts.value[0] ?? defaultBranch.value)
const path = computed(() => parts.value.slice(1).join('/'))

const { data, pending, error } = useLiveAsyncData<TreeEntry[]>(
  () => `tree:${provider.value}:${owner.value}:${name.value}:${gitRef.value}:${path.value}`,
  async () => {
    if (!forge.value || !meta.value) return []
    return await readTree(forge.value, meta.value, gitRef.value, path.value)
  },
  { lazy: true, watch: [() => route.fullPath, meta] }
)
</script>

<template>
  <div>
    <div v-if="pending && !data" class="space-y-2">
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-40 w-full" />
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load directory"
      :description="error?.message"
    />
    <ForgeRepoBrowser v-else :entries="data ?? []" :base="base" :git-ref="gitRef" :path="path" />
  </div>
</template>
