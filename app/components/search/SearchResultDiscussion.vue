<script setup lang="ts">
import type { ForgeDiscussion } from '~/types/forge'

const props = defineProps<{ discussion: ForgeDiscussion }>()

const to = computed(() => {
  const r = props.discussion.repo
  if (!r) return props.discussion.url ?? '#'
  return `/${r.provider}/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.name)}/discussions/${props.discussion.id}`
})
</script>

<template>
  <NuxtLink
    :to="to"
    class="block rounded-lg border border-default p-3 transition hover:border-primary hover:bg-elevated/40"
  >
    <div class="flex items-start gap-2">
      <UIcon
        :name="discussion.answered ? 'i-lucide-check-circle' : 'i-lucide-messages-square'"
        class="mt-0.5 size-4 shrink-0"
        :class="discussion.answered ? 'text-success' : 'text-muted'"
      />
      <div class="min-w-0 flex-1">
        <span class="truncate font-medium text-default">{{ discussion.title }}</span>
        <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <ForgeIcon :provider="discussion.provider" class="size-3.5" />
          <span v-if="discussion.repo">{{ discussion.repo.fullName }}</span>
          <UBadge
            v-if="discussion.category"
            :label="discussion.category"
            color="neutral"
            variant="subtle"
            size="xs"
          />
          <span v-if="discussion.author" class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-user" class="size-3" />{{ userLabel(discussion.author) }}
          </span>
          <span v-if="discussion.commentCount" class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-message-square" class="size-3" />{{ discussion.commentCount }}
          </span>
          <span v-if="discussion.createdAt">{{ formatRelativeTime(discussion.createdAt) }}</span>
        </div>
      </div>
      <UBadge v-if="discussion.answered" color="success" variant="subtle" size="xs" class="shrink-0"
        >Answered</UBadge
      >
    </div>
  </NuxtLink>
</template>
