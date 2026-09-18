// Publishes the atproto OAuth client metadata document for whichever host
// served the request.
//
// atproto registers public web clients on the fly: at the start of a flow the
// user's PDS fetches the document from the client_id URL and rejects it unless
// the document's `client_id` matches that URL and its `redirect_uris` contain
// the requested callback. A hardcoded document (a static file under public/)
// would break any host besides the production apex, e.g. the main branch deploy
// at main.maintainers.space. Building it from the request origin keeps every
// host's client consistent with itself. Served at /client-metadata.json.
import { buildAtprotoClientMetadata } from '#shared/atproto-oauth'

export default defineEventHandler((event) => {
  const { origin } = getRequestURL(event)
  setResponseHeader(event, 'content-type', 'application/json')
  // The document is fetched by the PDS once per flow; correctness (origin match)
  // matters more than edge caching, so never cache it.
  setResponseHeader(event, 'cache-control', 'no-store')
  return buildAtprotoClientMetadata(origin)
})
