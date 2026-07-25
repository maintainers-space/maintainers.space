<script setup lang="ts">
export interface HealthFile {
  key: string
  label: string
  icon: string
  name: string
  path: string
}

const props = defineProps<{
  files: HealthFile[]
  load: (path: string) => Promise<string>
}>()

const active = ref(props.files[0]?.path ?? '')

watch(
  () => props.files,
  (f) => {
    if (!f.some((x) => x.path === active.value)) active.value = f[0]?.path ?? ''
  }
)

const tabItems = computed(() =>
  props.files.map((f) => ({ label: f.label, icon: f.icon, value: f.path }))
)
const activeFile = computed(() => props.files.find((f) => f.path === active.value))

const isMarkdown = computed(() => {
  const n = activeFile.value?.name ?? ''
  return /\.(md|markdown|mdown|rst)$/i.test(n) || !/\.[a-z0-9]+$/i.test(n)
})

interface DocState {
  loading: boolean
  error: string | null
  content: string
}
const cache = reactive<Record<string, DocState>>({})
const current = computed<DocState | undefined>(() => cache[active.value])

async function ensure(path: string): Promise<void> {
  if (!path || cache[path]) return
  cache[path] = { loading: true, error: null, content: '' }
  try {
    cache[path].content = await props.load(path)
  } catch (e) {
    cache[path].error = e instanceof Error ? e.message : 'Failed to load file.'
  } finally {
    cache[path].loading = false
  }
}

watch(active, (p) => ensure(p), { immediate: true })
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <div class="border-b border-default bg-elevated/50 px-2">
      <UTabs v-model="active" :items="tabItems" :content="false" variant="link" size="sm" />
    </div>

    <div class="p-6">
      <div v-if="current?.loading" class="space-y-2">
        <USkeleton class="h-4 w-2/3" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-4/5" />
      </div>

      <UAlert
        v-else-if="current?.error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="current.error"
      />

      <MarkdownBody
        v-else-if="isMarkdown"
        :content="current?.content"
        empty="This file is empty."
      />

      <pre v-else class="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted">{{
        current?.content
      }}</pre>
    </div>
  </div>
</template>
