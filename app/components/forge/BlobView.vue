<script setup lang="ts">
import type { ForgeBlob } from '~/types/forge'

const props = defineProps<{ blob: ForgeBlob }>()

const isImage = computed(() => props.blob.mimeType?.startsWith('image/') ?? false)
const imageSrc = computed(() => {
  if (!isImage.value) return ''
  if (props.blob.encoding === 'base64') return `data:${props.blob.mimeType};base64,${props.blob.content}`
  return props.blob.content
})

const lines = computed(() => {
  if (props.blob.isBinary || props.blob.encoding === 'base64') return []
  return props.blob.content.replace(/\n$/, '').split('\n')
})

const fileName = computed(() => props.blob.path.split('/').pop() ?? props.blob.path)
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <div class="flex items-center gap-2 border-b border-default bg-elevated/50 px-4 py-2.5 text-sm">
      <UIcon name="i-lucide-file" class="size-4 text-muted" />
      <span class="font-medium text-default">{{ fileName }}</span>
      <span v-if="blob.size !== undefined" class="text-muted">· {{ formatBytes(blob.size) }}</span>
    </div>

    <div v-if="isImage" class="flex justify-center bg-elevated/20 p-6">
      <img :src="imageSrc" :alt="fileName" class="max-h-[70vh] max-w-full object-contain">
    </div>

    <div v-else-if="blob.isBinary" class="p-10 text-center text-sm text-muted">
      <UIcon name="i-lucide-file-x" class="mx-auto mb-2 size-8" />
      Binary file not shown.
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full border-collapse font-mono text-xs">
        <tbody>
          <tr v-for="(line, i) in lines" :key="i" class="hover:bg-elevated/40">
            <td class="select-none border-r border-default px-3 py-0.5 text-right align-top text-muted">
              {{ i + 1 }}
            </td>
            <td class="whitespace-pre px-4 py-0.5 text-default">
              {{ line || ' ' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
