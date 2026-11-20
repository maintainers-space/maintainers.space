// The signed-in account behind a provider's token, cached per provider so pages share one request.
import type { ForgeProvider } from 'forges'

export interface Viewer {
  avatarUrl?: string
  login: string
  name?: string
  url?: string
}

const cache = new WeakMap<ForgeProvider, Promise<Viewer>>()

export function getViewer(provider: ForgeProvider): Promise<Viewer> {
  let hit = cache.get(provider)
  if (!hit) {
    hit = load(provider)
    cache.set(provider, hit)
    hit.catch(() => cache.delete(provider))
  }
  return hit
}

async function load(provider: ForgeProvider): Promise<Viewer> {
  const { avatarUrl, login, name, url } = await provider.users.me()
  return { avatarUrl, login, name, url }
}
