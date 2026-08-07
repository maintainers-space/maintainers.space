import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', fetchMock)

const { resolvePds } = await import('./atproto-graph')

const PDS_DOC = {
  service: [{ type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }]
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(PDS_DOC)
})

describe('resolvePds', () => {
  it('forces JSON parsing, because plc.directory serves application/did+ld+json', async () => {
    await resolvePds('did:plc:abc')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://plc.directory/did%3Aplc%3Aabc')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ responseType: 'json' })
  })

  it('forces JSON parsing for did:web documents too', async () => {
    await resolvePds('did:web:example.com')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.com/.well-known/did.json')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ responseType: 'json' })
  })

  it('returns the AtprotoPersonalDataServer endpoint', async () => {
    await expect(resolvePds('did:plc:abc')).resolves.toBe('https://pds.example')
  })

  it('throws when the document has no PDS service', async () => {
    fetchMock.mockResolvedValue({ service: [{ type: 'SomethingElse', serviceEndpoint: 'x' }] })
    await expect(resolvePds('did:plc:abc')).rejects.toThrow('No PDS service found')
  })

  it('throws when the body came back unparsed, which is the bug this guards', async () => {
    fetchMock.mockResolvedValue('{"service":[{"type":"AtprotoPersonalDataServer"}]}')
    await expect(resolvePds('did:plc:abc')).rejects.toThrow('No PDS service found')
  })
})
