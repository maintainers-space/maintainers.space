<script setup lang="ts">
import type { ForgeIssue } from '~/types/forge'

export type ContributionKind = 'authored' | 'review' | 'assigned'

export interface ContributionEntry {
  kind: ContributionKind
  item: ForgeIssue
}

withDefaults(
  defineProps<{
    entries: ContributionEntry[]
    loading?: boolean
    isNew?: (entry: ContributionEntry) => boolean
  }>(),
  { loading: false, isNew: () => false }
)

const KIND_META: Record<
  ContributionKind,
  { label: string; icon: string; bg: string; fg: string; badge: 'info' | 'warning' | 'secondary' }
> = {
  authored: {
    label: 'Your PR',
    icon: 'i-lucide-git-pull-request',
    bg: 'bg-info/10',
    fg: 'text-info',
    badge: 'info'
  },
  review: {
    label: 'Review requested',
    icon: 'i-lucide-eye',
    bg: 'bg-warning/10',
    fg: 'text-warning',
    badge: 'warning'
  },
  assigned: {
    label: 'Assigned issue',
    icon: 'i-lucide-circle-dot',
    bg: 'bg-secondary/10',
    fg: 'text-secondary',
    badge: 'secondary'
  }
}
</script>

<template>
  <div class="rounded-xl border border-default bg-elevated/20">
    <div v-if="loading" class="space-y-2 p-3">
      <USkeleton v-for="i in 4" :key="i" class="h-12 w-full" />
    </div>

    <div v-else-if="!entries.length" class="px-4 py-8 text-center text-sm text-muted">
      Nothing needs your attention right now.
    </div>

    <ul v-else class="divide-y divide-default">
      <li
        v-for="entry in entries"
        :key="`${entry.kind}:${entry.item.provider}:${entry.item.repo?.fullName}:${entry.item.id}`"
      >
        <NuxtLink
          :to="issuePath(entry.item)"
          class="flex items-start gap-3 px-4 py-3 transition hover:bg-elevated/40"
        >
          <span
            class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
            :class="KIND_META[entry.kind].bg"
          >
            <UIcon
              :name="KIND_META[entry.kind].icon"
              class="size-3.5"
              :class="KIND_META[entry.kind].fg"
            />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <UBadge
                :label="KIND_META[entry.kind].label"
                :color="KIND_META[entry.kind].badge"
                variant="subtle"
                size="xs"
              />
              <span v-if="entry.item.updatedAt" class="text-xs text-muted">
                {{ formatRelativeTime(entry.item.updatedAt) }}
              </span>
            </div>
            <p class="mt-1 truncate text-sm text-default">{{ entry.item.title }}</p>
            <div class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <ForgeIcon :provider="entry.item.provider" class="size-3 shrink-0" />
              <span class="truncate">{{ entry.item.repo?.fullName }}</span>
              <span v-if="entry.item.number" class="shrink-0">#{{ entry.item.number }}</span>
            </div>
          </div>
          <span
            v-if="isNew(entry)"
            class="mt-2 size-2 shrink-0 rounded-full bg-primary"
            title="New since your last visit"
          />
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
