// Cached, same-origin passthrough for anonymous (no-token) forge search reads.
//
// Search is otherwise fetched straight from the browser to each forge's public
// API, so anonymous callers share that forge's (often strict) unauthenticated
// rate limit with every other maintainers.space visitor. Routing the no-token case through
// here instead lets a repeat of the same query be served from the browser/CDN/
// Netlify edge cache (see `CACHE_SEARCH`) rather than re-hitting the forge.
//
// `GET /api/search-proxy?url=<allowlisted forge API URL>&accept=<Accept header>&...`
// forwards every other query param to `url` and returns its JSON body.
export default createForgeApiProxyHandler(CACHE_SEARCH)
