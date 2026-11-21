// Which card a route gets. Mirrors the routes under `app/pages/` without importing them, since
// Nitro answers crawlers before any Vue code runs.
import { isForgeId } from '~/lib/forges/registry'

export type OgTarget =
  | { kind: 'repo'; provider: string; owner: string; repo: string }
  | { kind: 'owner'; provider: string; owner: string }
  | { kind: 'profile'; handle: string }
  | {
      kind: 'issue' | 'pull' | 'discussion'
      provider: string
      owner: string
      repo: string
      id: string
    }
  | { kind: 'page'; section: string }

const THREAD_SEGMENT = { discussions: 'discussion', issues: 'issue', pulls: 'pull' } as const

function decode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment)
  } catch {
    return undefined
  }
}

/** `/github/nuxt/nuxt/pulls/1` is a pull request card; deeper repo routes (blob, tree, actions) share the repo card. */
export function resolveOgTarget(path: string): OgTarget {
  const segments = path.split('/').filter(Boolean).map(decode)
  if (segments.some((s) => s === undefined)) return { kind: 'page', section: '' }
  const [first, owner, repo, sub, id] = segments as string[]

  if (first === 'profile' && owner) return { kind: 'profile', handle: owner }

  if (first && isForgeId(first) && owner) {
    if (!repo) return { kind: 'owner', provider: first, owner }
    const kind = sub ? THREAD_SEGMENT[sub as keyof typeof THREAD_SEGMENT] : undefined
    if (kind && id) return { kind, provider: first, owner, repo, id }
    return { kind: 'repo', provider: first, owner, repo }
  }

  return { kind: 'page', section: first ?? '' }
}

/** One image URL per card, so every file of a repo shares a single cached image. */
export function ogImagePath(target: OgTarget): string {
  const parts = ((): string[] => {
    switch (target.kind) {
      case 'repo':
        return [target.provider, target.owner, target.repo]
      case 'owner':
        return [target.provider, target.owner]
      case 'profile':
        return ['profile', target.handle]
      case 'issue':
      case 'pull':
      case 'discussion':
        return [target.provider, target.owner, target.repo, `${target.kind}s`, target.id]
      case 'page':
        return target.section ? [target.section] : ['index']
    }
  })()
  return `/_og/${parts.map(encodeURIComponent).join('/')}.png`
}
