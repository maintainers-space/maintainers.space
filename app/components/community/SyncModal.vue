<script setup lang="ts">
// Brings an existing Community up to date with the forge: a channel for every new repository, a
// role and channel for every new team. Shows what it would add first, and only ever adds.
import type { ResolvedCommunity } from '~/lib/community/discovery'
import { forgeLabel } from '~/lib/community/link'
import { diffCommunity, type CommunityPlan } from '~/lib/community/structure'
import { applyOps, describeOp, type SyncProgress } from '~/lib/community/sync'

const props = defineProps<{ community: ResolvedCommunity; plan: CommunityPlan | null }>()
const emit = defineEmits<{ synced: [] }>()
const open = defineModel<boolean>('open', { default: false })

const busy = ref(false)
const progress = ref<SyncProgress | null>(null)
const failure = ref<string | null>(null)

const ops = computed(() => (props.plan ? diffCommunity(props.plan, props.community.data) : []))
const forgeName = computed(() => forgeLabel(props.community.record.forge.provider))

async function sync(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    await applyOps(props.community.record.community, props.community.data, ops.value, (p) => {
      progress.value = p
    })
    emit('synced')
    open.value = false
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
    emit('synced')
  } finally {
    busy.value = false
    progress.value = null
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Sync with ${forgeName}`"
    description="Adds channels for new repositories and teams. Nothing you changed is touched."
    :dismissible="!busy"
  >
    <template #body>
      <div v-if="!plan" class="space-y-2">
        <USkeleton v-for="i in 4" :key="i" class="h-5 w-full" />
      </div>
      <p v-else-if="!ops.length" class="text-sm text-muted">
        Everything is in place. New repositories and teams show up here once they exist on
        {{ forgeName }}.
      </p>
      <ul v-else class="max-h-72 space-y-1 overflow-y-auto">
        <li
          v-for="(op, i) in ops"
          :key="i"
          class="flex items-center gap-2 text-sm"
          :class="progress && i < progress.done ? 'text-muted line-through' : 'text-default'"
        >
          <UIcon
            :name="
              op.kind === 'createRole'
                ? 'i-lucide-shield'
                : op.kind === 'createCategory'
                  ? 'i-lucide-folder'
                  : 'i-lucide-hash'
            "
            class="size-4 shrink-0 text-muted"
          />
          <span class="truncate">{{ describeOp(op) }}</span>
        </li>
      </ul>
      <UAlert
        v-if="failure"
        class="mt-4"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="The sync stopped"
        :description="`${failure} Whatever was added stays; syncing again continues from there.`"
      />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Close"
          :disabled="busy"
          @click="open = false"
        />
        <UButton
          :label="ops.length ? `Add ${ops.length}` : 'Nothing to add'"
          icon="i-lucide-refresh-cw"
          :loading="busy"
          :disabled="!ops.length"
          @click="sync"
        />
      </div>
    </template>
  </UModal>
</template>
