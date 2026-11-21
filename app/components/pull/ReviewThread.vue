<script setup lang="ts">
import type { ReviewComment } from 'forges'

import type { ReviewConversation } from '~/lib/pull-timeline'

const props = withDefaults(
  defineProps<{
    conversation: ReviewConversation
    canReply?: boolean
    reply: (comment: ReviewComment, body: string) => Promise<boolean>
  }>(),
  { canReply: false }
)

const root = computed(() => props.conversation.root)

const location = computed(() => {
  const { path = 'file', line } = root.value
  return line ? `${path}, line ${line}` : path
})

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
    if (await props.reply(root.value, draft.value)) cancelReply()
  } finally {
    posting.value = false
  }
}
</script>

<template>
  <section :aria-label="`Review thread on ${location}`" class="space-y-3 px-4 py-3">
    <div
      class="flex items-center gap-2 rounded-md border border-default bg-elevated/40 px-3 py-1.5 text-xs"
    >
      <UIcon name="i-lucide-file-code" class="size-3.5 shrink-0 text-muted" />
      <span class="min-w-0 flex-1 truncate font-mono text-default" :title="location">
        {{ location }}
      </span>
      <UBadge v-if="conversation.resolved" color="success" variant="subtle" size="xs">
        Resolved
      </UBadge>
    </div>

    <div class="space-y-1.5">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <UserLink :user="root.author" />
        <span v-if="root.createdAt" class="text-muted">
          commented {{ formatRelativeTime(root.createdAt) }}
        </span>
      </div>
      <MarkdownBody :content="root.body" empty="No content." />
    </div>

    <div
      v-for="item in conversation.replies"
      :key="item.ref?.id"
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
