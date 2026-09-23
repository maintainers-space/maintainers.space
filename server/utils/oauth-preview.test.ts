import { describe, expect, it } from 'vitest'
import { allowedPreviewOrigin } from './oauth-preview'

const allowlist = 'https://staging.maintainers.space, https://*.maintainers-space.pages.dev'

describe('allowedPreviewOrigin', () => {
  it('accepts an exact allowlisted origin', () => {
    expect(allowedPreviewOrigin('https://staging.maintainers.space', allowlist)).toBe(
      'https://staging.maintainers.space'
    )
  })

  it('accepts a subdomain matched by a wildcard entry', () => {
    expect(allowedPreviewOrigin('https://pr-28.maintainers-space.pages.dev', allowlist)).toBe(
      'https://pr-28.maintainers-space.pages.dev'
    )
  })

  it('rejects attacker-controlled https origins', () => {
    expect(allowedPreviewOrigin('https://attacker.example', allowlist)).toBeUndefined()
    expect(
      allowedPreviewOrigin('https://maintainers-space.pages.dev.attacker.example', allowlist)
    ).toBeUndefined()
    expect(
      allowedPreviewOrigin('https://evilmaintainers-space.pages.dev', allowlist)
    ).toBeUndefined()
  })

  it('rejects the wildcard apex, non-https schemes, ports and non-origin values', () => {
    expect(allowedPreviewOrigin('https://maintainers-space.pages.dev', allowlist)).toBeUndefined()
    expect(allowedPreviewOrigin('http://staging.maintainers.space', allowlist)).toBeUndefined()
    expect(
      allowedPreviewOrigin('https://pr-1.maintainers-space.pages.dev:8443', allowlist)
    ).toBeUndefined()
    expect(
      allowedPreviewOrigin('https://staging.maintainers.space/path', allowlist)
    ).toBeUndefined()
    expect(
      allowedPreviewOrigin('https://user@staging.maintainers.space', allowlist)
    ).toBeUndefined()
    expect(allowedPreviewOrigin('not a url', allowlist)).toBeUndefined()
    expect(allowedPreviewOrigin(['https://staging.maintainers.space'], allowlist)).toBeUndefined()
  })

  it('rejects everything when no previews are configured', () => {
    expect(allowedPreviewOrigin('https://staging.maintainers.space', '')).toBeUndefined()
  })
})
