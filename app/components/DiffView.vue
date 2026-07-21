<script setup lang="ts">
import type { ForgeFileDiff } from '~/types/forge'

const props = defineProps<{ files: ForgeFileDiff[] }>()

interface DiffLine { type: 'add' | 'del' | 'ctx' | 'hunk', text: string }

function parsePatch(patch?: string | null): DiffLine[] {
  if (!patch) return []
  return patch.split('\n').map((line): DiffLine => {
    if (line.startsWith('@@')) return { type: 'hunk', text: line }
    if (line.startsWith('+')) return { type: 'add', text: line }
    if (line.startsWith('-')) return { type: 'del', text: line }
    return { type: 'ctx', text: line }
  })
}

const STATUS_COLOR: Record<string, string> = {
  added: 'success', removed: 'error', modified: 'warning', renamed: 'info', copied: 'neutral', changed: 'warning'
}

const parsed = computed(() => props.files.map(f => ({ file: f, lines: parsePatch(f.patch) })))
const open = reactive<Record<string, boolean>>({})
function toggle(path: string) {
  open[path] = !(open[path] ?? true)
}
function isOpen(path: string) {
  return open[path] ?? true
}
</script>

<template>
  <div class="space-y-4">
    <div v-for="{ file, lines } in parsed" :key="file.path" class="overflow-hidden rounded-lg border border-default">
      <button
        type="button"
        class="flex w-full items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-left text-sm hover:bg-elevated/70"
        @click="toggle(file.path)"
      >
        <UIcon :name="isOpen(file.path) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 shrink-0 text-muted" />
        <UBadge
          :color="(STATUS_COLOR[file.status] as any) ?? 'neutral'"
          variant="subtle"
          size="xs"
          class="capitalize"
        >
          {{ file.status }}
        </UBadge>
        <span class="truncate font-mono text-xs text-default">
          <span v-if="file.oldPath && file.oldPath !== file.path" class="text-muted">{{ file.oldPath }} → </span>{{ file.path }}
        </span>
        <span class="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs">
          <span v-if="file.additions" class="text-success">+{{ file.additions }}</span>
          <span v-if="file.deletions" class="text-error">-{{ file.deletions }}</span>
        </span>
      </button>

      <div v-if="isOpen(file.path)">
        <p v-if="file.isBinary" class="px-3 py-4 text-center text-xs text-muted">
          Binary file not shown.
        </p>
        <p v-else-if="!lines.length" class="px-3 py-4 text-center text-xs text-muted">
          No preview available for this change.
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full border-collapse font-mono text-xs">
            <tbody>
              <tr
                v-for="(line, i) in lines"
                :key="i"
                :class="{
                  'bg-success/10': line.type === 'add',
                  'bg-error/10': line.type === 'del',
                  'bg-info/10 text-muted select-none': line.type === 'hunk'
                }"
              >
                <td
                  class="w-6 select-none border-r border-default/60 px-1 text-center align-top"
                  :class="{ 'text-success': line.type === 'add', 'text-error': line.type === 'del', 'text-muted': line.type !== 'add' && line.type !== 'del' }"
                >
                  {{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : '' }}
                </td>
                <td class="whitespace-pre-wrap break-all px-2 py-0.5" :class="{ 'text-success': line.type === 'add', 'text-error': line.type === 'del' }">
                  {{ line.type === 'hunk' || line.type === 'ctx' ? line.text : line.text.slice(1) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
