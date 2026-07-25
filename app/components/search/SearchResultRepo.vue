<script setup lang="ts">
import type { ForgeRepo } from '~/types/forge'

const props = defineProps<{ repo: ForgeRepo }>()

const to = computed(
  () =>
    `/${props.repo.provider}/${encodeURIComponent(props.repo.owner)}/${encodeURIComponent(props.repo.name)}`
)
</script>

<template>
  <RepoContextMenu :repo="repo">
    <NuxtLink
      :to="to"
      class="block rounded-lg border border-default p-3 transition hover:border-primary hover:bg-elevated/40"
    >
      <div class="flex items-center gap-2">
        <ForgeIcon :provider="repo.provider" class="size-4 shrink-0 text-muted" />
        <span class="truncate font-medium text-primary">{{ repo.fullName }}</span>
        <UBadge v-if="repo.isFork" color="neutral" variant="outline" size="xs" label="Fork" />
      </div>
      <p v-if="repo.description" class="mt-1 line-clamp-2 text-sm text-muted">
        {{ repo.description }}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span v-if="repo.language" class="inline-flex items-center gap-1">
          <span class="size-2 rounded-full bg-primary" />{{ repo.language }}
        </span>
        <span v-if="repo.stars !== undefined" class="inline-flex items-center gap-1">
          <UIcon name="i-lucide-star" class="size-3.5" />{{ formatCompactNumber(repo.stars) }}
        </span>
        <span v-if="repo.updatedAt" class="inline-flex items-center gap-1">
          <UIcon name="i-lucide-history" class="size-3.5" />{{ formatRelativeTime(repo.updatedAt) }}
        </span>
        <span
          v-for="t in (repo.topics ?? []).slice(0, 3)"
          :key="t"
          class="rounded-full bg-elevated px-2 py-0.5"
          >{{ t }}</span
        >
      </div>
    </NuxtLink>
  </RepoContextMenu>
</template>
