<script setup lang="ts">
import type { ForgePullReview, ForgePullReviewComment } from '~/types/forge'
import { commentLocation } from '~/utils/pull-review'

const props = defineProps<{
  review: ForgePullReview
  comment: ForgePullReviewComment
  canReply?: boolean
}>()

const emit = defineEmits<{
  reply: [reviewId: string, commentId: string, body: string]
}>()

const replyOpen = ref(false)
const replyDraft = ref('')
const postingReply = ref(false)

interface DiffLine {
  text: string
  type: 'add' | 'del' | 'context' | 'hunk'
  oldLine?: number
  newLine?: number
}

function parseDiffLines(hunk?: string | null): DiffLine[] {
  if (!hunk) return []
  const lines = hunk.split('\n')
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = parseInt(match[1]!, 10)
        newLine = parseInt(match[2]!, 10)
      }
      result.push({ text: line, type: 'hunk' })
    } else if (line.startsWith('-')) {
      result.push({ text: line, type: 'del', oldLine: oldLine++ })
    } else if (line.startsWith('+')) {
      result.push({ text: line, type: 'add', newLine: newLine++ })
    } else {
      result.push({ text: line, type: 'context', oldLine: oldLine++, newLine: newLine++ })
    }
  }
  return result
}

const allLines = computed(() => parseDiffLines(props.comment.diffHunk))

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
          v-for="(line, i) in allLines"
          :key="i"
          class="flex"
          :class="{
            'bg-success/10 text-success': line.type === 'add',
            'bg-error/10 text-error': line.type === 'del',
            'bg-elevated text-dimmed': line.type === 'hunk'
          }"
        >
          <template v-if="line.type === 'hunk'">
            <!-- Expand icons could go here in a future iteration -->
            <div class="flex w-12 shrink-0 border-r border-default/40 items-center justify-center">
              <UIcon name="i-lucide-unfold-vertical" class="size-3 opacity-50" />
            </div>
            <span class="px-2">{{ line.text }}</span>
          </template>
          <template v-else>
            <!-- Line numbers -->
            <div
              class="w-6 shrink-0 border-r border-default/40 pr-1 text-right select-none text-dimmed opacity-70"
            >
              {{ line.oldLine ?? ' ' }}
            </div>
            <div
              class="w-6 shrink-0 border-r border-default/40 pr-1 text-right select-none text-dimmed opacity-70"
            >
              {{ line.newLine ?? ' ' }}
            </div>
            <!-- Sign -->
            <div class="w-4 shrink-0 text-center select-none opacity-80">
              {{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ' }}
            </div>
            <!-- Code -->
            <span class="min-w-0 whitespace-pre break-all px-1">{{ line.text.slice(1) }}</span>
          </template>
        </div>
      </div>
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
