<script setup lang="ts">
import type { ForgePullReview, ForgePullReviewComment } from '~/types/forge'
import { commentLocation, userHandle } from '~/utils/pull-review'

const props = defineProps<{
  review: ForgePullReview
  comment: ForgePullReviewComment
  canReply?: boolean
}>()

const emit = defineEmits<{
  reply: [reviewId: string, commentId: string, body: string]
}>()

const expandedDiff = ref(false)
const replyOpen = ref(false)
const replyDraft = ref('')
const postingReply = ref(false)

interface DiffLine {
  text: string
  add: boolean
  del: boolean
}

function parseDiffLines(hunk?: string | null): DiffLine[] {
  if (!hunk) return []
  return hunk.split('\n').map((line): DiffLine => ({
    text: line,
    add: line.startsWith('+') && !line.startsWith('+++'),
    del: line.startsWith('-') && !line.startsWith('---')
  }))
}

const DIFF_PREVIEW = 5
const allLines = computed(() => parseDiffLines(props.comment.diffHunk))
const visibleLines = computed(() =>
  expandedDiff.value ? allLines.value : allLines.value.slice(0, DIFF_PREVIEW)
)
const hasMoreLines = computed(() => allLines.value.length > DIFF_PREVIEW)

function openReply(): void {
  replyOpen.value = true
  replyDraft.value = ''
}

function cancelReply(): void {
  replyOpen.value = false
  replyDraft.value = ''
  postingReply.value = false
}

async function submitReply(): Promise<void> {
  if (!replyDraft.value.trim() || postingReply.value) return
  postingReply.value = true
  try {
    emit('reply', props.review.id, props.comment.id, replyDraft.value)
    cancelReply()
  } finally {
    postingReply.value = false
  }
}
</script>

<template>
  <article
    class="overflow-hidden rounded-lg border"
    :class="
      comment.resolved ? 'border-default/60 bg-elevated/10 opacity-75' : 'border-muted bg-muted/20'
    "
  >
    <!-- File path header -->
    <header class="flex items-center gap-2 border-b border-default/60 px-3 py-1.5 text-xs">
      <UIcon name="i-lucide-file-code" class="size-3.5 shrink-0 text-muted" />
      <code class="min-w-0 truncate font-mono text-muted">{{ commentLocation(comment) }}</code>
      <UBadge
        v-if="comment.isOutdated"
        label="Outdated"
        color="warning"
        variant="subtle"
        size="xs"
        class="ml-auto shrink-0 rounded-full"
      />
      <UBadge
        v-if="comment.resolved"
        label="Resolved"
        color="success"
        variant="subtle"
        size="xs"
        class="shrink-0 rounded-full"
        :class="{ 'ml-auto': !comment.isOutdated }"
      />
    </header>

    <!-- Diff snippet -->
    <div v-if="allLines.length" class="border-b border-default/60">
      <div class="overflow-x-auto bg-muted/30 font-mono text-xs leading-relaxed">
        <div
          v-for="(line, i) in visibleLines"
          :key="i"
          class="flex"
          :class="{
            'bg-success/10 text-success': line.add,
            'bg-error/10 text-error': line.del
          }"
        >
          <span class="w-5 shrink-0 select-none text-center text-dimmed">{{
            line.add ? '+' : line.del ? '-' : ' '
          }}</span>
          <span class="min-w-0 whitespace-pre break-all px-1">{{
            line.add || line.del ? line.text.slice(1) : line.text
          }}</span>
        </div>
      </div>
      <button
        v-if="hasMoreLines && !expandedDiff"
        type="button"
        class="w-full border-t border-default/40 bg-muted/15 px-3 py-1 text-xs text-muted hover:text-highlighted"
        @click="expandedDiff = true"
      >
        Show {{ allLines.length - DIFF_PREVIEW }} more line{{
          allLines.length - DIFF_PREVIEW === 1 ? '' : 's'
        }}
      </button>
    </div>

    <!-- Main comment -->
    <div class="space-y-2 px-3 py-2.5">
      <div class="flex items-center gap-2 text-sm">
        <UserLink :user="comment.author" class="font-medium text-highlighted" />
        <span v-if="comment.createdAt" class="ml-auto text-xs text-dimmed">{{
          formatRelativeTime(comment.createdAt)
        }}</span>
      </div>
      <MarkdownBody :content="comment.body" empty="No content." />
    </div>

    <!-- Replies -->
    <div
      v-if="comment.replies?.length"
      class="divide-y divide-default/60 border-t border-default/60"
    >
      <div v-for="reply in comment.replies" :key="reply.id" class="space-y-1 px-3 py-2.5">
        <div class="flex items-center gap-2 text-sm">
          <UserLink :user="reply.author" class="font-medium text-highlighted" />
          <span v-if="reply.createdAt" class="ml-auto text-xs text-dimmed">{{
            formatRelativeTime(reply.createdAt)
          }}</span>
        </div>
        <MarkdownBody :content="reply.body" empty="No content." />
      </div>
    </div>

    <!-- Reply UI -->
    <div v-if="canReply" class="border-t border-default/60 px-3 py-2">
      <MarkdownEditor
        v-if="replyOpen"
        v-model="replyDraft"
        :rows="3"
        :aria-label="`Reply to review thread on ${commentLocation(comment)}`"
        placeholder="Reply to this thread…"
        @submit="submitReply"
      />
      <div class="flex gap-2">
        <UButton
          v-if="!replyOpen"
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
            :loading="postingReply"
            :disabled="postingReply || !replyDraft.trim()"
            @click="submitReply"
          />
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="postingReply"
            @click="cancelReply"
          />
        </template>
      </div>
    </div>

    <!-- Resolved by -->
    <div
      v-if="comment.resolved && comment.resolvedBy"
      class="border-t border-default/60 px-3 py-1.5"
    >
      <p class="text-xs text-muted">
        <UIcon name="i-lucide-check-circle" class="mr-1 inline size-3 text-success" />
        Resolved by
        <UserLink :user="comment.resolvedBy" :avatar="false" class="font-medium" />
      </p>
    </div>
  </article>
</template>
