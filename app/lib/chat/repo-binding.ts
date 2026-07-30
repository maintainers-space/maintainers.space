// Writes the one maintainers.space-owned record on a freshly-minted community
// repo: space.maintainers.chat.repoBinding, linking the community back to the
// forge owner it serves (see lexicons/space/maintainers/chat/repoBinding.json).
//
// This runs once, right after mint-account.post.ts hands back a brand-new
// community account's one-time password — a plain password-based PDS session
// (com.atproto.server.createSession), not the human's own OAuth agent, since
// this is a *different* repo (the community's, not the caller's). The password
// is single-use: it's about to be superseded once social.colibri.community.create
// adopts the account and the AppView takes over long-term credential custody.
const REPO_BINDING_COLLECTION = 'space.maintainers.chat.repoBinding'

export interface OwnerRef {
  provider: string
  host?: string
  owner: string
}

export async function writeRepoBinding(
  pds: string,
  identifier: string,
  password: string,
  boundOwners: OwnerRef[]
): Promise<void> {
  const sessionRes = await fetch(new URL('/xrpc/com.atproto.server.createSession', pds), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  })
  if (!sessionRes.ok) {
    throw new Error(`Could not sign in to the new community account: ${await sessionRes.text()}`)
  }
  const session = (await sessionRes.json()) as { did: string; accessJwt: string }

  const record = {
    $type: REPO_BINDING_COLLECTION,
    boundOwners,
    createdAt: new Date().toISOString()
  }

  const writeRes = await fetch(new URL('/xrpc/com.atproto.repo.putRecord', pds), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.accessJwt}`
    },
    body: JSON.stringify({
      repo: session.did,
      collection: REPO_BINDING_COLLECTION,
      rkey: 'self',
      validate: false,
      record
    })
  })
  if (!writeRes.ok) {
    throw new Error(`Could not write repoBinding record: ${await writeRes.text()}`)
  }
}
