import { ok } from '@atcute/client'
import type {} from '@atcute/atproto'
import type { Did, Nsid } from '@atcute/lexicons'

export const FORGE_ACCOUNT_COLLECTION = 'dev.koinon.forgeAccount'
const COLLECTION = FORGE_ACCOUNT_COLLECTION as Nsid

export interface ForgeAccountRecord {
  $type?: string
  provider: string
  username: string
  host?: string
  displayName?: string
  avatarUrl?: string
  profileUrl?: string
  verified?: boolean
  createdAt: string
}

export interface ForgeAccount extends ForgeAccountRecord {
  uri: string
  rkey: string
}

function sanitize(part: string): string {
  return part.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/(^-+)|(-+$)/g, '').slice(0, 200)
}

/** Deterministic record key so linking the same account is idempotent. */
export function makeRkey(provider: string, username: string, host?: string): string {
  const key = [sanitize(provider), host ? sanitize(host) : '', sanitize(username)].filter(Boolean).join('_')
  return key || 'account'
}

function rkeyFromUri(uri: string): string {
  return uri.split('/').pop() ?? ''
}

const _accounts = ref<ForgeAccount[]>([])
const _pending = ref(false)
const _loaded = ref(false)

export function useForgeAccounts() {
  const { runAuthed, did } = useAuth()

  async function refresh(): Promise<void> {
    if (!did.value) {
      _accounts.value = []
      _loaded.value = true
      return
    }
    _pending.value = true
    try {
      const data = await runAuthed(rpc => ok(rpc.get('com.atproto.repo.listRecords', {
        params: { repo: did.value as Did, collection: COLLECTION, limit: 100 }
      })))
      const records = (data.records ?? []) as unknown as Array<{ uri: string, value: ForgeAccountRecord }>
      _accounts.value = records
        .map(r => ({ uri: r.uri, rkey: rkeyFromUri(r.uri), ...r.value }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    } finally {
      _pending.value = false
      _loaded.value = true
    }
  }

  async function link(
    input: Omit<ForgeAccountRecord, '$type' | 'createdAt'> & { createdAt?: string }
  ): Promise<void> {
    if (!did.value) throw new Error('Not authenticated')
    const record: ForgeAccountRecord = {
      $type: FORGE_ACCOUNT_COLLECTION,
      provider: input.provider,
      username: input.username,
      host: input.host,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      profileUrl: input.profileUrl,
      verified: input.verified ?? false,
      createdAt: input.createdAt ?? new Date().toISOString()
    }
    for (const k of Object.keys(record) as Array<keyof ForgeAccountRecord>) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      if (record[k] === undefined) delete record[k]
    }
    await runAuthed(rpc => ok(rpc.post('com.atproto.repo.putRecord', {
      input: {
        repo: did.value as Did,
        collection: COLLECTION,
        rkey: makeRkey(input.provider, input.username, input.host),
        record: record as unknown as Record<string, unknown>
      }
    })))
    await refresh()
  }

  async function unlink(rkey: string): Promise<void> {
    if (!did.value) throw new Error('Not authenticated')
    await runAuthed(rpc => rpc.post('com.atproto.repo.deleteRecord', {
      input: { repo: did.value as Did, collection: COLLECTION, rkey },
      as: null
    }))
    await refresh()
  }

  return {
    accounts: _accounts,
    pending: _pending,
    loaded: _loaded,
    refresh,
    link,
    unlink
  }
}
