<script setup lang="ts">
// Writing a message. Markdown works as in Colibri (`**bold**`, `` `code` ``, fenced blocks, links);
// it is stored as plain text with formatting ranges, so it looks the same in every Colibri app.
// When the viewer can't post here, it says why and offers the next step instead.
import type { ChannelView, MessageView } from '~/lib/community/colibri'
import { displayName } from '~/lib/community/messages'

const props = defineProps<{
  channel: ChannelView
  /** Every message goes under this one, as in a forum thread. */
  thread?: MessageView
  placeholder?: string
}>()
const reply = defineModel<MessageView | null>('reply', { default: null })

const chat = useCommunityChat()
const { hasAccess } = useCommunityAccess()
const route = useRoute()
const toast = useToast()

const text = ref('')
const files = ref<File[]>([])
const sending = ref(false)
const joining = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const input = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>('input')

const canPost = computed(() => chat.canPost(props.channel))
const typing = computed(() => chat.typingIn(props.channel.uri))
const typingLabel = computed(() => {
  const names = typing.value.map((m) => displayName(m))
  if (!names.length) return ''
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return 'Several people are typing…'
})

watch(reply, (message) => {
  if (message) nextTick(() => input.value?.textareaRef?.focus())
})

async function send(): Promise<void> {
  if (sending.value || (!text.value.trim() && !files.value.length)) return
  sending.value = true
  try {
    await chat.send(props.channel.uri, text.value, {
      files: files.value,
      parent: reply.value ?? props.thread
    })
    text.value = ''
    files.value = []
    reply.value = null
  } catch (e) {
    toast.add({
      color: 'error',
      description: e instanceof Error ? e.message : undefined,
      title: 'Could not send the message'
    })
  } finally {
    sending.value = false
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    void send()
  } else if (e.key === 'Escape' && reply.value) {
    reply.value = null
  }
}

function onInput(): void {
  if (text.value) chat.notifyTyping(props.channel.uri)
}

function addFiles(list: FileList | null): void {
  if (!list) return
  files.value = [...files.value, ...Array.from(list)].slice(0, 8)
  if (fileInput.value) fileInput.value.value = ''
}

async function join(): Promise<void> {
  joining.value = true
  try {
    await chat.join()
  } catch (e) {
    toast.add({
      color: 'error',
      description: e instanceof Error ? e.message : undefined,
      title: 'Could not join'
    })
  } finally {
    joining.value = false
  }
}

const loginPath = computed(() => `/login?${new URLSearchParams({ redirect: route.fullPath })}`)
</script>

<template>
  <div class="shrink-0 px-4 pt-1 pb-4">
    <div
      v-if="chat.membership.value === 'guest'"
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-elevated/40 px-4 py-3"
    >
      <p class="text-sm text-muted">Sign in with your atproto account to join the conversation.</p>
      <UButton :to="loginPath" label="Sign in" icon="i-lucide-log-in" size="sm" />
    </div>
    <div
      v-else-if="!hasAccess"
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-elevated/40 px-4 py-3"
    >
      <p class="text-sm text-muted">Allow Community access to join and write here.</p>
      <CommunityAccessButton />
    </div>
    <div
      v-else-if="chat.membership.value === 'none'"
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-elevated/40 px-4 py-3"
    >
      <p class="text-sm text-muted">
        Join {{ chat.data.value.community.name }} to write here.
        <template v-if="chat.data.value.community.requiresApprovalToJoin"
          >An admin approves new members.</template
        >
      </p>
      <UButton label="Join" icon="i-lucide-user-plus" size="sm" :loading="joining" @click="join" />
    </div>
    <div
      v-else-if="chat.membership.value === 'pending'"
      class="rounded-lg border border-default bg-elevated/40 px-4 py-3 text-sm text-muted"
    >
      Your request to join is waiting for an admin.
    </div>
    <div
      v-else-if="chat.membership.value === 'loading'"
      class="h-12 rounded-lg border border-default bg-elevated/40"
    />
    <div
      v-else-if="!canPost"
      class="flex items-center gap-2 rounded-lg border border-default bg-elevated/40 px-4 py-3 text-sm text-muted"
    >
      <UIcon name="i-lucide-lock" class="size-4 shrink-0" />
      {{
        channel.ownerOnly
          ? 'Only admins post in this channel.'
          : 'Only some roles can post in this channel.'
      }}
    </div>

    <form
      v-else
      class="rounded-lg border border-default bg-default focus-within:border-primary/60"
      @submit.prevent="send"
    >
      <div
        v-if="reply"
        class="flex items-center gap-2 border-b border-default px-3 py-1.5 text-xs text-muted"
      >
        <UIcon name="i-lucide-reply" class="size-3.5 shrink-0" />
        <span class="truncate"
          >Replying to
          <span class="font-medium text-default">{{
            displayName(chat.actor(reply.author.did) ?? reply.author)
          }}</span></span
        >
        <UButton
          class="ml-auto"
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="ghost"
          aria-label="Cancel reply"
          @click="reply = null"
        />
      </div>
      <div v-if="files.length" class="flex flex-wrap gap-1.5 border-b border-default px-3 py-2">
        <UBadge
          v-for="(file, i) in files"
          :key="`${file.name}-${i}`"
          color="neutral"
          variant="outline"
          class="gap-1"
        >
          <UIcon name="i-lucide-paperclip" class="size-3" />
          <span class="max-w-40 truncate">{{ file.name }}</span>
          <button
            type="button"
            :aria-label="`Remove ${file.name}`"
            @click="files = files.filter((_, j) => j !== i)"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </UBadge>
      </div>
      <div class="flex items-end gap-1 p-1.5">
        <input
          ref="fileInput"
          type="file"
          multiple
          class="hidden"
          @change="addFiles(($event.target as HTMLInputElement).files)"
        />
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          aria-label="Attach files"
          @click="fileInput?.click()"
        />
        <UTextarea
          ref="input"
          v-model="text"
          :placeholder="placeholder ?? `Message #${channel.name}`"
          :rows="1"
          :maxrows="12"
          autoresize
          variant="none"
          class="min-w-0 flex-1"
          :ui="{ base: 'px-1.5 py-1.5' }"
          :aria-label="placeholder ?? `Message #${channel.name}`"
          @keydown="onKeydown"
          @input="onInput"
        />
        <UButton
          type="submit"
          icon="i-lucide-send-horizontal"
          aria-label="Send"
          :loading="sending"
          :disabled="!text.trim() && !files.length"
        />
      </div>
    </form>
    <p class="mt-1 h-4 truncate px-1 text-xs text-muted" aria-live="polite">{{ typingLabel }}</p>
  </div>
</template>
