// Fast owner -> community lookup so a repo page can decide whether to show the
// Chat tab without a network round-trip to the AppView on every load.
//
// This is a disposable cache, not a source of truth: the durable fact "this
// community serves this owner" lives in the community's own
// space.maintainers.chat.repoBinding record (see register-binding.post.ts). If
// this index is ever lost, it's rebuildable by re-walking known community DIDs'
// repoBinding records — there's no proper indexer for that yet, so for now,
// losing this store just means re-running "Enable Chat" would be needed. Uses
// Nitro's built-in unstorage (filesystem driver in dev); a production
// deployment on serverless hosting needs a real KV/DB here instead.

export interface ChatCommunityBinding {
  communityDid: string
  communityUri: string
  provider: string
  host?: string
  owner: string
  createdAt: string
}

function storage() {
  return useStorage('chat-index')
}

function keyFor(provider: string, owner: string, host?: string): string {
  const parts = [provider.toLowerCase(), host?.toLowerCase() ?? '', owner.toLowerCase()]
  return parts.join(':')
}

export async function getCommunityBinding(
  provider: string,
  owner: string,
  host?: string
): Promise<ChatCommunityBinding | null> {
  const value = await storage().getItem<ChatCommunityBinding>(keyFor(provider, owner, host))
  return value ?? null
}

export async function setCommunityBinding(binding: ChatCommunityBinding): Promise<void> {
  await storage().setItem(keyFor(binding.provider, binding.owner, binding.host), binding)
}
