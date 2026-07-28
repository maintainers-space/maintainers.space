<script setup lang="ts">
import type { ForgeRepo } from '~/types/forge'
import ConfirmModal from '~/components/ConfirmModal.vue'

const props = defineProps<{ repo: ForgeRepo }>()

const { starred, stars, pending, loaded, canStar, toggle } = useRepoStar(toRef(props, 'repo'))
const toast = useToast()
const overlay = useOverlay()
const confirmUnstar = overlay.create(ConfirmModal)

async function onClick(): Promise<void> {
  if (starred.value) {
    const ok = await confirmUnstar.open({
      title: 'Unstar this repository?',
      description: `You won't see ${props.repo.name} in your starred repos anymore.`,
      confirmLabel: 'Unstar',
      color: 'error'
    }).result
    if (!ok) return
  }
  try {
    await toggle()
  } catch (e) {
    toast.add({
      title: 'Could not update star',
      description: e instanceof Error ? e.message : undefined,
      color: 'error'
    })
  }
}
</script>

<template>
  <button
    v-if="canStar"
    type="button"
    :disabled="!loaded || pending"
    :aria-pressed="starred"
    :title="starred ? 'Unstar this repository' : 'Star this repository'"
    class="inline-flex items-center gap-1 rounded transition-colors disabled:opacity-60"
    :class="starred ? 'text-warning hover:text-warning/80' : 'text-muted hover:text-highlighted'"
    @click="onClick"
  >
    <svg
      viewBox="0 0 24 24"
      class="size-4"
      :fill="starred ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z"
      />
    </svg>
    <span class="tabular-nums">{{ formatCompactNumber(stars ?? 0) }}</span>
  </button>

  <span v-else-if="repo.stars !== undefined" class="inline-flex items-center gap-1">
    <UIcon name="i-lucide-star" class="size-4" />{{ formatCompactNumber(repo.stars) }}
  </span>
</template>
