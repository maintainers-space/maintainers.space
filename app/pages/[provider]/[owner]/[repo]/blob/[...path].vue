<script setup lang="ts">
import type { ForgeBlob } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge, locator, defaultBranch } = useRepoContext()
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

const parentDir = computed(() => {
  const p = path.value.split('/').slice(0, -1).join('/')
  return `${base.value}/tree/${encodeURIComponent(gitRef.value)}${p ? '/' + encodePathSegments(p) : ''}`
})

const { data, pending, error } = useLiveAsyncData<ForgeBlob | null>(
  () => `blob:${provider.value}:${owner.value}:${name.value}:${gitRef.value}:${path.value}`,
  async () => {
    if (!forge.value?.getBlob) return null
    return await forge.value.getBlob(locator.value, gitRef.value, path.value)
  },
  { lazy: true, watch: [() => route.fullPath] }
)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-1.5 text-sm">
      <UButton
        :to="parentDir"
        icon="i-lucide-arrow-left"
        size="xs"
        color="neutral"
        variant="ghost"
        label="Back"
      />
      <span class="truncate font-mono text-xs text-muted">{{ path }}</span>
    </div>

    <div v-if="pending && !data" class="space-y-2">
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load file"
      :description="error?.message"
    />
    <ForgeBlobView v-else-if="data" :blob="data" />
  </div>
</template>
