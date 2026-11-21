<script setup lang="ts">
import type { CommentRef, ReactionContent, ReactionSummary, ThreadRef } from 'forges'
import { forgeIdOf } from '~/lib/forges/registry'

const props = defineProps<{
  reactions?: ReactionSummary
  target: ThreadRef | CommentRef
}>()

const { providerFor } = useForges()
const toast = useToast()

interface Chip {
  content: ReactionContent
  count: number
  viewerReacted: boolean
}

function toChips(summary?: ReactionSummary): Chip[] {
  return REACTION_KINDS.flatMap((content) => {
    const count = summary?.counts[content] ?? 0
    return count > 0
      ? [{ content, count, viewerReacted: summary?.viewerReacted?.includes(content) ?? false }]
      : []
  })
}

const local = ref<Chip[]>(toChips(props.reactions))
watch(
  () => props.reactions,
  (r) => {
    local.value = toChips(r)
  }
)

const pending = ref<Partial<Record<ReactionContent, boolean>>>({})
const pickerOpen = ref(false)

const repo = computed(() =>
  'thread' in props.target ? props.target.thread.repo : props.target.repo
)
const forge = computed(() => providerFor(repo.value))
const canReact = computed(() => !!forge.value?.can('threads.react', threadKind()))

function threadKind() {
  return 'thread' in props.target ? props.target.thread.kind : props.target.kind
}

async function toggle(content: ReactionContent): Promise<void> {
  if (!forge.value || !canReact.value || pending.value[content]) return
  const existing = local.value.find((r) => r.content === content)
  const reacted = existing?.viewerReacted ?? false
  pending.value[content] = true
  try {
    if (reacted && existing) {
      await forge.value.threads.unreact(props.target, content)
      existing.count = Math.max(0, existing.count - 1)
      existing.viewerReacted = false
      local.value = local.value.filter((r) => r.count > 0)
    } else {
      await forge.value.threads.react(props.target, content)
      if (existing) {
        existing.count += 1
        existing.viewerReacted = true
      } else {
        local.value.push({ content, count: 1, viewerReacted: true })
      }
    }
  } catch (e) {
    const hint = describeForgeError(e, {
      provider: forgeIdOf(repo.value),
      owner: repo.value.owner,
      name: repo.value.name
    })
    toast.add({
      title: 'Could not update reaction',
      description: hint.description,
      color: 'error',
      icon: 'i-lucide-circle-alert',
      actions: hint.to ? [{ label: hint.linkLabel, to: hint.to, target: '_blank' }] : undefined
    })
  } finally {
    pending.value[content] = false
  }
  pickerOpen.value = false
}
</script>

<template>
  <div
    v-if="local.length || canReact"
    class="flex flex-wrap items-center gap-1.5 border-t border-default px-4 py-2"
  >
    <button
      v-for="r in local"
      :key="r.content"
      type="button"
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors"
      :class="
        r.viewerReacted
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-default bg-elevated/40 text-default hover:bg-elevated/70'
      "
      :disabled="!canReact || pending[r.content]"
      :title="REACTION_LABEL[r.content]"
      @click="toggle(r.content)"
    >
      <span>{{ REACTION_EMOJI[r.content] }}</span>
      <span>{{ r.count }}</span>
    </button>

    <UPopover v-if="canReact" v-model:open="pickerOpen">
      <UButton
        icon="i-lucide-smile-plus"
        color="neutral"
        variant="ghost"
        size="xs"
        square
        title="Add reaction"
      />
      <template #content>
        <div class="flex gap-1 p-1.5">
          <button
            v-for="kind in REACTION_KINDS"
            :key="kind"
            type="button"
            class="rounded-md p-1.5 text-base hover:bg-elevated"
            :title="REACTION_LABEL[kind]"
            :disabled="pending[kind]"
            @click="toggle(kind)"
          >
            {{ REACTION_EMOJI[kind] }}
          </button>
        </div>
      </template>
    </UPopover>
  </div>
</template>
