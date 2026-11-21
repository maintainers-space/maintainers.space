import type { Notification } from 'forges'
import { describe, expect, it } from 'vitest'
import { botKindOf, toInboxItem } from './inbox'

const origin = { forge: 'github', instance: 'github.com' } as const
const repo = { ...origin, name: 'site', owner: 'acme' }

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    raw: null,
    reason: 'comment',
    ref: { ...origin, id: '1' },
    subject: { thread: { ...origin, kind: 'pull_request', number: '7', repo }, type: 'thread' },
    subjectState: 'open',
    title: 'Fix it',
    unread: true,
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides
  }
}

describe('botKindOf', () => {
  it('recognises dependency bots by login', () => {
    expect(botKindOf('dependabot[bot]')).toBe('dependabot')
    expect(botKindOf('app/renovate')).toBe('renovate')
    expect(botKindOf('octo')).toBeUndefined()
  })
})

describe('toInboxItem', () => {
  it('routes a pull request notification to its in-app page', () => {
    const item = toInboxItem(notification())
    expect(item).toMatchObject({
      kind: 'pull',
      number: '7',
      provider: 'github',
      repo: { fullName: 'acme/site' },
      to: '/github/acme/site/pulls/7',
      unread: true
    })
  })

  it('lets a mention outrank the subject kind and marks closed work resolved', () => {
    const item = toInboxItem(notification({ reason: 'mention', subjectState: 'closed' }))
    expect(item.kind).toBe('mention')
    expect(item.resolved).toBe(true)
  })

  it('treats CI activity as its own kind', () => {
    expect(toInboxItem(notification({ reason: 'ci_activity' })).kind).toBe('ci')
  })
})
