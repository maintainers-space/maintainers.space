<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { getForge } from '~/lib/forges'

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })

const { profile, did, isAuthenticated, logout } = useAuth()
const { accounts } = useForgeAccounts()
const colorMode = useColorMode()

const displayName = computed(() => profile.value?.displayName || profile.value?.handle || 'Account')
const profileHandle = computed(() => profile.value?.handle || did.value || '')

async function onSignOut() {
  await logout()
  await navigateTo('/')
}

function externalProfileUrl(provider: string, username: string, profileUrl?: string): string {
  if (profileUrl) return profileUrl
  switch (provider) {
    case 'github': return `https://github.com/${encodeURIComponent(username)}`
    case 'gitlab': return `https://gitlab.com/${encodeURIComponent(username)}`
    case 'codeberg': return `https://codeberg.org/${encodeURIComponent(username)}`
    case 'tangled': return `https://tangled.sh/@${encodeURIComponent(username)}`
    default: return '#'
  }
}

// External links to the viewer's profile on each connected provider, kept in a
// fixed order (GitHub, GitLab, Tangled, Codeberg, AT Protocol). These are the
// rare case where we intentionally leave the app for the provider's own site.
const providerLinks = computed<DropdownMenuItem[]>(() => {
  const list = accounts.value ?? []
  const find = (provider: string) => list.find(a => a.provider === provider)
  const out: DropdownMenuItem[] = []
  const pushForge = (provider: string, username?: string, profileUrl?: string) => {
    if (!username) return
    out.push({
      label: getForge(provider)?.label ?? provider,
      icon: getForge(provider)?.icon ?? 'i-lucide-git-fork',
      to: externalProfileUrl(provider, username, profileUrl),
      target: '_blank'
    })
  }
  const gh = find('github')
  pushForge('github', gh?.username, gh?.profileUrl)
  const gl = find('gitlab')
  pushForge('gitlab', gl?.username, gl?.profileUrl)
  if (profile.value?.handle) pushForge('tangled', profile.value.handle)
  const cb = find('codeberg')
  pushForge('codeberg', cb?.username, cb?.profileUrl)
  if (did.value) {
    out.push({
      label: 'AT Protocol',
      icon: 'i-simple-icons-bluesky',
      to: `https://bsky.app/profile/${did.value}`,
      target: '_blank'
    })
  }
  return out
})

const items = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = [
    [{
      type: 'label',
      label: displayName.value,
      avatar: profile.value?.avatar ? { src: profile.value.avatar } : { icon: 'i-lucide-user' }
    }],
    [
      { label: 'Profile', icon: 'i-lucide-user', to: profileHandle.value ? `/profile/${profileHandle.value}` : '/settings' },
      { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
    ]
  ]
  if (providerLinks.value.length) groups.push(providerLinks.value)
  groups.push([{
    label: 'Appearance',
    icon: colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun',
    children: [
      { label: 'Light', icon: 'i-lucide-sun', onSelect: () => { colorMode.preference = 'light' } },
      { label: 'Dark', icon: 'i-lucide-moon', onSelect: () => { colorMode.preference = 'dark' } },
      { label: 'System', icon: 'i-lucide-monitor', onSelect: () => { colorMode.preference = 'system' } }
    ]
  }])
  groups.push([{ label: 'Sign out', icon: 'i-lucide-log-out', color: 'error', onSelect: onSignOut }])
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
    :square="collapsed"
    :icon="collapsed ? 'i-lucide-log-in' : undefined"
    :label="collapsed ? undefined : 'Sign in'"
  />
</template>
