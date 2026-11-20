<script setup lang="ts">
import { useRepoContext } from '~/composables/useRepoContext'
import { loadThreadDetail } from '~/lib/forges/loaders'
import type { ThreadDetail } from '~/lib/forges/loaders'

const route = useRoute()
const { provider, owner, name, forge, meta } = useRepoContext()
const base = computed(() =>
  repoPath({ provider: provider.value, owner: owner.value, name: name.value })
)
const id = computed(() => String(route.params.id))

const offline = useOfflineRepos()
const watchItem = offline.watch
const itemKey = computed(
  () => `discussion:${provider.value}:${owner.value}:${name.value}:${id.value}`
)

// Any discussion you open is remembered so it can be kept offline once its repo is.
watch(
  itemKey,
  (k) => {
    const [, , , , iid] = k.split(':')
    if (iid) {
      watchItem('discussion', provider.value, owner.value, name.value, iid)
      void offline.auto()
    }
  },
  { immediate: true }
)

const { data, pending, error } = useLiveAsyncData<ThreadDetail | null>(
  () => itemKey.value,
  async () => {
    const f = forge.value
    if (!f || !meta.value || !f.can('threads.get', 'discussion')) return null
    return await loadThreadDetail(f, meta.value, 'discussion', id.value)
  },
  { lazy: true, watch: [() => route.fullPath, meta] }
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
      :description="forgeErrorMessage(error)"
    />

    <template v-else-if="data">
      <div class="space-y-2 border-b border-default pb-4">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ data.thread.title }}
          <span class="font-normal text-muted">#{{ threadNumberOf(data.thread.ref) }}</span>
        </h1>
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <UBadge
            v-if="data.thread.stateReason === 'resolved'"
            label="Answered"
            color="success"
            variant="subtle"
            size="xs"
            icon="i-lucide-check-circle"
          />
          <UserLink :user="data.thread.author" />
          <span v-if="data.thread.createdAt"
            >started {{ formatRelativeTime(data.thread.createdAt) }}</span
          >
        </div>
      </div>

      <article class="overflow-hidden rounded-lg border border-default">
        <header
          class="flex items-center gap-2 border-b border-default bg-elevated/40 px-4 py-2 text-sm"
        >
          <UserLink :user="data.thread.author" />
          <span v-if="data.thread.createdAt" class="text-muted">{{
            formatRelativeTime(data.thread.createdAt)
          }}</span>
        </header>
        <div class="px-4 py-3">
          <MarkdownBody :content="data.thread.body ?? ''" empty="No content." />
        </div>
        <ReactionBar :reactions="data.thread.reactions" :target="data.thread.ref" />
      </article>

      <CommentThread
        v-if="data.comments.length"
        :comments="data.comments"
        :thread="data.thread.ref"
      />
    </template>
  </div>
</template>
