<script setup lang="ts">
import type { ForgeSearchCode } from '~/types/forge'

const props = defineProps<{ code: ForgeSearchCode }>()

const to = computed(() => `/${props.code.provider}/${encodeURIComponent(props.code.repo.owner)}/${encodeURIComponent(props.code.repo.name)}`)
</script>

<template>
  <div class="rounded-lg border border-default p-3">
    <div class="flex items-center gap-2 text-sm">
      <ForgeIcon :provider="code.provider" class="size-4 shrink-0 text-muted" />
      <NuxtLink :to="to" class="truncate text-primary hover:underline">{{ code.repo.fullName }}</NuxtLink>
      <span class="text-muted">/</span>
      <span class="truncate font-mono text-xs text-default">{{ code.path }}</span>
    </div>
    <pre v-if="code.fragments?.length" class="mt-2 overflow-x-auto rounded bg-elevated/60 p-2 font-mono text-xs text-muted"><code>{{ code.fragments[0] }}</code></pre>
  </div>
</template>
