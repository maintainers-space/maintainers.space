import { beforeEach, describe, expect, it } from 'vitest'
import { useAuth } from './useAuth'
import { useForgeAccounts } from './useForgeAccounts'
import { useForgeTokens } from './useForgeTokens'

beforeEach(() => {
  localStorage.clear()
})

describe('logout', () => {
  it('forgets the forge tokens so the next account on this device cannot use them', async () => {
    useForgeTokens().set('github', 'gho_previous_account')
    useForgeTokens().set('gitlab', 'glpat_previous_account', 'acme/widgets')

    await useAuth().logout()

    const { get, tokens } = useForgeTokens()
    expect(get('github')).toBeUndefined()
    expect(get('gitlab', 'acme/widgets')).toBeUndefined()
    expect(tokens.value).toEqual({})
    expect(localStorage.length).toBe(0)
  })

  it('drops the linked accounts so they are loaded again for the next account', async () => {
    const forgeAccounts = useForgeAccounts()
    forgeAccounts.accounts.value = [
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        provider: 'github',
        rkey: 'github_previous',
        uri: 'at://did:plc:previous/space.maintainers.forgeAccount/github_previous',
        username: 'previous'
      }
    ]
    forgeAccounts.loaded.value = true

    await useAuth().logout()

    expect(forgeAccounts.accounts.value).toEqual([])
    expect(forgeAccounts.loaded.value).toBe(false)
  })
})
