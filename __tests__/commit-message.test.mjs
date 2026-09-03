import { describe, expect, it } from 'vitest'

import { isConventionalCommit } from '../scripts/check-commit-message.mjs'

describe('isConventionalCommit', () => {
  it('accepts conventional messages and breaking changes', () => {
    expect(isConventionalCommit('feat(ui): add repository filters')).toBe(true)
    expect(isConventionalCommit('fix!: remove unsafe fallback')).toBe(true)
  })

  it('rejects vague and non-semantic messages', () => {
    expect(isConventionalCommit('Update things')).toBe(false)
    expect(isConventionalCommit('feat: Add repository filters')).toBe(false)
  })
})
