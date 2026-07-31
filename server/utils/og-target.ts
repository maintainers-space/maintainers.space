// Maps an app route path to what its OG image (and, later, its social-preview
// meta tags) should show — mirrors the route taxonomy under `app/pages/`
// without importing it (that tree is Vue/Nuxt pages, this is plain routing
// logic Nitro can evaluate for a crawler request before Nuxt is involved).
import { isForgeId } from '~/lib/forges'

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
  | { kind: 'page'; path: string }

const SUBROUTE_KIND: Record<string, 'issue' | 'pull' | 'discussion'> = {
  issues: 'issue',
  pulls: 'pull',
  discussions: 'discussion'
}

/** e.g. `/github/nuxt/nuxt/issues/123` -> `{ kind: 'issue', provider: 'github', owner: 'nuxt', repo: 'nuxt', id: '123' }` */
export function resolveOgTarget(path: string): OgTarget {
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s))

  if (segments[0] === 'profile' && segments[1]) {
    return { kind: 'profile', handle: segments[1] }
  }

  const [provider, owner, repo, sub, id] = segments
  if (provider && isForgeId(provider) && owner) {
    if (!repo) return { kind: 'owner', provider, owner }
    const subKind = sub ? SUBROUTE_KIND[sub] : undefined
    if (subKind && id) return { kind: subKind, provider, owner, repo, id }
    // Any deeper sub-route (blob/, tree/, commits, actions, ...) still belongs
    // to the repo itself for preview purposes.
    return { kind: 'repo', provider, owner, repo }
  }

  return { kind: 'page', path }
}
