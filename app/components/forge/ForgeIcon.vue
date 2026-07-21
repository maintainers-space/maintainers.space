<script setup lang="ts">
import { getForge } from '~/lib/forges'

const props = withDefaults(defineProps<{ provider: string, class?: string }>(), { class: '' })

const icon = computed(() => getForge(props.provider)?.icon ?? 'i-lucide-git-fork')
</script>

<template>
  <UIcon :name="icon" :class="props.class" />
</template>
