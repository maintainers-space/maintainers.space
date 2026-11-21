import { describe, expect, it } from 'vitest'

import type { MessageView } from './colibri'
import {
  applyMessageEvent,
  applyReaction,
  forumThreads,
  groupMessages,
  mergeMessages
} from './messages'
import { parseMarkdown } from './richtext/markdown'
import { renderRichText, safeHref } from './richtext/render'

const CHANNEL = 'at://did:plc:c/social.colibri.channel/general'

function message(id: string, did: string, createdAt: string, extra: Partial<MessageView> = {}) {
  return {
    author: { did, handle: `${did.slice(8)}.test` },
    channel: CHANNEL,
    createdAt,
    text: id,
    uri: `at://${did}/social.colibri.message/${id}`,
    ...extra
  } satisfies MessageView
}

describe('live messages', () => {
  it('adds a message from a live event with its author looked up', () => {
    const list = [message('a', 'did:plc:ann', '2026-11-21T10:00:00Z')]

    const next = applyMessageEvent(
      list,
      {
        channel: CHANNEL,
        createdAt: '2026-11-21T10:01:00Z',
        event: 'upsert',
        text: 'hello',
        uri: 'at://did:plc:bob/social.colibri.message/b'
      },
      (did) => (did === 'did:plc:bob' ? { did, handle: 'bob.test' } : undefined)
    )

    expect(next.map((m) => [m.text, m.author.handle])).toEqual([
      ['a', 'ann.test'],
      ['hello', 'bob.test']
    ])
  })

  it('replaces an edited message in place and drops a deleted one', () => {
    const list = [
      message('a', 'did:plc:ann', '2026-11-21T10:00:00Z'),
      message('b', 'did:plc:ann', '2026-11-21T10:01:00Z')
    ]
    const edited = applyMessageEvent(
      list,
      { channel: CHANNEL, edited: true, event: 'upsert', text: 'fixed', uri: list[0]!.uri },
      () => undefined
    )
    const deleted = applyMessageEvent(
      edited,
      { channel: CHANNEL, event: 'delete', uri: list[1]!.uri },
      () => undefined
    )

    expect(deleted.map((m) => [m.text, m.edited, m.author.handle])).toEqual([
      ['fixed', true, 'ann.test']
    ])
  })

  it('keeps a page of older messages in order without duplicates', () => {
    const recent = [message('b', 'did:plc:ann', '2026-11-21T10:01:00Z')]
    const older = [message('a', 'did:plc:ann', '2026-11-21T10:00:00Z'), recent[0]!]

    expect(mergeMessages(recent, older).map((m) => m.text)).toEqual(['a', 'b'])
  })

  it('counts each person once per emoji, and removes empty reactions', () => {
    let list: MessageView[] = [message('a', 'did:plc:ann', '2026-11-21T10:00:00Z')]
    list = applyReaction(list, list[0]!.uri, '🎉', 'did:plc:bob', true)
    list = applyReaction(list, list[0]!.uri, '🎉', 'did:plc:bob', true)
    expect(list[0]!.reactions).toEqual([{ count: 1, emoji: '🎉', reactorDIDs: ['did:plc:bob'] }])

    list = applyReaction(list, list[0]!.uri, '🎉', 'did:plc:bob', false)
    expect(list[0]!.reactions).toEqual([])
  })
})

describe('grouping', () => {
  it('shows a header when the author, the day or a long pause changes', () => {
    const rows = groupMessages([
      message('1', 'did:plc:ann', '2026-11-20T23:58:00Z'),
      message('2', 'did:plc:ann', '2026-11-21T00:01:00Z'),
      message('3', 'did:plc:ann', '2026-11-21T00:03:00Z'),
      message('4', 'did:plc:bob', '2026-11-21T00:04:00Z'),
      message('5', 'did:plc:bob', '2026-11-21T00:30:00Z')
    ])

    expect(rows.map((r) => [r.message.text, r.head, r.day])).toEqual([
      ['1', true, '2026-11-20'],
      ['2', true, '2026-11-21'],
      ['3', false, undefined],
      ['4', true, undefined],
      ['5', true, undefined]
    ])
  })
})

describe('forum threads', () => {
  it('turns parentless messages into threads titled by their first line, newest activity first', () => {
    const first = message('q1', 'did:plc:ann', '2026-11-21T10:00:00Z', {
      text: 'Build fails on Node 26\nIt says ERR_X'
    })
    const second = message('q2', 'did:plc:bob', '2026-11-21T11:00:00Z', { text: 'Docs typo' })
    const reply = message('r1', 'did:plc:bob', '2026-11-21T12:00:00Z', { parent: first })

    const threads = forumThreads([first, second, reply])

    expect(threads.map((t) => [t.title, t.body, t.replies.length])).toEqual([
      ['Build fails on Node 26', 'It says ERR_X', 1],
      ['Docs typo', '', 0]
    ])
  })
})

describe('rich text', () => {
  it('renders what the composer stored, byte ranges and all', () => {
    const { text, facets } = parseMarkdown('héllo **wörld** and `code`')

    const blocks = renderRichText(text, facets)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.runs.map((r) => [r.text, !!r.bold, !!r.code])).toEqual([
      ['héllo ', false, false],
      ['wörld', true, false],
      [' and ', false, false],
      ['code', false, true]
    ])
  })

  it('puts a code block in its own block', () => {
    const { text, facets } = parseMarkdown('look:\n```ts\nconst a = 1\n```')

    const kinds = renderRichText(text, facets).map((b) => b.kind)

    expect(kinds).toContain('codeblock')
  })

  it('only follows web links', () => {
    expect(safeHref('https://nuxt.com')).toBe('https://nuxt.com/')
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
  })
})
