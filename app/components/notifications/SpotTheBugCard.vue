<script setup lang="ts">
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { useSpotTheBug } from '~/composables/useSpotTheBug'

const { challenge, check, isSolved } = useSpotTheBug()
const colorMode = useColorMode()

const revealed = ref(isSolved.value)
const wasCorrect = ref(isSolved.value)
const lastCheckFailed = ref(false)

const editorEl = useTemplateRef<HTMLDivElement>('editorEl')
const editableCompartment = new Compartment()
let view: EditorView | null = null

const editorTheme = EditorView.theme({
  '&': { fontSize: '0.8rem' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '0.75rem 0' },
  '.cm-gutters': { fontFamily: 'var(--font-mono)' },
  '.cm-scroller': { maxHeight: '340px' }
})

function buildEditor(): void {
  if (!editorEl.value) return
  view?.destroy()
  view = new EditorView({
    state: EditorState.create({
      doc: revealed.value ? challenge.value.fixed : challenge.value.buggy,
      extensions: [
        basicSetup,
        javascript({ typescript: true }),
        EditorView.lineWrapping,
        editorTheme,
        editableCompartment.of(EditorView.editable.of(!revealed.value)),
        ...(colorMode.value === 'dark' ? [oneDark] : [])
      ]
    }),
    parent: editorEl.value
  })
}

onMounted(buildEditor)
onBeforeUnmount(() => view?.destroy())

function checkFix(): void {
  if (!view || revealed.value) return
  const ok = check(view.state.doc.toString())
  lastCheckFailed.value = !ok
  if (ok) {
    wasCorrect.value = true
    revealed.value = true
    view.dispatch({ effects: editableCompartment.reconfigure(EditorView.editable.of(false)) })
  }
}

function reveal(): void {
  if (!view) return
  wasCorrect.value = false
  revealed.value = true
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: challenge.value.fixed },
    effects: editableCompartment.reconfigure(EditorView.editable.of(false))
  })
}

const diffLines = computed(() =>
  challenge.value.diff.split('\n').map((line) => ({
    text: line,
    kind: line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx'
  }))
)
</script>

<template>
  <div class="rounded-xl border border-default bg-elevated/20 p-5">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-bug" class="size-5 text-primary" />
      <h2 class="text-base font-semibold text-highlighted">Time for a little challenge?</h2>
    </div>
    <p class="mt-1 text-sm text-muted">{{ challenge.title }}</p>

    <div ref="editorEl" class="mt-4 overflow-hidden rounded-lg border border-default" />

    <div v-if="!revealed" class="mt-3 flex items-center gap-2">
      <UButton label="Check my fix" icon="i-lucide-check" size="sm" @click="checkFix" />
      <UButton
        label="Reveal the fix"
        icon="i-lucide-eye"
        size="sm"
        color="neutral"
        variant="ghost"
        @click="reveal"
      />
    </div>
    <p v-if="!revealed && lastCheckFailed" class="mt-2 text-sm text-warning">
      Not quite — the bug's still in there. Keep poking, or reveal the fix.
    </p>

    <template v-if="revealed">
      <p
        class="mt-3 flex items-center gap-1.5 text-sm font-medium"
        :class="wasCorrect ? 'text-success' : 'text-default'"
      >
        <UIcon :name="wasCorrect ? 'i-lucide-party-popper' : 'i-lucide-lightbulb'" class="size-4" />
        {{ wasCorrect ? "Nice catch — that's the fix." : "Here's the fix." }}
      </p>

      <pre
        class="mt-2 overflow-x-auto rounded-lg bg-elevated/60 p-3 font-mono text-xs leading-relaxed"
      ><code v-for="(l, i) in diffLines" :key="i" class="block" :class="{
          'bg-success/10 text-success': l.kind === 'add',
          'bg-error/10 text-error': l.kind === 'del',
          'text-muted': l.kind === 'ctx'
        }">{{ l.text || ' ' }}</code></pre>

      <p class="mt-2 text-sm text-muted">{{ challenge.explanation }}</p>

      <p class="mt-3 text-xs text-muted">
        Sponsored by <span class="font-medium text-default">{{ challenge.sponsor.name }}</span>
      </p>
    </template>

    <p class="mt-4 border-t border-default pt-3 text-xs text-muted">
      Inspired by
      <a
        href="https://bytes.dev"
        target="_blank"
        rel="noopener"
        class="text-primary hover:underline"
        >bytes.dev</a
      >
    </p>
  </div>
</template>
