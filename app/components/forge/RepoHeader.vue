<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ForgeRepo } from '~/types/forge'
import { useOfflineRepos, type RepoRef } from '~/composables/useOfflineRepos'

const props = defineProps<{ repo: ForgeRepo }>()

const offline = useOfflineRepos()
const toast = useToast()
const repoRef: RepoRef = {
  provider: props.repo.provider,
  owner: props.repo.owner,
  name: props.repo.name,
  isPrivate: props.repo.isPrivate
}

const pinned = computed(() =>
  offline.settings.value.pinned.some(
    (r) => r.provider === repoRef.provider && r.owner === repoRef.owner && r.name === repoRef.name
  )
)

async function toggleOffline(): Promise<void> {
  try {
    if (pinned.value) {
      offline.makeUnavailable(repoRef)
      toast.add({ title: 'No longer pinned offline', color: 'neutral' })
    } else {
      await offline.makeAvailable(repoRef)
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

const actionItems = computed<DropdownMenuItem[]>(() => {
  const items: DropdownMenuItem[] = [
    {
      type: 'label',
      label: props.repo.owner,
      avatar: props.repo.ownerAvatar ? { src: props.repo.ownerAvatar } : { icon: 'i-lucide-user' }
    },
    {
      label: `Open on ${props.repo.provider}`,
      icon: 'i-lucide-external-link',
      to: props.repo.url,
      external: true
    }
  ]
  // Private repos are never stored offline (public-only cache), so the pin
  // action only appears for public repos.
  if (!props.repo.isPrivate) {
    items.unshift({
      label: pinned.value ? 'Remove from offline availability' : 'Available offline',
      icon: pinned.value ? 'i-lucide-cloud' : 'i-lucide-cloud-off',
      onSelect: toggleOffline
    })
  }
  return items
})
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

      <div class="flex gap-2">
        <!-- Less-used repo actions live behind a "…" menu so the header stays
             compact while remaining extensible (offline pin, open on platform, …). -->
        <UDropdownMenu
          :items="actionItems"
          :content="{ align: 'end', side: 'bottom' }"
          :ui="{ content: 'w-60' }"
        >
          <UButton color="neutral" variant="ghost" square icon="i-lucide-ellipsis" size="md" />
        </UDropdownMenu>
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
