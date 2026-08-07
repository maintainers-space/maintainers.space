// Fast owner -> community lookup so a repo page can decide whether to show the
// Chat tab without a network round-trip to the AppView on every load.
//
// For communities maintainers.space created itself this is a disposable cache
// rather than a source of truth: the durable fact "this community serves this
// owner" also lives in the community's own space.maintainers.chat.repoBinding
// record (see register-binding.post.ts), so those entries are in principle
// rebuildable by re-walking known community DIDs' repoBinding records. There's
// no indexer for that yet.
//
// For communities linked via useChatCommunity.ts's linkCommunity(), this store
// is the ONLY record of the binding. That record has to live on the community's
// repo, and for a community we didn't create we hold no credentials for it. Its
// own AppView does, so there is nothing to write and nothing to rebuild from.
// Losing this store means every owner has to link, or re-run "Enable Chat",
// again.
//
// Uses Nitro's built-in unstorage (filesystem driver in dev). A production
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
