<script setup lang="ts">
import type { ForgeIssueDetail } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge, locator } = useRepoContext()
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)
const id = computed(() => String(route.params.id))

const { data, pending, error } = useLiveAsyncData<ForgeIssueDetail | null>(
  () => `issue:${provider.value}:${owner.value}:${name.value}:${id.value}`,
  async () => {
    if (!forge.value?.getIssue) return null
    return await forge.value.getIssue(locator.value, id.value)
  },
  { lazy: true, watch: [() => route.fullPath] }
)
</script>

<template>
  <div class="space-y-5">
    <UButton
      :to="`${base}/issues`"
      icon="i-lucide-arrow-left"
      size="xs"
      color="neutral"
      variant="ghost"
      label="All issues"
    />

    <div v-if="pending && !data" class="space-y-3">
      <USkeleton class="h-8 w-2/3" />
      <USkeleton class="h-32 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load issue"
      :description="error?.message"
    />

    <template v-else-if="data">
      <div class="space-y-2 border-b border-default pb-4">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ data.title }}
          <span v-if="data.number" class="font-normal text-muted">#{{ data.number }}</span>
        </h1>
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StateBadge :state="data.state" kind="issue" />
          <UserLink :user="data.author" />
          <span v-if="data.createdAt">opened {{ formatRelativeTime(data.createdAt) }}</span>
          <span v-if="data.commentCount">· {{ data.commentCount }} comments</span>
        </div>
        <div v-if="data.labels?.length" class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="l in data.labels"
            :key="l.name"
            :label="l.name"
            color="neutral"
            variant="subtle"
            size="xs"
            class="rounded-full"
          />
        </div>
      </div>

      <article class="overflow-hidden rounded-lg border border-default">
        <header
          class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2 text-sm"
        >
          <UserLink :user="data.author" />
          <span v-if="data.createdAt" class="text-muted"
            >commented {{ formatRelativeTime(data.createdAt) }}</span
          >
        </header>
        <div class="px-4 py-3">
          <MarkdownBody :content="data.body ?? ''" empty="No description provided." />
        </div>
      </article>

      <CommentThread v-if="data.comments.length" :comments="data.comments" />
    </template>
  </div>
</template>
