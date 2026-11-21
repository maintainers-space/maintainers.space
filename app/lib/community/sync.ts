// Creates a Community and brings it up to the suggested layout, through Colibri's AppView and as
// the signed-in account. Every step is a single XRPC call that adds one thing, so a sync that
// fails halfway leaves a working community, and running it again picks up where it stopped.
import {
  categoryCreate,
  categoryUpdate,
  channelCreate,
  channelUpdate,
  communityCreate,
  CHANNEL_TYPE,
  roleCreate,
  type CommunityData
} from './colibri'
import { communityUri } from './link'
import { diffCommunity, type CategoryKey, type CommunityOp, type CommunityPlan } from './structure'

/** Team role colours, in Colibri's hex form, handed out in turn. */
const ROLE_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#eab308']

export interface SyncProgress {
  done: number
  total: number
  /** What is being created right now, for the progress label. */
  label: string
}

export function describeOp(op: CommunityOp): string {
  switch (op.kind) {
    case 'createCategory':
      return `Category ${op.name}`
    case 'createChannel':
      return `#${op.channel.name}`
    case 'createRole':
      return `Role ${op.role.name}`
  }
}

/** Runs `ops` against the community `uri`, whose current state is `data`. */
export async function applyOps(
  uri: string,
  data: CommunityData,
  ops: readonly CommunityOp[],
  onProgress?: (progress: SyncProgress) => void
): Promise<void> {
  const categoryUris = new Map<CategoryKey, string>()
  const roleUris = new Map<string, string>()
  for (const role of data.roles) roleUris.set(role.name.toLowerCase(), role.uri)
  let colorIndex = data.roles.length

  for (const [index, op] of ops.entries()) {
    onProgress?.({ done: index, label: describeOp(op), total: ops.length })
    switch (op.kind) {
      case 'createRole': {
        const { uri: roleUri } = await roleCreate({
          color: ROLE_COLORS[colorIndex++ % ROLE_COLORS.length],
          community: uri,
          hoisted: false,
          mentionable: true,
          name: op.role.name,
          permissions: []
        })
        roleUris.set(op.role.name.toLowerCase(), roleUri)
        roleUris.set(op.role.team, roleUri)
        break
      }
      case 'createCategory': {
        const { uri: categoryUri } = await categoryCreate({ community: uri, name: op.name })
        categoryUris.set(op.category, categoryUri)
        break
      }
      case 'createChannel': {
        const category = op.categoryUri ?? categoryUris.get(op.category)
        if (!category) throw new Error(`No category for #${op.channel.name}`)
        const role = op.channel.team ? roleUris.get(op.channel.team) : undefined
        const { uri: channelUri } = await channelCreate({
          allowedRoles: role ? [role] : undefined,
          category,
          community: uri,
          description: op.channel.description || undefined,
          name: op.channel.name,
          type: op.channel.type
        })
        // Creating a channel can't make it owner-only, so that is a second call.
        if (op.channel.ownerOnly) await channelUpdate({ channel: channelUri, ownerOnly: true })
        break
      }
    }
  }
  onProgress?.({ done: ops.length, label: '', total: ops.length })
}

/** Adds whatever the plan has and the community lacks. Returns how many things were created. */
export async function syncCommunity(
  uri: string,
  data: CommunityData,
  plan: CommunityPlan,
  onProgress?: (progress: SyncProgress) => void
): Promise<number> {
  const ops = diffCommunity(plan, data)
  await applyOps(uri, data, ops, onProgress)
  return ops.length
}

export interface CreateCommunityInput {
  name: string
  description?: string
  requiresApprovalToJoin: boolean
  /** Bring your own PDS; leave out to have Colibri host the community. */
  ownPds?: { pds: string; identifier: string; password: string }
}

/**
 * Creates the community and renames Colibri's default "General" category to "Welcome". Returns the
 * new community's URI and its state, built from what creation returned, since the AppView may not
 * have indexed it yet.
 */
export async function createCommunity(
  input: CreateCommunityInput
): Promise<{ uri: string; data: CommunityData }> {
  const created = await communityCreate({
    description: input.description,
    name: input.name,
    requiresApprovalToJoin: input.requiresApprovalToJoin,
    ...input.ownPds
  })
  await categoryUpdate({ category: created.category, name: 'Welcome' })
  const uri = created.community || communityUri(created.did)
  return {
    data: {
      categories: [{ name: 'Welcome', uri: created.category }],
      channels: [
        {
          category: created.category,
          name: 'general',
          type: CHANNEL_TYPE.text,
          uri: created.channel
        }
      ],
      community: { name: input.name, uri },
      did: created.did,
      members: [],
      roles: [{ name: 'Owner', protected: true, uri: created.ownerRole }]
    },
    uri
  }
}
