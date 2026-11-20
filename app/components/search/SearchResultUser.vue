<script setup lang="ts">
import type { UserHit } from '~/lib/forges/gaps/search-extra'

const props = defineProps<{ user: UserHit }>()

const to = computed(() => `/${props.user.provider}/${encodeURIComponent(props.user.login)}`)
</script>

<template>
  <NuxtLink
    :to="to"
    class="flex items-center gap-3 rounded-lg border border-default p-3 transition hover:border-primary hover:bg-elevated/40"
  >
    <UAvatar v-if="user.avatarUrl" :src="user.avatarUrl" :alt="user.login" size="sm" />
    <UIcon v-else name="i-lucide-user" class="size-8 rounded-full bg-elevated p-1.5 text-muted" />
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium text-primary">{{ actorLabel(user) }}</div>
      <div class="text-xs text-muted">@{{ user.login }}</div>
    </div>
    <ForgeIcon :provider="user.provider" class="size-4 shrink-0 text-muted" />
  </NuxtLink>
</template>
