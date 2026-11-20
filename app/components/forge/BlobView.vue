<script setup lang="ts">
import type { BlobData } from '~/lib/forges/reads'

const props = defineProps<{ blob: BlobData }>()

const lines = computed(() =>
  props.blob.kind === 'text' ? props.blob.content.replace(/\n$/, '').split('\n') : []
)

const fileName = computed(() => props.blob.path.split('/').pop() ?? props.blob.path)
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <div class="flex items-center gap-2 border-b border-default bg-elevated/50 px-4 py-2.5 text-sm">
      <UIcon name="i-lucide-file" class="size-4 text-muted" />
      <span class="font-medium text-default">{{ fileName }}</span>
      <span v-if="blob.size !== undefined" class="text-muted">· {{ formatBytes(blob.size) }}</span>
    </div>

    <div v-if="blob.kind === 'image'" class="flex justify-center bg-elevated/20 p-6">
      <img :src="blob.content" :alt="fileName" class="max-h-[70vh] max-w-full object-contain" />
    </div>

    <div v-else-if="blob.kind === 'binary'" class="p-10 text-center text-sm text-muted">
      <UIcon name="i-lucide-file-x" class="mx-auto mb-2 size-8" />
      Binary file not shown.
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full border-collapse font-mono text-xs">
        <tbody>
          <tr v-for="(line, i) in lines" :key="i" class="hover:bg-elevated/40">
            <td
              class="select-none border-r border-default px-3 py-0.5 text-right align-top text-muted"
            >
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
