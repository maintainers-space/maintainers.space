<script setup lang="ts">
import type { ForgeTreeEntry } from '~/types/forge'

const props = defineProps<{
  entries: ForgeTreeEntry[]
  base: string
  gitRef: string
  path?: string
}>()

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
  const acc: { label: string, to: string }[] = [{ label: props.gitRef, to: `${props.base}/tree/${encodeURIComponent(props.gitRef)}` }]
  let cur = ''
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p
    acc.push({ label: p, to: `${props.base}/tree/${encodeURIComponent(props.gitRef)}/${encodePathSegments(cur)}` })
  }
  return acc
})
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <div class="flex flex-wrap items-center gap-1.5 border-b border-default bg-elevated/50 px-4 py-2.5 text-sm">
      <UIcon name="i-lucide-git-branch" class="size-4 shrink-0 text-muted" />
      <template v-for="(c, i) in crumbs" :key="c.to">
        <span v-if="i > 0" class="text-muted">/</span>
        <NuxtLink
          :to="c.to"
          class="font-medium hover:underline"
          :class="i === crumbs.length - 1 ? 'text-default' : 'text-primary'"
        >{{ c.label }}</NuxtLink>
      </template>
      <span class="ms-auto text-xs text-muted">{{ entries.length }} {{ entries.length === 1 ? 'entry' : 'entries' }}</span>
    </div>

    <ul role="list" class="divide-y divide-default">
      <li v-for="entry in sorted" :key="entry.path">
        <NuxtLink :to="linkFor(entry)" class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-elevated/40">
          <UIcon
            :name="entry.type === 'dir' ? 'i-lucide-folder' : 'i-lucide-file'"
            class="size-4 shrink-0"
            :class="entry.type === 'dir' ? 'text-primary' : 'text-muted'"
          />
          <span class="truncate text-default" :class="{ 'font-medium': entry.type === 'dir' }">{{ entry.name }}</span>
          <span v-if="entry.lastCommit?.message" class="ml-2 hidden min-w-0 truncate text-muted md:inline">{{ entry.lastCommit.message }}</span>
          <span class="ml-auto shrink-0 text-xs text-muted">
            <span v-if="entry.lastCommit?.when">{{ formatRelativeTime(entry.lastCommit.when) }}</span>
            <span v-else-if="entry.type === 'file' && entry.size !== undefined">{{ formatBytes(entry.size) }}</span>
          </span>
        </NuxtLink>
      </li>

      <li v-if="!entries.length" class="px-4 py-8 text-center text-sm text-muted">
        This directory is empty.
      </li>
    </ul>
  </div>
</template>
