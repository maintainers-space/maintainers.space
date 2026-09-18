import { describe, expect, it } from 'vitest'

import { OAUTH_SCOPE, buildAtprotoClientMetadata } from '#shared/atproto-oauth'

describe('buildAtprotoClientMetadata', () => {
  it('derives client_id and redirect_uris from the request origin', () => {
    const meta = buildAtprotoClientMetadata('https://main.maintainers.space')
    expect(meta.client_id).toBe('https://main.maintainers.space/client-metadata.json')
    expect(meta.redirect_uris).toEqual(['https://main.maintainers.space/oauth/callback'])
    expect(meta.client_uri).toBe('https://main.maintainers.space')
  })

  it('produces the production client for the apex origin', () => {
    const meta = buildAtprotoClientMetadata('https://maintainers.space')
    expect(meta.client_id).toBe('https://maintainers.space/client-metadata.json')
    expect(meta.redirect_uris).toEqual(['https://maintainers.space/oauth/callback'])
  })

  it('advertises the exact scope the app requests', () => {
    const meta = buildAtprotoClientMetadata('https://maintainers.space')
    expect(meta.scope).toBe(OAUTH_SCOPE)
    expect(meta.scope).toBe('atproto repo:space.maintainers.forgeAccount repo:sh.tangled.feed.star')
  })
})
