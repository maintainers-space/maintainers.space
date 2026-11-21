/**
 * Where AppView XRPC calls actually go, which is not the same thing as the
 * AppView's identity. `did:web` DIDs pinned by permission-set scopes and
 * service-auth `aud`s must name a host a PDS can resolve, so they always derive
 * from the canonical URL, while development can redirect the traffic itself to a
 * local AppView. @colibri-social/client draws the same distinction, keeping its
 * DIDs canonical and branching only in `getAppViewHost`.
 */
export function appViewDialUrl(canonicalUrl: string, dialUrl?: string): string {
  return dialUrl || canonicalUrl
}

export function appViewDid(url: string): string {
  return `did:web:${new URL(url).host.replace(/:/g, '%3A')}`
}

export function appViewServiceRef(url: string): string {
  return `${appViewDid(url)}#colibri_appview`
}

export function appViewNotifRef(url: string): string {
  return `${appViewDid(url)}#colibri_notif`
}

// Colibri's OAuth scopes and how to tell which of them a session holds, from
// @colibri-social/client's `scopes` module (MIT, Copyright (c) 2026 Louis Escher, Reuben Tier).
// The permission sets are pinned to the AppView's `did:web`, so they are built per AppView.

/** Every scope Colibri needs, for the AppView identified by `did`. */
export function buildColibriScopes(did: string): string[] {
  return [
    'atproto',
    'blob:*/*',
    'rpc:app.bsky.actor.getProfile?aud=*',
    'rpc:com.atproto.identity.resolveDid?aud=*',
    `include:social.colibri.permissionAccount?aud=${did}#colibri_appview`,
    `include:social.colibri.permissionCommunity?aud=${did}#colibri_appview`,
    `include:social.colibri.permissionMessaging?aud=${did}#colibri_appview`,
    `include:social.colibri.permissionNotification?aud=${did}#colibri_appview`
  ]
}

/**
 * A PDS grants a permission set expanded into the permissions it covers, so each set is
 * recognised by one permission it always contains.
 */
const PERMISSION_SET_MARKERS: Record<string, string> = {
  'social.colibri.permissionAccount': 'social.colibri.actor.deleteAccount',
  'social.colibri.permissionCommunity': 'social.colibri.community.getData',
  'social.colibri.permissionMessaging': 'social.colibri.membership',
  'social.colibri.permissionNotification': 'social.colibri.notification.listNotifications'
}

/** The Colibri permission sets a granted scope lacks. */
export function missingColibriScopeSets(grantedScope: string): string[] {
  return Object.entries(PERMISSION_SET_MARKERS)
    .filter(([, marker]) => !grantedScope.includes(marker))
    .map(([nsid]) => nsid)
}
