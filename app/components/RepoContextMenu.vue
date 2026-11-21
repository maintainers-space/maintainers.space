<script setup lang="ts">
import type { RepoCard } from '~/lib/forges/view'
import { useRepoContextMenu } from '~/composables/useRepoContextMenu'

const props = defineProps<{ repo: RepoCard }>()
const { items } = useRepoContextMenu(() => props.repo)
</script>

<template>
  <UContextMenu :items="items">
    <slot />
  </UContextMenu>
</template>
