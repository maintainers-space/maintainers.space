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
const itemKey = computed(() => `issue:${provider.value}:${owner.value}:${name.value}:${id.value}`)

// Any issue you open is remembered so it can be kept offline once its repo is.
watch(
  itemKey,
  (k) => {
    const [, , , , iid] = k.split(':')
    if (iid) {
      watchItem('issue', provider.value, owner.value, name.value, iid)
      void offline.auto()
    }
  },
  { immediate: true }
)

const { data, pending, error } = useLiveAsyncData<ThreadDetail | null>(
  () => itemKey.value,
  async () => {
    const f = forge.value
    if (!f || !meta.value || !f.can('threads.get', 'issue')) return null
    return await loadThreadDetail(f, meta.value, 'issue', id.value)
  },
  { lazy: true, watch: [() => route.fullPath, meta] }
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
      :description="forgeErrorMessage(error)"
    />

    <template v-else-if="data">
      <div class="space-y-2 border-b border-default pb-4">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ data.thread.title }}
          <span class="font-normal text-muted">#{{ threadNumberOf(data.thread.ref) }}</span>
        </h1>
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StateBadge :state="data.thread.state" kind="issue" />
          <UserLink :user="data.thread.author" />
          <span v-if="data.thread.createdAt"
            >opened {{ formatRelativeTime(data.thread.createdAt) }}</span
          >
          <span v-if="data.thread.commentCount">· {{ data.thread.commentCount }} comments</span>
        </div>
        <div v-if="data.thread.labels.length" class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="l in data.thread.labels"
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
          <UserLink :user="data.thread.author" />
          <span v-if="data.thread.createdAt" class="text-muted"
            >commented {{ formatRelativeTime(data.thread.createdAt) }}</span
          >
        </header>
        <div class="px-4 py-3">
          <MarkdownBody :content="data.thread.body ?? ''" empty="No description provided." />
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
