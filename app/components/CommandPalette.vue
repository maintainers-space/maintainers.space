<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

const open = defineModel<boolean>('open', { default: false })

const router = useRouter()
const { isAuthenticated } = useAuth()
const { results, loading, run } = useSearch()

const term = ref('')

let debounce: ReturnType<typeof setTimeout> | undefined
watch(term, (v) => {
  clearTimeout(debounce)
  const q = v.trim()
  if (!q) return
  debounce = setTimeout(() => run(q, { limit: 6 }), 300)
})

watch(open, (v) => {
  if (!v) {
    term.value = ''
    clearTimeout(debounce)
  }
})

function go(to: string): void {
  open.value = false
  router.push(to)
}

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const q = term.value.trim()
  const out: CommandPaletteGroup<CommandPaletteItem>[] = []

  if (q) {
    out.push({
      id: 'go',
      ignoreFilter: true,
      items: [
        {
          label: `Search everywhere for “${q}”`,
          icon: 'i-lucide-search',
          onSelect: () => go(`/search?q=${encodeURIComponent(q)}`)
        }
      ]
    })
  }

  if (results.repos.length) {
    out.push({
      id: 'repos',
      label: 'Repositories',
      ignoreFilter: true,
      items: results.repos.slice(0, 6).map((r) => ({
        label: r.fullName,
        suffix: r.description ?? undefined,
        icon: 'i-lucide-book-marked',
        onSelect: () => go(repoPath(r))
      }))
    })
  }

  if (results.issues.length) {
    out.push({
      id: 'issues',
      label: 'Issues & pull requests',
      ignoreFilter: true,
      items: results.issues.slice(0, 6).map((it) => ({
        label: it.title,
        suffix: it.repo?.fullName,
        icon: it.isPull ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot',
        onSelect: () => go(issuePath(it))
      }))
    })
  }

  if (results.users.length) {
    out.push({
      id: 'users',
      label: 'People',
      ignoreFilter: true,
      items: results.users.slice(0, 5).map((u) => ({
        label: userLabel(u),
        suffix: `@${u.login}`,
        avatar: u.avatarUrl ? { src: u.avatarUrl } : undefined,
        icon: u.avatarUrl ? undefined : 'i-lucide-user',
        onSelect: () => go(userPath(u))
      }))
    })
  }

  if (!q) {
    out.push({
      id: 'nav',
      label: 'Go to',
      items: [
        { label: 'Home', icon: 'i-lucide-house', onSelect: () => go('/') },
        { label: 'Search', icon: 'i-lucide-search', kbds: ['/'], onSelect: () => go('/search') },
        { label: 'Explore', icon: 'i-lucide-compass', onSelect: () => go('/explore') },
        ...(isAuthenticated.value
          ? [
              {
                label: 'Notifications',
                icon: 'i-lucide-bell',
                onSelect: () => go('/notifications')
              },
              {
                label: 'Linked accounts',
                icon: 'i-lucide-link',
                onSelect: () => go('/settings/accounts')
              },
              { label: 'Settings', icon: 'i-lucide-settings', onSelect: () => go('/settings') }
            ]
          : [])
      ]
    })
  }

  return out
})

defineShortcuts({
  meta_k: () => {
    open.value = !open.value
  },
  ctrl_k: () => {
    open.value = !open.value
  }
})
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-2xl' }">
    <template #content>
      <UCommandPalette
        v-model:search-term="term"
        :groups="groups"
        :loading="loading"
        placeholder="Search repositories, code, issues and people…"
        :close="{ onClick: () => (open = false) }"
        class="h-[28rem]"
      >
        <template #empty>
          <div class="py-8 text-center text-sm text-muted">
            <UIcon name="i-lucide-search" class="mx-auto mb-2 size-6" />
            <p v-if="term.trim()">Press <UKbd value="enter" /> to search everywhere.</p>
            <p v-else>Type to search across every forge.</p>
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
