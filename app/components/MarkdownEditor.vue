<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    rows?: number
    disabled?: boolean
    previewEmpty?: string
  }>(),
  {
    placeholder: 'Leave a comment…',
    rows: 5,
    disabled: false,
    previewEmpty: 'Nothing to preview.'
  }
)

const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()

const model = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const tab = ref<'write' | 'preview'>('write')
const wrapRef = ref<HTMLElement>()

const tabItems = [
  { label: 'Write', value: 'write' },
  { label: 'Preview', value: 'preview' }
]

function textarea(): HTMLTextAreaElement | null {
  return wrapRef.value?.querySelector('textarea') ?? null
}

/** Wrap the current selection with `before`/`after`, seeding `placeholder` when empty. */
function surround(before: string, after = before, placeholder = ''): void {
  const ta = textarea()
  if (!ta) return
  const s = ta.selectionStart
  const e = ta.selectionEnd
  const val = model.value
  const selected = val.slice(s, e) || placeholder
  model.value = val.slice(0, s) + before + selected + after + val.slice(e)
  nextTick(() => {
    ta.focus()
    const start = s + before.length
    ta.setSelectionRange(start, start + selected.length)
  })
}

/** Prefix every line touched by the selection with `prefix` (lists, quotes, headings). */
function prefixLines(prefix: string): void {
  const ta = textarea()
  if (!ta) return
  const s = ta.selectionStart
  const e = ta.selectionEnd
  const val = model.value
  const lineStart = val.lastIndexOf('\n', s - 1) + 1
  const nl = val.indexOf('\n', e)
  const lineEnd = nl === -1 ? val.length : nl
  const block = val.slice(lineStart, lineEnd) || ''
  const replaced = block
    .split('\n')
    .map((l) => prefix + l)
    .join('\n')
  model.value = val.slice(0, lineStart) + replaced + val.slice(lineEnd)
  nextTick(() => {
    ta.focus()
    ta.setSelectionRange(lineStart, lineStart + replaced.length)
  })
}

const tools = [
  { icon: 'i-lucide-heading', title: 'Heading', run: () => prefixLines('### ') },
  { icon: 'i-lucide-bold', title: 'Bold', run: () => surround('**', '**', 'bold text') },
  { icon: 'i-lucide-italic', title: 'Italic', run: () => surround('_', '_', 'italic text') },
  {
    icon: 'i-lucide-strikethrough',
    title: 'Strikethrough',
    run: () => surround('~~', '~~', 'strikethrough')
  },
  { icon: 'i-lucide-code', title: 'Inline code', run: () => surround('`', '`', 'code') },
  { icon: 'i-lucide-link', title: 'Link', run: () => surround('[', '](url)', 'text') },
  { icon: 'i-lucide-quote', title: 'Quote', run: () => prefixLines('> ') },
  { icon: 'i-lucide-list', title: 'Bulleted list', run: () => prefixLines('- ') },
  { icon: 'i-lucide-list-ordered', title: 'Numbered list', run: () => prefixLines('1. ') },
  { icon: 'i-lucide-list-checks', title: 'Task list', run: () => prefixLines('- [ ] ') }
]
</script>

<template>
  <div
    ref="wrapRef"
    class="overflow-hidden rounded-lg border border-default bg-default focus-within:border-primary"
  >
    <div
      class="flex items-center justify-between gap-2 border-b border-default bg-elevated/40 px-2 py-1"
    >
      <UTabs v-model="tab" :items="tabItems" :content="false" size="xs" color="neutral" />
      <div v-show="tab === 'write'" class="flex items-center gap-0.5">
        <UButton
          v-for="t in tools"
          :key="t.title"
          :icon="t.icon"
          :title="t.title"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="t.run"
        />
      </div>
    </div>

    <div v-show="tab === 'write'" class="p-1">
      <UTextarea
        v-model="model"
        :rows="rows"
        :placeholder="placeholder"
        :disabled="disabled"
        variant="none"
        autoresize
        class="w-full"
        @keydown.meta.enter="emit('submit')"
        @keydown.ctrl.enter="emit('submit')"
      />
    </div>

    <div v-show="tab === 'preview'" class="min-h-24 px-3 py-2">
      <MarkdownBody :content="model" :empty="previewEmpty" />
    </div>
  </div>
</template>
