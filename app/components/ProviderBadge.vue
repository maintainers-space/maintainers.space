<script setup lang="ts">
import { getForge } from '~/lib/forges'
import type { ForgeId } from '~/types/forge'

const props = withDefaults(defineProps<{ provider: ForgeId, size?: 'xs' | 'sm' | 'md', variant?: 'subtle' | 'soft' | 'outline' }>(), {
  size: 'sm',
  variant: 'subtle'
})

const forge = computed(() => getForge(props.provider))
</script>

<template>
  <UBadge
    :size="size"
    color="neutral"
    :variant="variant"
    class="gap-1"
  >
    <ForgeIcon :provider="provider" class="size-3.5" />
    {{ forge?.label ?? provider }}
  </UBadge>
</template>
