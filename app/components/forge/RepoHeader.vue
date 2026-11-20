<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Repo } from 'forges'
import { useOfflineRepos, type RepoRef } from '~/composables/useOfflineRepos'
import { toRepoCard } from '~/lib/forges/view'

const props = defineProps<{ repo: Repo }>()
const card = computed(() => toRepoCard(props.repo))

const offline = useOfflineRepos()
const toast = useToast()
const repoRef: RepoRef = {
  provider: card.value.provider,
  owner: card.value.owner,
  name: card.value.name,
  isPrivate: card.value.isPrivate
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
      label: card.value.owner,
      avatar: card.value.ownerAvatar ? { src: card.value.ownerAvatar } : { icon: 'i-lucide-user' }
    },
    {
      label: `Open on ${card.value.provider}`,
      icon: 'i-lucide-external-link',
      to: card.value.url,
      external: true
    }
  ]
  // Private repos are never stored offline (public-only cache), so the pin
  // action only appears for public repos.
  if (!card.value.isPrivate) {
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
        <div v-if="card.isPrivate || card.isFork" class="flex items-center gap-2">
          <UBadge
            v-if="card.isPrivate"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-lock"
            label="Private"
          />
          <UBadge
            v-if="card.isFork"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-git-fork"
            label="Fork"
          />
        </div>

        <h1 class="flex items-center gap-2 text-xl font-semibold text-highlighted">
          <ForgeIcon :provider="card.provider" class="size-5 shrink-0 text-muted" />
          <NuxtLink :to="`/${card.provider}/${card.owner}`" class="text-primary hover:underline">
            {{ card.owner }}
          </NuxtLink>
          <span class="text-muted">/</span>
          <span class="truncate">{{ card.name }}</span>
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
      <span v-if="card.language" class="inline-flex items-center gap-1.5">
        <span class="size-2.5 rounded-full bg-primary" />{{ card.language }}
      </span>
      <ForgeRepoStarButton :repo="repo" />
      <span v-if="card.forks !== undefined" class="inline-flex items-center gap-1">
        <UIcon name="i-lucide-git-fork" class="size-4" />{{ formatCompactNumber(card.forks) }}
      </span>
      <span v-if="repo.openIssueCount !== undefined" class="inline-flex items-center gap-1">
        <UIcon name="i-lucide-circle-dot" class="size-4" />{{
          formatCompactNumber(repo.openIssueCount)
        }}
      </span>
      <a
        v-if="card.homepage"
        :href="card.homepage"
        target="_blank"
        class="inline-flex items-center gap-1 text-primary hover:underline"
      >
        <UIcon name="i-lucide-link" class="size-4" />{{ card.homepage }}
      </a>
      <span v-if="repo.updatedAt" class="inline-flex items-center gap-1">
        <UIcon name="i-lucide-history" class="size-4" />Updated
        {{ formatRelativeTime(repo.updatedAt) }}
      </span>
    </div>

    <div v-if="repo.topics.length" class="flex flex-wrap gap-1.5">
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
