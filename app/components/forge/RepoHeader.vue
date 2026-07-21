<script setup lang="ts">
import type { ForgeRepo } from '~/types/forge'
import { getForge } from '~/lib/forges'

const props = defineProps<{ repo: ForgeRepo }>()

const forge = computed(() => getForge(props.repo.provider))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 space-y-1.5">
        <div class="flex items-center gap-2">
          <UBadge color="neutral" variant="subtle" size="sm">
            <ForgeIcon :provider="repo.provider" class="size-3.5" />
            {{ forge?.label ?? repo.provider }}
          </UBadge>
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

        <h1 class="flex items-center gap-1.5 text-xl font-semibold text-highlighted">
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

      <UButton
        :to="repo.url"
        target="_blank"
        icon="i-lucide-external-link"
        color="neutral"
        variant="subtle"
        label="Open"
      />
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
      <span v-if="repo.language" class="inline-flex items-center gap-1.5">
        <span class="size-2.5 rounded-full bg-primary" />{{ repo.language }}
      </span>
      <span v-if="repo.stars !== undefined" class="inline-flex items-center gap-1">
        <UIcon name="i-lucide-star" class="size-4" />{{ formatCompactNumber(repo.stars) }}
      </span>
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
        <UIcon name="i-lucide-history" class="size-4" />Updated {{ formatRelativeTime(repo.updatedAt) }}
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
