<script setup lang="ts">
import type { ForgeCommit } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const { provider, owner, name, forge, locator, defaultBranch } = useRepoContext()

const commits = ref<ForgeCommit[]>([])
const cursor = ref<string | undefined>()
const loading = ref(false)
const error = ref<string | null>(null)
const done = ref(false)

async function loadMore(reset = false): Promise<void> {
  if (loading.value || !forge.value?.listCommits) return
  loading.value = true
  error.value = null
  try {
    const page = await forge.value.listCommits(locator.value, defaultBranch.value, {
      cursor: reset ? undefined : cursor.value,
      limit: 30
    })
    if (reset) commits.value = []
    commits.value.push(...page.items)
    cursor.value = page.cursor
    done.value = !page.cursor || page.items.length === 0
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load commits.'
  } finally {
    loading.value = false
  }
}

watch([provider, owner, name], () => {
  done.value = false
  cursor.value = undefined
  loadMore(true)
})
onMounted(() => loadMore(true))
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading && !commits.length" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-14 w-full" />
    </div>

    <UAlert
      v-else-if="error && !commits.length"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load commits"
      :description="error"
    />

    <template v-else>
      <ForgeCommitList :commits="commits" :provider="provider" :owner="owner" :repo="name" />
      <div class="flex justify-center">
        <UButton
          v-if="!done"
          :loading="loading"
          color="neutral"
          variant="subtle"
          label="Load more"
          @click="loadMore()"
        />
      </div>
    </template>
  </div>
</template>
