import { verifyForgeAttestation, type AttestableAccount } from '~/lib/atproto/attestation'

/**
 * Reactive helper for gating the "Verified" badge on a cryptographic check.
 * Given an owner DID and their forge accounts, it verifies each attestation in
 * the background and exposes `isVerified(account)` for templates.
 */
export function useForgeAttestations() {
  const verified = ref<Set<string>>(new Set())

  function keyOf(ownerDid: string, a: AttestableAccount): string {
    return `${ownerDid}|${a.provider}|${a.username}`
  }

  function isVerified(ownerDid: string | null | undefined, a: AttestableAccount): boolean {
    return !!ownerDid && verified.value.has(keyOf(ownerDid, a))
  }

  async function check(ownerDid: string | null | undefined, accounts: AttestableAccount[]): Promise<void> {
    if (!ownerDid) {
      verified.value = new Set()
      return
    }
    const results = await Promise.all(
      accounts.map(async a => ({ key: keyOf(ownerDid, a), ok: await verifyForgeAttestation(a, ownerDid) }))
    )
    const next = new Set<string>()
    for (const r of results) if (r.ok) next.add(r.key)
    verified.value = next
  }

  return { isVerified, check }
}
