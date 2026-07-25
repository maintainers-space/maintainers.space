<script setup lang="ts">
import type { ForgeIssue } from '~/types/forge'

withDefaults(
  defineProps<{
    title: string
    icon: string
    items: ForgeIssue[]
    loading?: boolean
    emptyText?: string
  }>(),
  {
    loading: false,
    emptyText: 'Nothing here right now.'
  }
)
</script>

<template>
  <div class="rounded-xl border border-default bg-elevated/20">
    <div class="flex items-center justify-between border-b border-default px-4 py-2.5">
      <span class="inline-flex items-center gap-2 text-sm font-medium text-default">
        <UIcon :name="icon" class="size-4 text-muted" />{{ title }}
      </span>
      <UBadge v-if="items.length" color="neutral" variant="subtle" size="xs">
        {{ items.length }}
      </UBadge>
    </div>

    <div v-if="loading" class="space-y-2 p-3">
      <USkeleton v-for="i in 3" :key="i" class="h-10 w-full" />
    </div>

    <div v-else-if="!items.length" class="px-4 py-8 text-center text-sm text-muted">
      {{ emptyText }}
    </div>

    <ul v-else class="divide-y divide-default">
      <li v-for="it in items" :key="`${it.provider}:${it.repo?.fullName}:${it.id}`">
        <NuxtLink
          :to="issuePath(it)"
          class="flex items-start gap-2.5 px-4 py-2.5 transition hover:bg-elevated/40"
        >
          <UIcon
            :name="it.isPull ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot'"
            class="mt-0.5 size-4 shrink-0 text-primary"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-default">{{ it.title }}</p>
            <div class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <ForgeIcon :provider="it.provider" class="size-3 shrink-0" />
              <span class="truncate">{{ it.repo?.fullName }}</span>
              <span v-if="it.number" class="shrink-0">#{{ it.number }}</span>
              <span v-if="it.updatedAt" class="shrink-0"
                >· {{ formatRelativeTime(it.updatedAt) }}</span
              >
            </div>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
