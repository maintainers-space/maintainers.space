<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })

const { profile, did, isAuthenticated, logout } = useAuth()
const colorMode = useColorMode()

const displayName = computed(() => profile.value?.displayName || profile.value?.handle || 'Account')

async function onSignOut() {
  await logout()
  await navigateTo('/')
}

const items = computed<DropdownMenuItem[][]>(() => [
  [{
    type: 'label',
    label: displayName.value,
    avatar: profile.value?.avatar ? { src: profile.value.avatar } : { icon: 'i-lucide-user' }
  }],
  [
    { label: 'Your profile', icon: 'i-lucide-user', to: '/settings' },
    { label: 'Linked accounts', icon: 'i-lucide-link', to: '/settings/accounts' }
  ],
  [{
    label: 'Appearance',
    icon: colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun',
    children: [
      { label: 'Light', icon: 'i-lucide-sun', onSelect: () => { colorMode.preference = 'light' } },
      { label: 'Dark', icon: 'i-lucide-moon', onSelect: () => { colorMode.preference = 'dark' } },
      { label: 'System', icon: 'i-lucide-monitor', onSelect: () => { colorMode.preference = 'system' } }
    ]
  }],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', color: 'error', onSelect: onSignOut }]
])
</script>

<template>
  <UDropdownMenu
    v-if="isAuthenticated"
    :items="items"
    :content="{ align: 'start', side: 'top' }"
    :ui="{ content: 'w-56' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :class="collapsed ? '' : 'justify-start'"
      :title="`@${profile?.handle ?? did}`"
    >
      <UAvatar
        :src="profile?.avatar"
        :alt="displayName"
        :icon="!profile?.avatar ? 'i-lucide-user' : undefined"
        size="2xs"
      />
      <span v-if="!collapsed" class="truncate text-sm font-medium">{{ displayName }}</span>
    </UButton>
  </UDropdownMenu>

  <UButton
    v-else
    to="/login"
    color="primary"
    block
    :square="collapsed"
    :icon="collapsed ? 'i-lucide-log-in' : undefined"
    :label="collapsed ? undefined : 'Sign in'"
  />
</template>
