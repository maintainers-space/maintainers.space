import { beforeEach, describe, expect, it } from 'vitest'

import { consumeReturnPath, rememberReturnPath, safeReturnPath } from './return-path'

beforeEach(() => {
  sessionStorage.clear()
})

describe('return path after sign-in', () => {
  it('brings you back to the page that sent you to sign in, once', () => {
    rememberReturnPath('/notifications?tab=mentions')

    expect(consumeReturnPath()).toBe('/notifications?tab=mentions')
    expect(consumeReturnPath()).toBeUndefined()
  })

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'notifications', 42])(
    'never leaves the site for %s',
    (value) => {
      expect(safeReturnPath(value)).toBeUndefined()
      rememberReturnPath(value)
      expect(consumeReturnPath()).toBeUndefined()
    }
  )

  it('forgets an old path when a new sign-in has none', () => {
    rememberReturnPath('/timeline')
    rememberReturnPath(undefined)

    expect(consumeReturnPath()).toBeUndefined()
  })
})
