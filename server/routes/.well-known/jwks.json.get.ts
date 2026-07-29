// Publishes the maintainers.space server's public attestation key(s) as a JWKS document.
//
// Verifiers (maintainers.space clients rendering the "Verified" badge) fetch this to check
// the signature on a forge-account attestation. Served at /.well-known/jwks.json.
// Returns an empty key set when no signing key is configured.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'content-type', 'application/json')
  // Keys are stable; let clients and proxies cache briefly.
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')
  return await getAttestationJwks()
})
