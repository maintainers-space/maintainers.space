<script setup lang="ts">
import { getForge } from '~/lib/forges'
import type { GraphPersonNode } from '~/composables/useSocialGraph'
import type { ForgeRepo } from '~/types/forge'

const props = defineProps<{
  node: GraphPersonNode
  screen: { x: number; y: number }
}>()

const emit = defineEmits<{ close: [] }>()

const { get: getToken } = useForgeTokens()

const repos = ref<ForgeRepo[]>([])
const loadingRepos = ref(false)

async function loadRepos(): Promise<void> {
  loadingRepos.value = true
  const acct = props.node.accounts[0]
  const forge = acct ? getForge(acct.provider) : undefined
  repos.value =
    acct && forge?.listRepos
      ? await forge
          .listRepos(acct.login, { token: getToken(acct.provider) })
          .then((r) => r.slice(0, 5))
          .catch(() => [] as ForgeRepo[])
      : []
  loadingRepos.value = false
  nextTick(place)
}

watch(() => props.node.id, loadRepos, { immediate: true })

// Positioned relative to the same wrapper the graph canvas fills, flipping to
// whichever side/edge keeps it fully on-screen — clamped against the card's
// own measured size rather than a guessed constant, since its height varies
// with how many repos loaded in.
const cardEl = useTemplateRef<HTMLDivElement>('cardEl')
const style = ref<{ left: string; top: string }>({
  left: `${props.screen.x}px`,
  top: `${props.screen.y}px`
})

function place(): void {
  if (!import.meta.client) return
  const margin = 12
  const width = cardEl.value?.offsetWidth ?? 288
  const height = cardEl.value?.offsetHeight ?? 200
  const flip = props.screen.x + 16 + width > window.innerWidth
  const left = flip ? props.screen.x - width - 16 : props.screen.x + 16
  const top = props.screen.y - height / 2
  style.value = {
    left: `${Math.min(Math.max(left, margin), window.innerWidth - width - margin)}px`,
    top: `${Math.min(Math.max(top, margin), window.innerHeight - height - margin)}px`
  }
}

watch(
  () => [props.screen.x, props.screen.y, props.node.id],
  () => nextTick(place),
  { immediate: true }
)
</script>

<template>
  <div
    ref="cardEl"
    class="pointer-events-auto absolute z-20 w-72 rounded-lg border border-default bg-default p-4 shadow-xl"
    :style="style"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 items-center gap-3">
        <UAvatar :src="node.avatarUrl ?? undefined" :alt="node.label" size="lg" />
        <div class="min-w-0">
          <p class="truncate font-medium text-highlighted">{{ node.label }}</p>
          <div class="mt-0.5 flex flex-wrap gap-1">
            <ForgeIcon
              v-for="a in node.accounts"
              :key="`${a.provider}:${a.login}`"
              :provider="a.provider"
              class="size-3.5 text-muted"
            />
          </div>
        </div>
      </div>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Close"
        @click="emit('close')"
      />
    </div>

    <UButton
      :to="node.profileUrl"
      color="neutral"
      variant="subtle"
      size="xs"
      block
      class="mt-3"
      icon="i-lucide-external-link"
      label="View profile"
    />

    <div v-if="loadingRepos" class="mt-3 space-y-1.5">
      <USkeleton v-for="i in 3" :key="i" class="h-6 w-full" />
    </div>
    <div v-else-if="repos.length" class="mt-3 space-y-1">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted">Recent projects</p>
      <ul class="space-y-0.5">
        <li v-for="r in repos" :key="`${r.provider}:${r.fullName}`">
          <NuxtLink
            :to="repoPath(r)"
            class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition hover:bg-elevated/60"
          >
            <ForgeIcon :provider="r.provider" class="size-3.5 shrink-0 text-muted" />
            <span class="min-w-0 flex-1 truncate">{{ r.name }}</span>
            <span
              v-if="r.stars"
              class="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted"
            >
              <UIcon name="i-lucide-star" class="size-3" />{{ formatCompactNumber(r.stars) }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </div>
    <p v-else-if="!loadingRepos" class="mt-3 text-xs text-muted">No public projects found.</p>
  </div>
</template>
