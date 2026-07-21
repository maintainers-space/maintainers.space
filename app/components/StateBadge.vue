<script setup lang="ts">
import type { ForgeIssueState, ForgePullState, ForgeRunStatus } from '~/types/forge'

type AnyState = ForgeIssueState | ForgePullState | ForgeRunStatus | string

const props = withDefaults(defineProps<{ state: AnyState, kind?: 'issue' | 'pull' | 'run', size?: 'xs' | 'sm' | 'md' }>(), {
  kind: 'issue',
  size: 'sm'
})

const MAP: Record<string, { color: string, icon: string, label: string }> = {
  open: { color: 'success', icon: 'i-lucide-circle-dot', label: 'Open' },
  closed: { color: 'error', icon: 'i-lucide-circle-slash', label: 'Closed' },
  merged: { color: 'primary', icon: 'i-lucide-git-merge', label: 'Merged' },
  draft: { color: 'neutral', icon: 'i-lucide-git-pull-request-draft', label: 'Draft' },
  success: { color: 'success', icon: 'i-lucide-check-circle', label: 'Success' },
  failure: { color: 'error', icon: 'i-lucide-x-circle', label: 'Failed' },
  running: { color: 'warning', icon: 'i-lucide-loader', label: 'Running' },
  pending: { color: 'warning', icon: 'i-lucide-clock', label: 'Pending' },
  queued: { color: 'neutral', icon: 'i-lucide-clock', label: 'Queued' },
  cancelled: { color: 'neutral', icon: 'i-lucide-ban', label: 'Cancelled' },
  skipped: { color: 'neutral', icon: 'i-lucide-skip-forward', label: 'Skipped' },
  timed_out: { color: 'error', icon: 'i-lucide-timer-off', label: 'Timed out' },
  unknown: { color: 'neutral', icon: 'i-lucide-circle-help', label: 'Unknown' }
}

// Pull requests get their own dedicated icons so the state reads as a PR, not a
// generic issue. PULL_STATE_ICON is shared (auto-imported from ~/utils) with the
// pulls list so both always match.
const meta = computed(() => {
  const base = MAP[props.state] ?? { color: 'neutral', icon: 'i-lucide-circle', label: props.state }
  if (props.kind === 'pull' && PULL_STATE_ICON[props.state]) {
    return { ...base, icon: PULL_STATE_ICON[props.state]! }
  }
  return base
})
</script>

<template>
  <UBadge
    :color="(meta.color as any)"
    variant="subtle"
    :size="size"
    :icon="meta.icon"
    :label="meta.label"
    class="capitalize"
  />
</template>
