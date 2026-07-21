<script setup lang="ts">
defineProps<{
  repo: {
    provider: string
    owner: string
    name: string
    fullName: string
    description?: string | null
    language?: string | null
    stars?: number
  }
}>()
</script>

<template>
  <NuxtLink
    :to="repoPath(repo)"
    class="group flex flex-col rounded-xl border border-default p-4 transition hover:border-primary hover:bg-elevated/40"
  >
    <div class="flex items-center gap-2 text-xs text-muted">
      <ForgeIcon :provider="repo.provider" class="size-3.5 shrink-0" />
      <span class="truncate">{{ repo.owner }}</span>
    </div>
    <div class="mt-1 truncate font-medium text-default group-hover:text-primary">
      {{ repo.name }}
    </div>
    <p v-if="repo.description" class="mt-1 line-clamp-2 text-sm text-muted">
      {{ repo.description }}
    </p>
    <div class="mt-auto flex items-center gap-3 pt-3 text-xs text-muted">
      <span v-if="repo.language" class="inline-flex items-center gap-1">
        <span class="size-2 rounded-full bg-primary/60" />{{ repo.language }}
      </span>
      <span v-if="repo.stars" class="inline-flex items-center gap-0.5">
        <UIcon name="i-lucide-star" class="size-3" />{{ formatCompactNumber(repo.stars) }}
      </span>
    </div>
  </NuxtLink>
</template>
