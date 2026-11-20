// A normalised "someone did something" record for the timeline. The package models events that a
// forge pushes at a webhook, not the public per-user activity feed, so these are built from each
// forge's feed endpoint (see ./forges/gaps/social).

export type ContributionKind =
  | 'comment'
  | 'create'
  | 'fork'
  | 'issue_closed'
  | 'issue_opened'
  | 'other'
  | 'pr_merged'
  | 'pr_opened'
  | 'pr_review'
  | 'push'
  | 'release'
  | 'star'

export interface ContributionCommit {
  message: string
  sha?: string
  url?: string
}

export interface Contribution {
  actor: { avatarUrl?: string; login: string; name?: string }
  commits?: ContributionCommit[]
  count?: number
  createdAt: string
  id: string
  /** Ranking score used by the "friends" feed (higher = more impactful). */
  impact: number
  kind: ContributionKind
  number?: number
  provider: string
  refType?: string
  repo: { fullName: string; name: string; owner: string; url?: string }
  title?: string
  url?: string
}

/** Relative "impact" weight per event kind, used to rank the friends feed. */
export const EVENT_IMPACT: Record<ContributionKind, number> = {
  pr_merged: 10,
  release: 8,
  pr_opened: 6,
  pr_review: 4,
  issue_opened: 3,
  issue_closed: 2,
  create: 1.5,
  push: 1,
  comment: 1,
  fork: 0.5,
  star: 0.25,
  other: 0
}
