// A channel's messages as the UI holds them: oldest first, updated by live events, grouped the way
// chat apps show them, and, in forum channels, split into threads. Pure, so it can be tested.
import type { ActorView, MessageView, ReactionView } from './colibri'
import { authorOf } from './records'
import type { MessageEventData, ReactionEventData } from './socket'

/** Consecutive messages by the same person within this window share one header. */
const GROUP_WINDOW_MS = 7 * 60_000

function byTime(a: MessageView, b: MessageView): number {
  return a.createdAt.localeCompare(b.createdAt) || a.uri.localeCompare(b.uri)
}

/** Adds or replaces messages, keeping the list oldest first and free of duplicates. */
export function mergeMessages(list: readonly MessageView[], incoming: readonly MessageView[]) {
  const byUri = new Map(list.map((m) => [m.uri, m]))
  for (const message of incoming) byUri.set(message.uri, { ...byUri.get(message.uri), ...message })
  return [...byUri.values()].toSorted(byTime)
}

/**
 * Applies a live message event. The event carries no author or parent view, so they are filled in
 * from what is already known: the author from `actors`, the parent from the list itself.
 */
export function applyMessageEvent(
  list: readonly MessageView[],
  event: MessageEventData,
  actors: (did: string) => ActorView | undefined
): MessageView[] {
  if (event.event === 'delete') return list.filter((m) => m.uri !== event.uri)
  const existing = list.find((m) => m.uri === event.uri)
  const did = authorOf(event.uri)
  const parent = event.parent ? list.find((m) => m.uri === event.parent) : undefined
  const message: MessageView = {
    attachments: event.attachments ?? existing?.attachments,
    author: existing?.author ?? actors(did) ?? { did },
    channel: event.channel,
    createdAt: event.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
    edited: event.edited ?? existing?.edited,
    facets: event.facets ?? existing?.facets,
    parent:
      parent ??
      existing?.parent ??
      (event.parent ? placeholder(event.parent, event.channel) : undefined),
    reactions: existing?.reactions ?? [],
    text: event.text ?? existing?.text ?? '',
    uri: event.uri
  }
  return mergeMessages(list, [message])
}

/** A parent we haven't loaded, known only by its URI. */
function placeholder(uri: string, channel: string): MessageView {
  return { author: { did: authorOf(uri) }, channel, createdAt: '', text: '', uri }
}

/** Adds or removes one person's reaction on a message. */
export function applyReaction(
  list: readonly MessageView[],
  target: string,
  emoji: string,
  did: string,
  added: boolean
): MessageView[] {
  return list.map((m) => {
    if (m.uri !== target) return m
    const reactions: ReactionView[] = (m.reactions ?? []).map((r) => ({ ...r }))
    let reaction = reactions.find((r) => r.emoji === emoji)
    if (added) {
      if (!reaction) reactions.push((reaction = { count: 0, emoji, reactorDIDs: [] }))
      if (reaction.reactorDIDs?.includes(did)) return m
      reaction.reactorDIDs = [...(reaction.reactorDIDs ?? []), did]
      reaction.count++
    } else {
      if (!reaction?.reactorDIDs?.includes(did)) return m
      reaction.reactorDIDs = reaction.reactorDIDs.filter((d) => d !== did)
      reaction.count--
    }
    return { ...m, reactions: reactions.filter((r) => r.count > 0) }
  })
}

export function applyReactionEvent(list: readonly MessageView[], event: ReactionEventData) {
  return applyReaction(
    list,
    event.target,
    event.emoji,
    authorOf(event.uri),
    event.event === 'added'
  )
}

export interface MessageRow {
  message: MessageView
  /** First of a run by one author: shows avatar, name and time. */
  head: boolean
  /** A new calendar day starts here. */
  day?: string
}

function dayOf(iso: string): string {
  return iso.slice(0, 10)
}

/** Rows for a message list: day dividers, and headers only where the author or time changes. */
export function groupMessages(list: readonly MessageView[]): MessageRow[] {
  let previous: MessageView | undefined
  return list.map((message) => {
    const newDay = !previous || dayOf(previous.createdAt) !== dayOf(message.createdAt)
    const head =
      newDay ||
      !!message.parent ||
      previous!.author.did !== message.author.did ||
      Date.parse(message.createdAt) - Date.parse(previous!.createdAt) > GROUP_WINDOW_MS
    previous = message
    return { day: newDay ? dayOf(message.createdAt) : undefined, head, message }
  })
}

export interface ForumThread {
  starter: MessageView
  title: string
  body: string
  replies: MessageView[]
  lastActivity: string
}

/**
 * A forum channel's threads. Colibri has no threads of its own yet, so a thread is a message
 * without a parent, its first line is the title, and every reply points at it as its parent.
 * In Colibri's app the same messages read as a post and replies to it.
 */
export function forumThreads(list: readonly MessageView[]): ForumThread[] {
  const replies = new Map<string, MessageView[]>()
  for (const m of list) {
    if (!m.parent) continue
    const all = replies.get(m.parent.uri) ?? []
    all.push(m)
    replies.set(m.parent.uri, all)
  }
  return list
    .filter((m) => !m.parent)
    .map((starter) => {
      const own = replies.get(starter.uri) ?? []
      const [title = '', ...rest] = starter.text.split('\n')
      return {
        body: rest.join('\n').trim(),
        lastActivity: own.at(-1)?.createdAt ?? starter.createdAt,
        replies: own,
        starter,
        title: title.trim() || 'Untitled'
      }
    })
    .toSorted((a, b) => b.lastActivity.localeCompare(a.lastActivity))
}

/** How a person is called in a community: nickname, display name, handle or DID. */
export function displayName(actor: ActorView & { nickname?: string }): string {
  return actor.nickname || actor.data?.displayName || actor.handle || actor.did
}
