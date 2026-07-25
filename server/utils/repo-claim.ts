import { signRepoAttestation } from './attestation'

const GITLAB_MIN_ACCESS_LEVEL = 40

function bearer(token: string): string {
  return 'Bearer ' + token
}

/**
 * Server-side check that `token` grants admin over `owner/name` on `provider`.
 * Uses each forge's per-repo permission field, which is `true`/high for both
 * personal repos and org/group repos the user administers.
 */
export async function verifyRepoAdmin(
  provider: string,
  token: string,
  owner: string,
  name: string
): Promise<boolean> {
  try {
    if (provider === 'github') {
      const repo = await $fetch<{ permissions?: { admin?: boolean } }>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: bearer(token),
            'User-Agent': 'koinon'
          }
        }
      )
      return repo.permissions?.admin === true
    }
    if (provider === 'codeberg') {
      const repo = await $fetch<{ permissions?: { admin?: boolean } }>(
        `https://codeberg.org/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
        { headers: { Authorization: bearer(token) } }
      )
      return repo.permissions?.admin === true
    }
    if (provider === 'gitlab') {
      const id = encodeURIComponent(`${owner}/${name}`)
      const repo = await $fetch<{
        permissions?: {
          project_access?: { access_level?: number } | null
          group_access?: { access_level?: number } | null
        }
      }>(`https://gitlab.com/api/v4/projects/${id}`, {
        headers: { Authorization: bearer(token) }
      })
      const level = Math.max(
        repo.permissions?.project_access?.access_level ?? 0,
        repo.permissions?.group_access?.access_level ?? 0
      )
      return level >= GITLAB_MIN_ACCESS_LEVEL
    }
  } catch {
    return false
  }
  return false
}

/**
 * When an OAuth flow carried a repo claim, verify admin and append a signed
 * repo-ownership attestation (or a `claimError`) to the callback fragment.
 */
export async function applyRepoClaim(input: {
  fragment: URLSearchParams
  origin: string
  provider: string
  token: string
  did?: string
  claimOwner?: string
  claimName?: string
}): Promise<void> {
  const { fragment, origin, provider, token, did, claimOwner, claimName } = input
  if (!did || !claimOwner || !claimName) return

  try {
    const admin = await verifyRepoAdmin(provider, token, claimOwner, claimName)
    if (!admin) {
      fragment.set('claimError', 'not-admin')
      return
    }
    const signed = await signRepoAttestation({
      origin,
      did,
      provider,
      owner: claimOwner,
      name: claimName
    })
    if (signed) {
      fragment.set('repoAttestation', signed.attestation)
      fragment.set('repoAttestedBy', signed.attestedBy)
      fragment.set('claimOwner', claimOwner)
      fragment.set('claimName', claimName)
    } else {
      fragment.set('claimError', 'unconfigured')
    }
  } catch {
    fragment.set('claimError', 'failed')
  }
}
