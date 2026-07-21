// A tiny in-memory registry of forge access tokens, shared by every forge
// provider. This lets API calls be transparently authenticated (higher rate
// limits, private data, GitHub code search) without threading a token through
// every single call site. It is populated from `useForgeTokens`, which persists
// tokens in the user's localStorage and never sends them anywhere but the forge.

let registry: Record<string, string | undefined> = {}

/** Replace the whole registry (called whenever the stored tokens change). */
export function syncForgeTokens(map: Record<string, string>): void {
  registry = { ...map }
}

/** The token for a provider, if the user has stored one. */
export function getForgeToken(id: string): string | undefined {
  return registry[id]
}
