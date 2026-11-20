<script setup lang="ts">
import type { Actor } from 'forges'

const props = withDefaults(
  defineProps<{
    user?: Pick<Actor, 'login' | 'name' | 'avatarUrl'> | null
    avatar?: boolean
    class?: string
  }>(),
  {
    user: null,
    avatar: true,
    class: ''
  }
)

const label = computed(() => actorLabel(props.user))
const isDid = computed(() => (props.user?.login ?? '').startsWith('did:'))
</script>

<template>
  <span v-if="user" :class="['inline-flex items-center gap-1.5 min-w-0', props.class]">
    <UAvatar v-if="avatar && user.avatarUrl" :src="user.avatarUrl" :alt="label" size="3xs" />
    <UIcon v-else-if="avatar && isDid" name="i-lucide-at-sign" class="size-3.5 text-muted" />
    <span class="truncate">{{ label }}</span>
  </span>
</template>
