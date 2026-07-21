import type { ContextMenuItem } from '@nuxt/ui'
import { getForge } from '~/lib/forges'
import type { ForgeRepo } from '~/types/forge'

async function copy(text: string, toast: ReturnType<typeof useToast>, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: label, icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not copy to clipboard', icon: 'i-lucide-x', color: 'error' })
  }
}

/** npmx-style context menu for a repository row/card. */
export function useRepoContextMenu(repo: MaybeRefOrGetter<ForgeRepo>) {
  const toast = useToast()

  const items = computed<ContextMenuItem[][]>(() => {
    const r = toValue(repo)
    const base = repoPath(r)
    const forge = getForge(r.provider)
    const caps = forge?.capabilities

    const nav: ContextMenuItem[] = [
      { label: 'Open repository', icon: 'i-lucide-book-marked', to: base },
      { label: 'View commits', icon: 'i-lucide-history', to: `${base}/commits` }
    ]
    if (caps?.issues) nav.push({ label: 'Issues', icon: 'i-lucide-circle-dot', to: `${base}/issues` })
    if (caps?.pulls) nav.push({ label: 'Pull requests', icon: 'i-lucide-git-pull-request', to: `${base}/pulls` })
    if (caps?.actions) nav.push({ label: 'Actions', icon: 'i-lucide-play', to: `${base}/actions` })

    const clip: ContextMenuItem[] = [
      { label: 'Copy full name', icon: 'i-lucide-copy', onSelect: () => copy(r.fullName, toast, 'Copied name') },
      { label: 'Copy URL', icon: 'i-lucide-link', onSelect: () => copy(r.url, toast, 'Copied URL') }
    ]

    const discover: ContextMenuItem[] = [
      { label: `More from ${r.owner}`, icon: 'i-lucide-user-search', to: `/search?q=${encodeURIComponent(`owner:${r.owner}`)}` }
    ]
    if (r.language) {
      discover.push({ label: `Explore ${r.language}`, icon: 'i-lucide-code', to: `/explore?lang=${encodeURIComponent(r.language)}` })
    }

    const external: ContextMenuItem[] = [
      { label: `Open on ${forge?.label ?? r.provider}`, icon: 'i-lucide-external-link', to: r.url, target: '_blank' }
    ]

    return [nav, clip, discover, external]
  })

  return { items }
}
