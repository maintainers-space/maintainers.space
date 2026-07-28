<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import AppearanceModal from '~/components/AppearanceModal.vue'

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })

const { profile, did, isAuthenticated, logout } = useAuth()
const overlay = useOverlay()
const appearanceModal = overlay.create(AppearanceModal)

const displayName = computed(() => profile.value?.displayName || profile.value?.handle || 'Account')
const profileHandle = computed(() => profile.value?.handle || did.value || '')

async function onSignOut() {
  await logout()
  await navigateTo('/')
}

const items = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = [
    [
      {
        type: 'label',
        label: displayName.value,
        avatar: profile.value?.avatar ? { src: profile.value.avatar } : { icon: 'i-lucide-user' }
      }
    ],
    [
      {
        label: 'Profile',
        icon: 'i-lucide-user',
        to: profileHandle.value ? `/profile/${profileHandle.value}` : '/settings'
      },
      { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
    ]
  ]
  groups.push([
    {
      label: 'Appearance',
      icon: 'i-lucide-palette',
      onSelect: () => {
        appearanceModal.open()
      }
    }
  ])
  groups.push([
    { label: 'Sign out', icon: 'i-lucide-log-out', color: 'error', onSelect: onSignOut }
  ])
  return groups
})
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
    class="py-2.5"
    :square="collapsed"
    :icon="collapsed ? 'i-lucide-log-in' : undefined"
    :label="collapsed ? undefined : 'Sign in'"
  />
</template>
