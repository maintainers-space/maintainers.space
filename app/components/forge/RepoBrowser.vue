<script setup lang="ts">
import type { ForgeBranch, ForgeTreeEntry } from '~/types/forge'
import { useRepoContext } from '~/composables/useRepoContext'

const props = defineProps<{
  entries: ForgeTreeEntry[]
  base: string
  gitRef: string
  path?: string
  /** Link to the commit history, shown next to the entry count. Omit to hide it. */
  commitsHref?: string
}>()

const { forge, locator } = useRepoContext()

const sorted = computed(() =>
  [...props.entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
)

function linkFor(entry: ForgeTreeEntry): string {
  const kind = entry.type === 'dir' ? 'tree' : 'blob'
  return `${props.base}/${kind}/${encodeURIComponent(props.gitRef)}/${encodePathSegments(entry.path)}`
}

const crumbs = computed(() => {
  const parts = (props.path ?? '').split('/').filter(Boolean)
  const acc: { label: string; to: string }[] = []
  let cur = ''
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p
    acc.push({
      label: p,
      to: `${props.base}/tree/${encodeURIComponent(props.gitRef)}/${encodePathSegments(cur)}`
    })
  }
  return acc
})

// Branch switcher: fetched once per repo and reused across the whole file
// browser, so jumping between branches doesn't require knowing the URL shape.
const branches = ref<ForgeBranch[] | null>(null)
const branchesLoading = ref(false)
let branchesLoaded = false

async function ensureBranches(): Promise<void> {
  if (branchesLoaded || !forge.value?.listBranches) return
  branchesLoaded = true
  branchesLoading.value = true
  try {
    branches.value = await forge.value.listBranches(locator.value)
  } catch {
    branches.value = []
  } finally {
    branchesLoading.value = false
  }
}
onMounted(ensureBranches)
watch(locator, () => {
  branchesLoaded = false
  branches.value = null
  ensureBranches()
})

const branchItems = computed(() => {
  const known = branches.value ?? []
  const items = known.map((b) => ({
    label: b.name,
    value: b.name,
    icon: b.isDefault ? 'i-lucide-star' : undefined
  }))
  // The current ref might be a branch the fetch hasn't resolved yet (or a tag/
  // commit sha) — always keep it selectable so the control never shows blank.
  if (!items.some((i) => i.value === props.gitRef)) {
    items.unshift({ label: props.gitRef, value: props.gitRef, icon: undefined })
  }
  return items
})

function onBranchChange(next: string | undefined): void {
  if (!next || next === props.gitRef) return
  const sub = props.path ? `/${encodePathSegments(props.path)}` : ''
  navigateTo(`${props.base}/tree/${encodeURIComponent(next)}${sub}`)
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <div
      class="flex flex-wrap items-center gap-1.5 border-b border-default bg-elevated/50 px-4 py-2.5 text-sm"
    >
      <UButton
        :to="base"
        icon="i-lucide-book-marked"
        size="xs"
        color="neutral"
        variant="ghost"
        square
        title="Back to repository overview"
      />
      <USelectMenu
        :model-value="gitRef"
        :items="branchItems"
        :loading="branchesLoading"
        value-key="value"
        label-key="label"
        icon="i-lucide-git-branch"
        size="xs"
        class="w-40"
        @update:model-value="onBranchChange"
      />
      <template v-for="c in crumbs" :key="c.to">
        <span class="text-muted">/</span>
        <NuxtLink
          :to="c.to"
          class="font-medium hover:underline"
          :class="c === crumbs[crumbs.length - 1] ? 'text-default' : 'text-primary'"
          >{{ c.label }}</NuxtLink
        >
      </template>
      <span class="ms-auto text-xs text-muted"
        >{{ entries.length }} {{ entries.length === 1 ? 'entry' : 'entries' }}</span
      >
      <UButton
        v-if="commitsHref"
        :to="commitsHref"
        icon="i-lucide-history"
        size="xs"
        color="neutral"
        variant="subtle"
        label="Commits"
      />
    </div>

    <ul role="list" class="divide-y divide-default">
      <li v-for="entry in sorted" :key="entry.path">
        <NuxtLink
          :to="linkFor(entry)"
          class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-elevated/40"
        >
          <UIcon
            :name="entry.type === 'dir' ? 'i-lucide-folder' : 'i-lucide-file'"
            class="size-4 shrink-0"
            :class="entry.type === 'dir' ? 'text-primary' : 'text-muted'"
          />
          <span class="truncate text-default" :class="{ 'font-medium': entry.type === 'dir' }">{{
            entry.name
          }}</span>
          <span
            v-if="entry.lastCommit?.message"
            class="ml-2 hidden min-w-0 truncate text-muted md:inline"
            >{{ entry.lastCommit.message }}</span
          >
          <span class="ml-auto shrink-0 text-xs text-muted">
            <span v-if="entry.lastCommit?.when">{{
              formatRelativeTime(entry.lastCommit.when)
            }}</span>
            <span v-else-if="entry.type === 'file' && entry.size !== undefined">{{
              formatBytes(entry.size)
            }}</span>
          </span>
        </NuxtLink>
      </li>

      <li v-if="!entries.length" class="px-4 py-8 text-center text-sm text-muted">
        This directory is empty.
      </li>
    </ul>
  </div>
</template>
