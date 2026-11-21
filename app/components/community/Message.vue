<script setup lang="ts">
// One message: author and time on the first of a run, the body, attachments, reactions, and on
// hover the actions the viewer may take.
import { blobUrl, type AttachmentView, type MessageView } from '~/lib/community/colibri'
import { displayName } from '~/lib/community/messages'
import { authorOf } from '~/lib/community/records'

const props = withDefaults(
  defineProps<{ message: MessageView; head?: boolean; canReply?: boolean; showParent?: boolean }>(),
  { canReply: true, head: true, showParent: true }
)
const emit = defineEmits<{ reply: [message: MessageView] }>()

const chat = useCommunityChat()
const { did } = useAuth()
const toast = useToast()

const author = computed(() => chat.actor(props.message.author.did) ?? props.message.author)
const mine = computed(() => !!did.value && authorOf(props.message.uri) === did.value)
const isMember = computed(() => chat.membership.value === 'member')
const time = computed(() => new Date(props.message.createdAt))

const editing = ref(false)
const draft = ref('')
const busy = ref(false)
const pickerOpen = ref(false)
const confirmDelete = ref(false)

const images = computed(() =>
  (props.message.attachments ?? []).filter((a) => a.blob.mimeType?.startsWith('image/'))
)
const files = computed(() =>
  (props.message.attachments ?? []).filter((a) => !a.blob.mimeType?.startsWith('image/'))
)

function attachmentUrl(attachment: AttachmentView, variant?: 'base') {
  return blobUrl(authorOf(props.message.uri), attachment.blob, variant)
}

function startEdit(): void {
  draft.value = props.message.text
  editing.value = true
}

async function run(action: () => Promise<void>, failure: string): Promise<void> {
  busy.value = true
  try {
    await action()
  } catch (e) {
    toast.add({
      color: 'error',
      description: e instanceof Error ? e.message : undefined,
      title: failure
    })
  } finally {
    busy.value = false
  }
}

function saveEdit(): Promise<void> {
  return run(async () => {
    await chat.edit(props.message, draft.value)
    editing.value = false
  }, 'Could not edit the message')
}

function react(emoji: string): void {
  pickerOpen.value = false
  void run(() => chat.toggleReaction(props.message, emoji), 'Could not react')
}

function onEditKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') editing.value = false
  else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void saveEdit()
  }
}

const menu = computed(() => [
  [
    ...(props.canReply && isMember.value
      ? [{ icon: 'i-lucide-reply', label: 'Reply', onSelect: () => emit('reply', props.message) }]
      : []),
    ...(mine.value ? [{ icon: 'i-lucide-pencil', label: 'Edit', onSelect: startEdit }] : []),
    {
      icon: 'i-lucide-link',
      label: 'Copy link',
      onSelect: () => void navigator.clipboard?.writeText(props.message.uri)
    }
  ],
  ...(mine.value
    ? [
        [
          {
            color: 'error' as const,
            icon: 'i-lucide-trash-2',
            label: 'Delete',
            onSelect: () => (confirmDelete.value = true)
          }
        ]
      ]
    : [])
])
</script>

