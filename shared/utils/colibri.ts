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
