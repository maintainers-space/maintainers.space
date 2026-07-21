<script setup lang="ts">
import type { ForgeAccount } from '~/composables/useForgeAccounts'
import { getForge } from '~/lib/forges'

const props = defineProps<{ account: ForgeAccount }>()
const emit = defineEmits<{ unlink: [account: ForgeAccount] }>()

const forge = computed(() => getForge(props.account.provider))
</script>

<template>
  <div class="flex items-center gap-3 rounded-lg border border-default p-3">
    <UAvatar
      :src="account.avatarUrl"
      :alt="account.username"
      :icon="forge?.icon ?? 'i-lucide-git-fork'"
      size="md"
    />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <span class="truncate font-medium text-default">{{ account.displayName || account.username }}</span>
        <UBadge
          v-if="account.verified"
          label="Verified"
          color="primary"
          variant="subtle"
          size="sm"
        />
      </div>
      <div class="flex items-center gap-1 text-sm text-muted">
        <ForgeIcon :provider="account.provider" class="size-3.5" />
        <span>{{ forge?.label ?? account.provider }}</span>
        <span>·</span>
        <a
          v-if="account.profileUrl"
          :href="account.profileUrl"
          target="_blank"
          class="truncate hover:text-default hover:underline"
        >@{{ account.username }}</a>
        <span v-else class="truncate">@{{ account.username }}</span>
        <span v-if="account.host" class="text-dimmed">({{ account.host }})</span>
      </div>
    </div>
    <UButton
      icon="i-lucide-unlink"
      color="neutral"
      variant="ghost"
      aria-label="Unlink account"
      @click="emit('unlink', account)"
    />
  </div>
</template>
