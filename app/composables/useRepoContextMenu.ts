import type { ContextMenuItem } from '@nuxt/ui'
import { getForge, repoRefOf } from '~/lib/forges/registry'
import type { RepoCard } from '~/lib/forges/view'

async function copy(
  text: string,
  toast: ReturnType<typeof useToast>,
  label: string
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: label, icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not copy to clipboard', icon: 'i-lucide-x', color: 'error' })
  }
}

/** npmx-style context menu for a repository row/card. */
export function useRepoContextMenu(repo: MaybeRefOrGetter<RepoCard>) {
  const toast = useToast()
  const { providerFor } = useForges()

  const items = computed<ContextMenuItem[][]>(() => {
    const r = toValue(repo)
    const base = repoPath(r)
    const descriptor = getForge(r.provider)
    const ref = repoRefOf(r.provider, r.owner, r.name)
    const forge = ref ? providerFor(ref) : undefined

    const nav: ContextMenuItem[] = [
      { label: 'Open repository', icon: 'i-lucide-book-marked', to: base },
      { label: 'View commits', icon: 'i-lucide-history', to: `${base}/commits` }
    ]
    if (forge?.can('threads.list', 'issue'))
      nav.push({ label: 'Issues', icon: 'i-lucide-circle-dot', to: `${base}/issues` })
    if (forge?.can('threads.list', 'pull_request'))
      nav.push({
        label: pullsTerm(r.provider, { plural: true, capitalize: true }),
        icon: 'i-lucide-git-pull-request',
        to: `${base}/pulls`
      })
    if (forge?.can('ci.runs'))
      nav.push({ label: 'Actions', icon: 'i-lucide-play', to: `${base}/actions` })

    const clip: ContextMenuItem[] = [
      {
        label: 'Copy full name',
        icon: 'i-lucide-copy',
        onSelect: () => copy(r.fullName, toast, 'Copied name')
      },
      { label: 'Copy URL', icon: 'i-lucide-link', onSelect: () => copy(r.url, toast, 'Copied URL') }
    ]

    const discover: ContextMenuItem[] = [
      {
        label: `More from ${r.owner}`,
        icon: 'i-lucide-user-search',
        to: `/search?q=${encodeURIComponent(`owner:${r.owner}`)}`
      }
    ]

    const external: ContextMenuItem[] = [
      {
        label: `Open on ${descriptor?.label ?? r.provider}`,
        icon: 'i-lucide-external-link',
        to: r.url,
        target: '_blank'
      }
    ]

    return [nav, clip, discover, external]
  })

  return { items }
}
