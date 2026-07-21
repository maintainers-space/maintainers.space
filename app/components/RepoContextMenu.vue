<script setup lang="ts">
import type { ForgeRepo } from '~/types/forge'
import { useRepoContextMenu } from '~/composables/useRepoContextMenu'

const props = defineProps<{ repo: ForgeRepo }>()
const { items } = useRepoContextMenu(() => props.repo)
</script>

<template>
  <UContextMenu :items="items">
    <slot />
  </UContextMenu>
</template>
