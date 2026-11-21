<script setup lang="ts">
import { blobUrl, type ActorView } from '~/lib/community/colibri'
import { displayName } from '~/lib/community/messages'

const props = withDefaults(
  defineProps<{ actor: ActorView; size?: 'xs' | 'sm' | 'md' | 'lg'; presence?: boolean }>(),
  { presence: false, size: 'md' }
)

const src = computed(() => blobUrl(props.actor.did, props.actor.data?.avatar, 'small'))
const online = computed(() => {
  const state = props.actor.data?.onlineState
  return state === 'online'
    ? 'bg-success'
    : state === 'away'
      ? 'bg-warning'
      : state === 'dnd'
        ? 'bg-error'
        : undefined
})
</script>

<template>
  <span class="relative inline-flex shrink-0">
    <UAvatar :src="src" :alt="displayName(actor)" :size="size" />
    <span
      v-if="presence && online"
      class="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-(--ui-bg)"
      :class="online"
    />
  </span>
</template>
