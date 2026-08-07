import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn() as ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> }
fetchMock.raw = vi.fn()
vi.stubGlobal('$fetch', fetchMock)

const githubOk = (state: string, role: string) => ({
  _data: { state, role },
  headers: new Headers({ 'x-oauth-scopes': 'read:user, read:org' })
})

const { verifyOwnerAdmin } = await import('./chat-org-admin')

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.raw.mockReset()
})

describe('verifyOwnerAdmin', () => {
  it('reports unsupported for a forge with no implemented permission endpoint', async () => {
    for (const p of ['codeberg', 'gitea', 'tangled']) {
      await expect(verifyOwnerAdmin(p, 'someorg', 'tok')).resolves.toEqual({
        result: 'unsupported'
      })
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(fetchMock.raw).not.toHaveBeenCalled()
  })

  it('reports unsupported for a self-hosted host rather than querying the canonical one', async () => {
    await expect(verifyOwnerAdmin('gitlab', 'someorg', 'tok', 'git.example.com')).resolves.toEqual({
      result: 'unsupported'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts the canonical host being passed explicitly', async () => {
    fetchMock.raw.mockResolvedValue(githubOk('active', 'admin'))
    await expect(verifyOwnerAdmin('github', 'someorg', 'tok', 'github.com')).resolves.toEqual({
      result: 'admin'
    })
  })

  it('requires an active admin membership on github', async () => {
    fetchMock.raw.mockResolvedValue(githubOk('active', 'admin'))
    await expect(verifyOwnerAdmin('github', 'someorg', 'tok')).resolves.toEqual({
      result: 'admin'
    })

    fetchMock.raw.mockResolvedValue(githubOk('active', 'member'))
    expect((await verifyOwnerAdmin('github', 'someorg', 'tok')).result).toBe('denied')

    fetchMock.raw.mockResolvedValue(githubOk('pending', 'admin'))
    expect((await verifyOwnerAdmin('github', 'someorg', 'tok')).result).toBe('denied')
  })

  it('names an OAuth App restriction rather than calling it not-admin', async () => {
    fetchMock.raw.mockRejectedValue({
      status: 403,
      data: {
        message:
          'Although you appear to have the correct authorization credentials, the `someorg` organization has enabled OAuth App access restrictions'
      },
      response: { status: 403, headers: new Headers() }
    })
    await expect(verifyOwnerAdmin('github', 'someorg', 'tok')).resolves.toMatchObject({
      result: 'denied',
      reason: 'oauth-app-restricted'
    })
  })

  it('names a missing read:org scope on a 404', async () => {
    fetchMock.raw.mockRejectedValue({
      status: 404,
      data: { message: 'Not Found' },
      response: { status: 404, headers: new Headers({ 'x-oauth-scopes': 'read:user' }) }
    })
    await expect(verifyOwnerAdmin('github', 'someorg', 'tok')).resolves.toMatchObject({
      result: 'denied',
      reason: 'insufficient-scope'
    })
  })

  it('reports a 404 with read:org granted as not-a-member', async () => {
    fetchMock.raw.mockRejectedValue({
      status: 404,
      data: { message: 'Not Found' },
      response: { status: 404, headers: new Headers({ 'x-oauth-scopes': 'read:user, read:org' }) }
    })
    await expect(verifyOwnerAdmin('github', 'someorg', 'tok')).resolves.toMatchObject({
      result: 'denied',
      reason: 'not-a-member'
    })
  })

  it('names a GitHub App with no org access, which sends no x-oauth-scopes', async () => {
    fetchMock.raw.mockRejectedValue({
      status: 404,
      data: { message: 'Not Found' },
      response: { status: 404, headers: new Headers() }
    })
    await expect(verifyOwnerAdmin('github', 'someorg', 'tok')).resolves.toMatchObject({
      result: 'denied',
      reason: 'app-not-installed'
    })
  })

  it('denies rather than throwing when the forge rejects the token', async () => {
    fetchMock.raw.mockRejectedValue({ status: 401, data: { message: 'Bad credentials' } })
    expect((await verifyOwnerAdmin('github', 'someorg', 'tok')).result).toBe('denied')
    fetchMock.mockRejectedValue({ status: 401, data: { message: 'unauthorized' } })
    expect((await verifyOwnerAdmin('gitlab', 'someorg', 'tok')).result).toBe('denied')
    expect((await verifyOwnerAdmin('bitbucket', 'someorg', 'tok')).result).toBe('denied')
  })

  it('matches a gitlab group by path or full path, case-insensitively', async () => {
    fetchMock.mockResolvedValue([{ full_path: 'Some/Group', path: 'group' }])
    expect((await verifyOwnerAdmin('gitlab', 'some/group', 'tok')).result).toBe('admin')

    fetchMock.mockResolvedValue([{ full_path: 'other/group', path: 'group' }])
    expect((await verifyOwnerAdmin('gitlab', 'group', 'tok')).result).toBe('admin')

    fetchMock.mockResolvedValue([{ full_path: 'unrelated', path: 'unrelated' }])
    expect((await verifyOwnerAdmin('gitlab', 'group', 'tok')).result).toBe('denied')
  })

  it('asks gitlab only for groups the user owns', async () => {
    fetchMock.mockResolvedValue([])
    await verifyOwnerAdmin('gitlab', 'group', 'tok')
    expect(fetchMock.mock.calls[0]?.[1]?.query).toMatchObject({ min_access_level: 50 })
  })

  it('requires the owner permission on the matching bitbucket workspace', async () => {
    fetchMock.mockResolvedValue({
      values: [{ permission: 'owner', workspace: { slug: 'Team' } }]
    })
    expect((await verifyOwnerAdmin('bitbucket', 'team', 'tok')).result).toBe('admin')

    fetchMock.mockResolvedValue({
      values: [{ permission: 'collaborator', workspace: { slug: 'team' } }]
    })
    expect((await verifyOwnerAdmin('bitbucket', 'team', 'tok')).result).toBe('denied')

    fetchMock.mockResolvedValue({
      values: [{ permission: 'owner', workspace: { slug: 'other' } }]
    })
    expect((await verifyOwnerAdmin('bitbucket', 'team', 'tok')).result).toBe('denied')
  })
})
