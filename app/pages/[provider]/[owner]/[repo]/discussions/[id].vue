<script setup lang="ts">
import type { ForgeDiscussionDetail } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const route = useRoute()
const { provider, owner, name, forge, locator } = useRepoContext()
const { get: getToken } = useForgeTokens()
const base = computed(() => repoPath({ provider: provider.value, owner: owner.value, name: name.value }))
const id = computed(() => String(route.params.id))

const { data, pending, error } = useAsyncData<ForgeDiscussionDetail | null>(
  () => `discussion:${provider.value}:${owner.value}:${name.value}:${id.value}`,
  async () => {
    if (!forge.value?.getDiscussion) return null
    return await forge.value.getDiscussion(locator.value, id.value, { token: getToken(provider.value) })
  },
  { lazy: true, watch: [() => route.fullPath] }
)
</script>

<template>
  <div class="space-y-5">
    <UButton
      :to="`${base}/discussions`"
      icon="i-lucide-arrow-left"
      size="xs"
      color="neutral"
      variant="ghost"
      label="All discussions"
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
      title="Could not load discussion"
      :description="(error as any)?.message"
    />

    <template v-else-if="data">
      <div class="space-y-2 border-b border-default pb-4">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ data.title }} <span v-if="data.number" class="font-normal text-muted">#{{ data.number }}</span>
        </h1>
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <UBadge
            v-if="data.category"
            :label="data.category"
            color="neutral"
            variant="subtle"
            size="xs"
          />
          <UBadge
            v-if="data.answered"
            label="Answered"
            color="success"
            variant="subtle"
            size="xs"
            icon="i-lucide-check-circle"
          />
          <UserLink :user="data.author" />
          <span v-if="data.createdAt">started {{ formatRelativeTime(data.createdAt) }}</span>
        </div>
      </div>

      <article class="overflow-hidden rounded-lg border border-default">
        <header class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2 text-sm">
          <UserLink :user="data.author" />
          <span v-if="data.createdAt" class="text-muted">{{ formatRelativeTime(data.createdAt) }}</span>
        </header>
        <div class="px-4 py-3">
          <MarkdownBody :content="data.body ?? ''" empty="No content." />
        </div>
      </article>

      <CommentThread v-if="data.comments.length" :comments="data.comments" />
    </template>
  </div>
</template>
