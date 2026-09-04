<script setup lang="ts">
import type { ForgeRepo } from '~/types/forge'
import { useOfflineRepos } from '~/composables/useOfflineRepos'

const props = defineProps<{ repo: ForgeRepo }>()

const offline = useOfflineRepos()
const toast = useToast()
const repoRef = computed(() => ({
  provider: props.repo.provider,
  owner: props.repo.owner,
  name: props.repo.name
}))
const pinned = computed(() =>
  offline.settings.value.pinned.some(
    (r) =>
      r.provider === repoRef.value.provider &&
      r.owner === repoRef.value.owner &&
      r.name === repoRef.value.name
  )
)

async function toggleOffline(): Promise<void> {
  try {
    if (pinned.value) {
      offline.makeUnavailable(repoRef.value)
      toast.add({ title: 'No longer pinned offline', color: 'neutral' })
    } else {
      await offline.makeAvailable(repoRef.value)
      toast.add({ title: 'Available offline', color: 'success' })
    }
  } catch (e) {
    toast.add({
      title: 'Could not make available offline',
      description: e instanceof Error ? e.message : String(e),
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 space-y-1.5">
        <div v-if="repo.isPrivate || repo.isFork" class="flex items-center gap-2">
          <UBadge
            v-if="repo.isPrivate"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-lock"
            label="Private"
          />
          <UBadge
            v-if="repo.isFork"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-git-fork"
            label="Fork"
          />
        </div>

        <h1 class="flex items-center gap-2 text-xl font-semibold text-highlighted">
          <ForgeIcon :provider="repo.provider" class="size-5 shrink-0 text-muted" />
          <NuxtLink :to="`/${repo.provider}/${repo.owner}`" class="text-primary hover:underline">
            {{ repo.owner }}
          </NuxtLink>
          <span class="text-muted">/</span>
          <span class="truncate">{{ repo.name }}</span>
        </h1>

        <p v-if="repo.description" class="max-w-2xl text-sm text-muted">
          {{ repo.description }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          :icon="pinned ? 'i-lucide-cloud' : 'i-lucide-cloud-off'"
          :color="pinned ? 'success' : 'neutral'"
          variant="subtle"
          :label="pinned ? 'Pinned offline' : 'Available offline'"
          :aria-pressed="pinned"
          :title="pinned ? 'Remove from offline availability' : 'Make available offline'"
          @click="toggleOffline"
        />
        <UButton
          :to="repo.url"
          target="_blank"
          icon="i-lucide-external-link"
          color="neutral"
          variant="subtle"
          label="Open"
        />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
      <span v-if="repo.language" class="inline-flex items-center gap-1.5">
        <span class="size-2.5 rounded-full bg-primary" />{{ repo.language }}
      </span>
      <ForgeRepoStarButton :repo="repo" />
      <span v-if="repo.forks !== undefined" class="inline-flex items-center gap-1">
        <UIcon name="i-lucide-git-fork" class="size-4" />{{ formatCompactNumber(repo.forks) }}
      </span>
      <span v-if="repo.issues !== undefined" class="inline-flex items-center gap-1">
        <UIcon name="i-lucide-circle-dot" class="size-4" />{{ formatCompactNumber(repo.issues) }}
      </span>
      <a
        v-if="repo.homepage"
        :href="repo.homepage"
        target="_blank"
        class="inline-flex items-center gap-1 text-primary hover:underline"
      >
        <UIcon name="i-lucide-link" class="size-4" />{{ repo.homepage }}
      </a>
      <span v-if="repo.updatedAt" class="inline-flex items-center gap-1">
        <UIcon name="i-lucide-history" class="size-4" />Updated
        {{ formatRelativeTime(repo.updatedAt) }}
      </span>
    </div>

    <div v-if="repo.topics?.length" class="flex flex-wrap gap-1.5">
      <UBadge
        v-for="t in repo.topics"
        :key="t"
        :label="t"
        color="primary"
        variant="subtle"
        size="sm"
        class="rounded-full"
      />
    </div>
  </div>
</template>
