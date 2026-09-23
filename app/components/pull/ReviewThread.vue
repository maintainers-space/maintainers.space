<script setup lang="ts">
import type { ForgePullReviewComment } from '~/types/forge'
import { diffHunkExcerpt } from '~/lib/pull-timeline'

const props = withDefaults(
  defineProps<{
    thread: ForgePullReviewComment
    canReply?: boolean
    reply: (commentId: string, body: string) => Promise<boolean>
  }>(),
  { canReply: false }
)

const location = computed(() => {
  const { path, line, startLine } = props.thread
  if (!line) return path
  if (startLine && startLine < line) return `${path}, lines ${startLine}–${line}`
  return `${path}, line ${line}`
})

const excerpt = computed(() =>
  diffHunkExcerpt(props.thread.diffHunk, props.thread.line, props.thread.startLine)
)

const replying = ref(false)
const draft = ref('')
const posting = ref(false)

function openReply(): void {
  replying.value = true
  draft.value = ''
}

function cancelReply(): void {
  replying.value = false
  draft.value = ''
}

async function submitReply(): Promise<void> {
  if (!draft.value.trim() || posting.value) return
  posting.value = true
  try {
    if (await props.reply(props.thread.id, draft.value)) cancelReply()
  } finally {
    posting.value = false
  }
}
</script>

<template>
  <section :aria-label="`Review thread on ${location}`" class="space-y-3 px-4 py-3">
    <div class="overflow-hidden rounded-md border border-default">
      <div
        class="flex items-center gap-2 border-b border-default bg-elevated/40 px-3 py-1.5 text-xs"
        :class="{ 'border-b-0': !excerpt.length }"
      >
        <UIcon name="i-lucide-file-code" class="size-3.5 shrink-0 text-muted" />
        <span class="min-w-0 flex-1 truncate font-mono text-default" :title="location">
          {{ location }}
        </span>
        <UBadge v-if="thread.isOutdated" color="warning" variant="subtle" size="xs">
          Outdated
        </UBadge>
      </div>
      <div v-if="excerpt.length" class="overflow-x-auto">
        <table class="w-full border-collapse font-mono text-xs">
          <tbody>
            <tr
              v-for="(row, index) in excerpt"
              :key="index"
              :class="{ 'bg-success/10': row.type === 'add', 'bg-error/10': row.type === 'del' }"
            >
              <td
                class="w-6 select-none border-r border-default/60 px-1 text-center align-top"
                :class="{
                  'text-success': row.type === 'add',
                  'text-error': row.type === 'del',
                  'text-muted': row.type === 'ctx'
                }"
              >
                <template v-if="row.type !== 'ctx'">
                  <span aria-hidden="true">{{ row.type === 'add' ? '+' : '−' }}</span>
                  <span class="sr-only">{{ row.type === 'add' ? 'Added' : 'Removed' }}</span>
                </template>
              </td>
              <td class="whitespace-pre px-2 py-0.5 text-default">{{ row.text || ' ' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-1.5">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <UserLink :user="thread.author" />
        <span v-if="thread.createdAt" class="text-muted">
          commented {{ formatRelativeTime(thread.createdAt) }}
        </span>
      </div>
      <MarkdownBody :content="thread.body" empty="No content." />
    </div>

    <div
      v-for="item in thread.replies"
      :key="item.id"
      class="space-y-1.5 border-l-2 border-default pl-3"
    >
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <UserLink :user="item.author" />
        <span v-if="item.createdAt" class="text-muted">
          replied {{ formatRelativeTime(item.createdAt) }}
        </span>
      </div>
      <MarkdownBody :content="item.body" empty="No content." />
    </div>

    <template v-if="canReply">
      <MarkdownEditor
        v-if="replying"
        v-model="draft"
        :rows="3"
        :aria-label="`Reply to review thread on ${location}`"
        placeholder="Reply to this thread…"
        @submit="submitReply"
      />
      <div class="flex gap-2">
        <UButton
          v-if="!replying"
          icon="i-lucide-reply"
          label="Reply"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="openReply"
        />
        <template v-else>
          <UButton
            icon="i-lucide-send"
            label="Reply"
            size="xs"
            :loading="posting"
            :disabled="posting || !draft.trim()"
            @click="submitReply"
          />
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="posting"
            @click="cancelReply"
          />
        </template>
      </div>
    </template>
  </section>
</template>
