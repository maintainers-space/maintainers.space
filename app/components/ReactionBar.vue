<script setup lang="ts">
import type { ForgeReactionKind, ForgeReactionSummary, ForgeReactionTarget } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'
import { useForgeTokens } from '~/composables/useForgeTokens'

const props = defineProps<{
  reactions?: ForgeReactionSummary[]
  target: ForgeReactionTarget
}>()

const { forge, locator, provider } = useRepoContext()
const { get: getToken } = useForgeTokens()
const toast = useToast()

const local = ref<ForgeReactionSummary[]>((props.reactions ?? []).map((r) => ({ ...r })))
watch(
  () => props.reactions,
  (r) => {
    local.value = (r ?? []).map((x) => ({ ...x }))
  }
)

const pending = ref<Partial<Record<ForgeReactionKind, boolean>>>({})
const pickerOpen = ref(false)

const canReact = computed(
  () =>
    !!forge.value?.capabilities.reactions &&
    !!forge.value.addReaction &&
    !!forge.value.removeReaction &&
    !!getToken(provider.value)
)

function summaryFor(kind: ForgeReactionKind): ForgeReactionSummary | undefined {
  return local.value.find((r) => r.kind === kind)
}

async function toggle(kind: ForgeReactionKind): Promise<void> {
  if (!canReact.value || pending.value[kind]) return
  const existing = summaryFor(kind)
  const reacted = existing?.viewerReacted ?? false
  pending.value[kind] = true
  try {
    if (reacted && existing) {
      await forge.value!.removeReaction!(locator.value, props.target, kind)
      existing.count = Math.max(0, existing.count - 1)
      existing.viewerReacted = false
      local.value = local.value.filter((r) => r.count > 0)
    } else {
      await forge.value!.addReaction!(locator.value, props.target, kind)
      if (existing) {
        existing.count += 1
        existing.viewerReacted = true
      } else {
        local.value.push({ kind, count: 1, viewerReacted: true })
      }
    }
  } catch (e) {
    toast.add({
      title: 'Could not update reaction',
      description:
        (e as { data?: { message?: string }; message?: string })?.data?.message ??
        (e as { message?: string })?.message,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    pending.value[kind] = false
  }
  pickerOpen.value = false
}
</script>

<template>
  <div v-if="local.length || canReact" class="flex flex-wrap items-center gap-1.5">
    <button
      v-for="r in local"
      :key="r.kind"
      type="button"
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors"
      :class="
        r.viewerReacted
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-default bg-elevated/40 text-default hover:bg-elevated/70'
      "
      :disabled="!canReact || pending[r.kind]"
      :title="REACTION_LABEL[r.kind]"
      @click="toggle(r.kind)"
    >
      <span>{{ REACTION_EMOJI[r.kind] }}</span>
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
