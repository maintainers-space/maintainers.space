<script setup lang="ts">
import type { ForgeIssue } from '~/types/forge'

const props = defineProps<{ issue: ForgeIssue }>()

const to = computed(() => {
  const r = props.issue.repo
  if (!r) return props.issue.url ?? '#'
  const kind = props.issue.isPull ? 'pulls' : 'issues'
  return `/${r.provider}/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.name)}/${kind}/${props.issue.id}`
})
</script>

<template>
  <NuxtLink
    :to="to"
    class="block rounded-lg border border-default p-3 transition hover:border-primary hover:bg-elevated/40"
  >
    <div class="flex items-start gap-2">
      <UIcon
        :name="issue.isPull ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot'"
        class="mt-0.5 size-4 shrink-0"
        :class="issue.state === 'open' ? 'text-success' : 'text-muted'"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate font-medium text-default">{{ issue.title }}</span>
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <ForgeIcon :provider="issue.provider" class="size-3.5" />
          <span v-if="issue.repo">{{ issue.repo.fullName }}<template v-if="issue.number">#{{ issue.number }}</template></span>
          <span v-if="issue.author" class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-user" class="size-3" />{{ userLabel(issue.author) }}
          </span>
          <span v-if="issue.commentCount" class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-message-square" class="size-3" />{{ issue.commentCount }}
          </span>
          <span v-if="issue.updatedAt">{{ formatRelativeTime(issue.updatedAt) }}</span>
        </div>
      </div>
      <UBadge
        :color="issue.state === 'open' ? 'success' : 'neutral'"
        variant="subtle"
        size="xs"
        class="shrink-0 capitalize"
      >{{ issue.state }}</UBadge>
    </div>
  </NuxtLink>
</template>
