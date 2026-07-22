<script setup lang="ts">
import type { ForgeFileDiff } from '~/types/forge'

const props = withDefaults(defineProps<{ files: ForgeFileDiff[], commentable?: boolean }>(), {
  commentable: false
})

const emit = defineEmits<{ comment: [{ path: string, line: number, body: string }] }>()

interface DiffLine { type: 'add' | 'del' | 'ctx' | 'hunk', text: string, newLine?: number }

function parsePatch(patch?: string | null): DiffLine[] {
  if (!patch) return []
  let newLine = 0
  return patch.split('\n').map((line): DiffLine => {
    if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)/)
      if (m) newLine = Number(m[1])
      return { type: 'hunk', text: line }
    }
    if (line.startsWith('+')) {
      const cur = newLine
      newLine += 1
      return { type: 'add', text: line, newLine: cur }
    }
    if (line.startsWith('-')) {
      return { type: 'del', text: line }
    }
    const cur = newLine
    newLine += 1
    return { type: 'ctx', text: line, newLine: cur }
  })
}

const STATUS_COLOR: Record<string, string> = {
  added: 'success', removed: 'error', modified: 'warning', renamed: 'info', copied: 'neutral', changed: 'warning'
}

const parsed = computed(() => props.files.map(f => ({ file: f, lines: parsePatch(f.patch) })))
const totals = computed(() => {
  let additions = 0
  let deletions = 0
  for (const f of props.files) {
    additions += f.additions ?? 0
    deletions += f.deletions ?? 0
  }
  return { files: props.files.length, additions, deletions }
})

const open = reactive<Record<string, boolean>>({})
function toggle(path: string): void {
  open[path] = !(open[path] ?? true)
}
function isOpen(path: string): boolean {
  return open[path] ?? true
}

// --- inline comments / suggestions ---
const active = ref<{ path: string, line: number } | null>(null)
const draft = ref('')
const submitting = ref(false)

function isActive(path: string, line?: number): boolean {
  return !!active.value && !!line && active.value.path === path && active.value.line === line
}
function openComment(path: string, line?: number): void {
  if (!line) return
  active.value = { path, line }
  draft.value = ''
}
function suggest(text: string): void {
  const content = text.replace(/^[+ ]/, '')
  draft.value = '```suggestion\n' + content + '\n```\n'
}
function cancel(): void {
  active.value = null
  draft.value = ''
}
async function submit(): Promise<void> {
  if (!active.value || !draft.value.trim()) return
  submitting.value = true
  emit('comment', { path: active.value.path, line: active.value.line, body: draft.value })
  submitting.value = false
  cancel()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between rounded-lg border border-default bg-elevated/40 px-3 py-2 text-sm">
      <span class="text-muted">
        <span class="font-medium text-default">{{ totals.files }}</span> changed file{{ totals.files === 1 ? '' : 's' }}
      </span>
      <DiffStat :additions="totals.additions" :deletions="totals.deletions" :show-files="false" />
    </div>

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
              <template v-for="(line, i) in lines" :key="i">
                <tr
                  class="group"
                  :class="{
                    'bg-success/10': line.type === 'add',
                    'bg-error/10': line.type === 'del',
                    'bg-info/10 text-muted select-none': line.type === 'hunk'
                  }"
                >
                  <td
                    v-if="commentable"
                    class="w-7 select-none border-r border-default/60 px-0 text-center align-top"
                  >
                    <button
                      v-if="line.newLine"
                      type="button"
                      class="mx-auto flex size-4 items-center justify-center rounded bg-primary text-inverted opacity-0 transition group-hover:opacity-100"
                      title="Add a comment or suggestion"
                      @click="openComment(file.path, line.newLine)"
                    >
                      <UIcon name="i-lucide-plus" class="size-3" />
                    </button>
                  </td>
                  <td
                    class="w-6 select-none border-r border-default/60 px-1 text-center align-top"
                    :class="{ 'text-success': line.type === 'add', 'text-error': line.type === 'del', 'text-muted': line.type !== 'add' && line.type !== 'del' }"
                  >
                    {{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : '' }}
                  </td>
                  <td
                    class="whitespace-pre-wrap break-all px-2 py-0.5"
                    :class="{ 'text-success': line.type === 'add', 'text-error': line.type === 'del' }"
                  >
                    {{ line.type === 'hunk' || line.type === 'ctx' ? line.text : line.text.slice(1) }}
                  </td>
                </tr>

                <tr v-if="isActive(file.path, line.newLine)" :key="`c-${i}`">
                  <td :colspan="commentable ? 3 : 2" class="bg-default px-3 py-3">
                    <div class="space-y-2 font-sans">
                      <div class="flex items-center justify-between">
                        <p class="text-xs text-muted">
                          Commenting on line {{ line.newLine }} of <span class="font-mono">{{ file.path }}</span>
                        </p>
                        <UButton
                          icon="i-lucide-lightbulb"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          label="Suggest change"
                          @click="suggest(line.text)"
                        />
                      </div>
                      <MarkdownEditor
                        v-model="draft"
                        :rows="4"
                        placeholder="Leave a comment or suggestion…"
                        @submit="submit"
                      />
                      <div class="flex items-center gap-2">
                        <UButton
                          size="xs"
                          icon="i-lucide-check"
                          label="Add comment"
                          :loading="submitting"
                          :disabled="!draft.trim()"
                          @click="submit"
                        />
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          label="Cancel"
                          :disabled="submitting"
                          @click="cancel"
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
