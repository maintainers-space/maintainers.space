// Cached, same-origin passthrough for anonymous (no-token) Explore-graph reads:
// a person's public following/followers list, a repo's contributors. These
// change rarely and building the graph fans out to many of them per person,
// so they're held far longer than search (see `CACHE_SOCIAL_GRAPH`) — a
// repeat lookup anywhere in maintainers.space serves from the shared edge cache instead
// of re-hitting the forge.
//
// `GET /api/graph-proxy?url=<allowlisted forge API URL>&accept=<Accept header>&...`
// forwards every other query param to `url` and returns its JSON body.
export default createForgeApiProxyHandler(CACHE_SOCIAL_GRAPH)