<template>
  <div
    class="group relative flex gap-3 px-4 transition-colors hover:bg-elevated/40"
    :class="head ? 'mt-3 pt-1 pb-0.5' : 'py-0.5'"
  >
    <div class="w-9 shrink-0">
      <CommunityActorAvatar v-if="head" :actor="author" class="mt-0.5" />
      <time
        v-else
        :datetime="message.createdAt"
        class="hidden pt-1 text-right text-[10px] leading-5 text-dimmed group-hover:block"
        >{{ time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</time
      >
    </div>

    <div class="min-w-0 flex-1">
      <div
        v-if="showParent && message.parent"
        class="mb-1 flex min-w-0 items-center gap-1.5 text-xs text-muted"
      >
        <UIcon name="i-lucide-corner-up-right" class="size-3.5 shrink-0" />
        <span class="shrink-0 font-medium">{{
          displayName(chat.actor(message.parent.author.did) ?? message.parent.author)
        }}</span>
        <span class="truncate">{{ message.parent.text || 'an earlier message' }}</span>
      </div>

      <div v-if="head" class="flex items-baseline gap-2">
        <span class="truncate text-sm font-semibold text-highlighted">{{
          displayName(author)
        }}</span>
        <time
          :datetime="message.createdAt"
          class="shrink-0 text-xs text-dimmed"
          :title="time.toLocaleString()"
          >{{ formatRelativeTime(message.createdAt) }}</time
        >
      </div>

      <div v-if="editing" class="mt-1 space-y-1">
        <UTextarea
          v-model="draft"
          autoresize
          :rows="1"
          :maxrows="10"
          class="w-full"
          autofocus
          @keydown="onEditKey"
        />
        <p class="text-xs text-muted">
          Enter to save, Escape to cancel
          <UButton size="xs" variant="link" label="Save" :loading="busy" @click="saveEdit" />
        </p>
      </div>
      <template v-else>
        <CommunityRichText v-if="message.text" :text="message.text" :facets="message.facets" />
        <span v-if="message.edited" class="text-[10px] text-dimmed">(edited)</span>
      </template>

      <div v-if="images.length" class="mt-2 flex flex-wrap gap-2">
        <a
          v-for="(image, i) in images"
          :key="i"
          :href="attachmentUrl(image)"
          target="_blank"
          rel="noopener noreferrer"
          class="block overflow-hidden rounded-lg border border-default"
        >
          <img
            :src="attachmentUrl(image, 'base')"
            :alt="image.name ?? 'Attachment'"
            loading="lazy"
            class="max-h-72 max-w-full object-contain sm:max-w-sm"
          />
        </a>
      </div>
      <div v-if="files.length" class="mt-2 flex flex-wrap gap-2">
        <UButton
          v-for="(file, i) in files"
          :key="i"
          :to="attachmentUrl(file)"
          target="_blank"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-paperclip"
          :label="file.name ?? 'Attachment'"
        />
      </div>

      <div v-if="message.reactions?.length" class="mt-1.5 flex flex-wrap gap-1">
        <button
          v-for="reaction in message.reactions"
          :key="reaction.emoji"
          type="button"
          class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition"
          :class="
            did && reaction.reactorDIDs?.includes(did)
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-default text-muted hover:border-accented'
          "
          :disabled="!isMember || busy"
          :aria-pressed="!!did && !!reaction.reactorDIDs?.includes(did)"
          :aria-label="`${reaction.emoji} ${reaction.count}`"
          @click="react(reaction.emoji)"
        >
          <span class="text-sm leading-none">{{ reaction.emoji }}</span>
          <span class="tabular-nums">{{ reaction.count }}</span>
        </button>
      </div>
    </div>

    <div
      v-if="isMember && !editing"
      class="absolute -top-3 right-4 flex items-center rounded-md border border-default bg-default p-0.5 opacity-0 shadow-sm transition group-hover:opacity-100 focus-within:opacity-100"
      :class="{ 'opacity-100': pickerOpen }"
    >
      <UPopover v-model:open="pickerOpen">
        <UButton
          icon="i-lucide-smile-plus"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Add reaction"
        />
        <template #content>
          <CommunityEmojiPicker @pick="react" />
        </template>
      </UPopover>
      <UButton
        v-if="canReply"
        icon="i-lucide-reply"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Reply"
        @click="emit('reply', message)"
      />
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="More actions"
        />
      </UDropdownMenu>
    </div>

    <UModal
      v-model:open="confirmDelete"
      title="Delete this message?"
      description="It is removed from your repo, and everyone stops seeing it."
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="confirmDelete = false" />
          <UButton
            color="error"
            label="Delete"
            :loading="busy"
            @click="
              run(async () => {
                await chat.remove(message)
                confirmDelete = false
              }, 'Could not delete the message')
            "
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
