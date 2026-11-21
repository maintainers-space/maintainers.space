// What a Community member writes. On Colibri, messages, reactions and memberships are ordinary
// records in each person's own repo; the AppView picks them up from the network and tells
// everyone else. So all of these go to the viewer's PDS, never to the AppView.
import { ok } from '@atcute/client'
import type {} from '@atcute/atproto'
import type { Did, Nsid } from '@atcute/lexicons'
import type { BlobRef } from './colibri'
import type { ColibriRichTextFacet } from './richtext/facets'

export const MESSAGE = 'social.colibri.message'
export const REACTION = 'social.colibri.reaction'
export const MEMBERSHIP = 'social.colibri.membership'

export interface MessageRecord {
  text: string
  facets: ColibriRichTextFacet[]
  channel: string
  createdAt: string
  edited?: boolean
  /** The AT-URI of the message this one replies to; in a forum, the thread's first message. */
  parent?: string
  attachments?: Array<{ blob: BlobRef; name?: string }>
}

function viewer(): { did: Did; runAuthed: ReturnType<typeof useAuth>['runAuthed'] } {
  const { did, runAuthed } = useAuth()
  if (!did.value) throw new Error('Sign in to take part in this Community.')
  return { did: did.value as Did, runAuthed }
}

export function rkeyOf(uri: string): string {
  return uri.split('/').pop() ?? ''
}

export function authorOf(uri: string): string {
  return /^at:\/\/([^/]+)\//.exec(uri)?.[1] ?? ''
}

async function createRecord(collection: string, record: object): Promise<string> {
  const { did, runAuthed } = viewer()
  const out = await runAuthed((rpc) =>
    ok(
      rpc.post('com.atproto.repo.createRecord', {
        input: {
          collection: collection as Nsid,
          record: { $type: collection, ...record } as Record<string, unknown>,
          repo: did
        }
      })
    )
  )
  return out.uri
}

async function deleteRecord(collection: string, rkey: string): Promise<void> {
  const { did, runAuthed } = viewer()
  await runAuthed((rpc) =>
    rpc.post('com.atproto.repo.deleteRecord', {
      as: null,
      input: { collection: collection as Nsid, repo: did, rkey }
    })
  )
}

/** Every record of `collection` in the viewer's repo that `match` accepts. */
async function findOwnRecords<T>(
  collection: string,
  match: (value: T) => boolean
): Promise<string[]> {
  const { did, runAuthed } = viewer()
  const rkeys: string[] = []
  let cursor: string | undefined
  do {
    const page = await runAuthed((rpc) =>
      ok(
        rpc.get('com.atproto.repo.listRecords', {
          params: { collection: collection as Nsid, cursor, limit: 100, repo: did }
        })
      )
    )
    for (const record of page.records) {
      if (match(record.value as T)) rkeys.push(rkeyOf(record.uri))
    }
    cursor = page.cursor
  } while (cursor)
  return rkeys
}

export function sendMessage(record: Omit<MessageRecord, 'createdAt'>): Promise<string> {
  return createRecord(MESSAGE, { ...record, createdAt: new Date().toISOString() })
}

/** Replaces a message's text, keeping everything else as it was. */
export async function editMessage(
  uri: string,
  original: MessageRecord,
  text: string,
  facets: ColibriRichTextFacet[]
): Promise<void> {
  const { did, runAuthed } = viewer()
  await runAuthed((rpc) =>
    ok(
      rpc.post('com.atproto.repo.putRecord', {
        input: {
          collection: MESSAGE as Nsid,
          record: { $type: MESSAGE, ...original, edited: true, facets, text } as Record<
            string,
            unknown
          >,
          repo: did,
          rkey: rkeyOf(uri)
        }
      })
    )
  )
}

export function deleteMessage(uri: string): Promise<void> {
  return deleteRecord(MESSAGE, rkeyOf(uri))
}

export function addReaction(message: string, emoji: string): Promise<string> {
  return createRecord(REACTION, { emoji, parent: message })
}

export async function removeReaction(message: string, emoji: string): Promise<void> {
  const rkeys = await findOwnRecords<{ emoji?: string; parent?: string }>(
    REACTION,
    (r) => r.parent === message && r.emoji === emoji
  )
  for (const rkey of rkeys) await deleteRecord(REACTION, rkey)
}

/** Asks to join. Open communities admit right away; others wait for an admin's approval. */
export function joinCommunity(community: string): Promise<string> {
  return createRecord(MEMBERSHIP, { community, createdAt: new Date().toISOString() })
}

/** Whether the viewer has asked to join, admitted or not. */
export async function hasMembershipRecord(community: string): Promise<boolean> {
  const rkeys = await findOwnRecords<{ community?: string }>(
    MEMBERSHIP,
    (r) => r.community === community
  )
  return rkeys.length > 0
}

/** Removes the viewer's own membership records, which is what leaving means on the network. */
export async function deleteMemberships(community: string): Promise<void> {
  const rkeys = await findOwnRecords<{ community?: string }>(
    MEMBERSHIP,
    (r) => r.community === community
  )
  for (const rkey of rkeys) await deleteRecord(MEMBERSHIP, rkey)
}

/** Uploads a file to the viewer's PDS, for attaching to a message. */
export async function uploadBlob(file: File): Promise<BlobRef> {
  const { agent } = useAuth()
  const oauth = agent.value
  if (!oauth) throw new Error('Sign in to attach files.')
  const res = await oauth.handle('/xrpc/com.atproto.repo.uploadBlob', {
    body: file,
    headers: { 'content-type': file.type || 'application/octet-stream' },
    method: 'POST'
  })
  if (!res.ok) throw new Error(`Could not upload ${file.name} (${res.status}).`)
  const { blob } = (await res.json()) as { blob: BlobRef }
  return blob
}
