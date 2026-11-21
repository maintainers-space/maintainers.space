<script setup lang="ts">
import type { Thread } from 'forges'
import { forgeIdOf } from '~/lib/forges/registry'

const props = defineProps<{ issue: Thread }>()
const provider = computed(() => forgeIdOf(props.issue.ref))

const to = computed(() => threadPathOf(props.issue.ref))
const isPull = computed(() => props.issue.kind === 'pull_request')
</script>

<template>
  <NuxtLink
    :to="to"
    class="block rounded-lg border border-default p-3 transition hover:border-primary hover:bg-elevated/40"
  >
    <div class="flex items-start gap-2">
      <UIcon
        :name="isPull ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot'"
        class="mt-0.5 size-4 shrink-0"
        :class="issue.state === 'open' ? 'text-success' : 'text-muted'"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate font-medium text-default">{{ issue.title }}</span>
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <ForgeIcon :provider="provider" class="size-3.5" />
          <span>{{ repoFullName(issue.ref.repo) }}#{{ threadNumberOf(issue.ref) }}</span>
          <span v-if="issue.author" class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-user" class="size-3" />{{ actorLabel(issue.author) }}
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
        >{{ issue.state }}</UBadge
      >
    </div>
  </NuxtLink>
</template>
