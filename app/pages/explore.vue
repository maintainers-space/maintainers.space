<script setup lang="ts">
import type { GraphNode, GraphPersonNode } from '~/composables/useSocialGraph'

const { isAuthenticated } = useAuth()
const { nodes, links, loading, error, load } = useSocialGraph()
const intro = useDismissible('explore-graph-intro')

const selected = ref<GraphPersonNode | null>(null)
const selectedScreen = ref<{ x: number; y: number } | null>(null)

function onSelect(node: GraphNode | null, screen: { x: number; y: number } | null): void {
  if (node?.kind === 'project') {
    selected.value = null
    navigateTo(repoPath({ provider: node.provider, owner: node.owner, name: node.name }))
    return
  }
  selected.value = node
  selectedScreen.value = screen
}

async function reload(): Promise<void> {
  // The graph fits itself once the simulation settles after the new data
  // lands (see SocialGraph's onEngineStop) — fitting any earlier would frame
  // nodes before they've spread out from their spawn point.
  await load()
}

onMounted(() => {
  if (isAuthenticated.value) reload()
})
watch(isAuthenticated, (v) => {
  if (v) reload()
})
</script>

<template>
  <UDashboardPanel id="explore">
    <template #header>
      <UDashboardNavbar title="Explore">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="loading"
            aria-label="Refresh"
            @click="reload"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div
        v-if="!isAuthenticated"
        class="mx-auto flex h-full max-w-md items-center justify-center text-center"
      >
        <div>
          <UIcon name="i-lucide-share-2" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm text-muted">
            Sign in to see who you follow — on Bluesky and on every linked forge — laid out as an
            interactive map, with the repositories they work on connected in.
          </p>
        </div>
      </div>

      <div v-else class="relative h-full w-full">
        <div v-if="loading && !nodes.length" class="flex h-full items-center justify-center">
          <div class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />Building your graph…
          </div>
        </div>

        <div
          v-else-if="!nodes.length"
          class="flex h-full flex-col items-center justify-center text-center"
        >
          <UIcon name="i-lucide-share-2" class="size-8 text-muted" />
          <p class="mt-3 text-sm text-muted">No connections found yet.</p>
          <p class="mx-auto mt-1 max-w-sm text-xs text-muted">
            Follow people on Bluesky or on a linked forge, or connect a forge account in
            <NuxtLink to="/settings/accounts" class="text-primary hover:underline"
              >settings</NuxtLink
            >, to start building your graph.
          </p>
        </div>

        <template v-else>
          <UAlert
            v-if="!intro.dismissed.value"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            title="What is this?"
            description="Every person you follow — on Bluesky and on any forge account you've linked — plotted as a node, with a second ring of the people they follow, and the repositories that connect you all. Drag nodes to rearrange, scroll to zoom, click a person for their profile or a project to open it."
            close
            class="absolute top-3 left-1/2 z-10 w-auto max-w-lg -translate-x-1/2"
            @update:open="intro.dismiss()"
          />
          <ExploreSocialGraph :nodes="nodes" :links="links" @select="onSelect" />
          <ExplorePersonCard
            v-if="selected && selectedScreen"
            :node="selected"
            :screen="selectedScreen"
            @close="selected = null"
          />
        </template>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="error"
          class="absolute bottom-4 left-1/2 w-auto -translate-x-1/2"
        />

        <div
          class="pointer-events-none absolute bottom-4 left-4 flex flex-wrap items-center gap-3 rounded-lg border border-default bg-default/80 px-3 py-1.5 text-xs text-muted backdrop-blur"
        >
          <span class="inline-flex items-center gap-1.5"
            ><span class="size-2 rounded-full bg-[#eab308]" />You</span
          >
          <span class="inline-flex items-center gap-1.5"
            ><span class="size-2 rounded-full bg-[#3b82f6]" />Follows</span
          >
          <span class="inline-flex items-center gap-1.5"
            ><span class="size-2 rounded-full bg-[#8b5cf6]" />Second-degree</span
          >
          <span class="inline-flex items-center gap-1.5"
            ><span class="size-2 bg-neutral-500" />Projects</span
          >
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
