import { buildScopes } from '@colibri-social/client/scopes'
import { appViewDid } from './colibri'

const BASE_SCOPES = ['atproto', 'repo:space.maintainers.forgeAccount', 'repo:sh.tangled.feed.star']

/**
 * What signing in asks for. Deliberately excludes everything chat needs, so an
 * account that never opens the Chat tab never grants access to its messages.
 * `atproto` is listed here rather than taken from buildScopes because every
 * request needs it, including one that asks for no chat permissions at all.
 */
export function baseScope(): string {
  return BASE_SCOPES.join(' ')
}

/**
 * The full set, requested only when someone actually opens chat. Also what the
 * client metadata declares, since an authorization request may narrow the
 * declared scope but never exceed it.
 */
export function chatScope(appviewUrl: string): string {
  return [...new Set([...BASE_SCOPES, ...buildScopes(appViewDid(appviewUrl))])].join(' ')
}
