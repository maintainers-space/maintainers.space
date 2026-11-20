<script setup lang="ts">
import type { Commit, Cursor } from 'forges'
import { useRepoContext } from '~/composables/useRepoContext'
import { cached, TTL } from '~/lib/cache'
import { readCommits } from '~/lib/forges/reads'

const { provider, owner, name, forge, meta, defaultBranch } = useRepoContext()

const commits = ref<Commit[]>([])
const cursor = ref<Cursor | undefined>()
const loading = ref(false)
const error = ref<string | null>(null)
const done = ref(false)

async function loadMore(reset = false): Promise<void> {
  const f = forge.value
  const repo = meta.value
  if (loading.value || !f || !repo || !f.can('commits.list')) return
  loading.value = true
  error.value = null
  try {
    // Only the first page is persisted/offline-cached — pagination cursors
    // are inherently online-only, and offline users just can't "load more".
    if (reset) {
      const first = await cached(
        `commits:${provider.value}:${owner.value}:${name.value}:${defaultBranch.value}`,
        () => readCommits(f, repo, defaultBranch.value, 30),
        { ttl: TTL.SHORT }
      )
      commits.value = first
      // Tangled's bridge pages by sha; the package pages by cursor.
      done.value = true
      if (f.forge !== 'tangled') {
        const page = await f.commits
          .list(repo.ref, {
            perPage: 30,
            ref: defaultBranch.value
          })
          .page()
        cursor.value = page.cursor
        done.value = !page.cursor
      }
    } else {
      const page = await f.commits
        .list(repo.ref, {
          cursor: cursor.value,
          perPage: 30,
          ref: defaultBranch.value
        })
        .page()
      commits.value.push(...page.items)
      cursor.value = page.cursor
      done.value = !page.cursor || page.items.length === 0
    }
  } catch (e) {
    error.value = forgeErrorMessage(e, 'Failed to load commits.')
  } finally {
    loading.value = false
  }
}

watch([provider, owner, name, meta], () => {
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
