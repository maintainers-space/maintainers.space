// Collapses a chronologically-pooled event list into GitHub-profile-style
// aggregated entries, so the timeline reads as "what happened" instead of a
// raw event log: every event about the same PR/issue merges into one entry
// (e.g. opened -> reviewed -> merged becomes one "merged #67" row, expandable
// to the sub-events), and same-kind/same-repo bursts with no subject of their
// own (mainly pushes) merge into one "pushed N commits to owner/repo" entry
// as long as they land on the same calendar day. Day-scoped rather than a
// rolling time window on purpose: a window spanning multiple days can fold a
// burst's newest event onto one day while its older events vanish from every
// day in between, making days that genuinely had activity look empty.
import type { ForgeContribution, ForgeId, ForgeUser } from '~/types/forge'

export interface TimelineEntry {
  key: string
  provider: ForgeId
  actor: ForgeUser
  repo: { owner: string; name: string; fullName: string; url?: string }
  /** Most recent event's timestamp — use this for sorting and day-bucketing. */
  createdAt: string
  /** The highest-impact event, whose kind/title/url/number drive the headline. */
  primary: ForgeContribution
  /** Every event folded into this entry, newest first. */
  events: ForgeContribution[]
}

function subjectGroupKey(c: ForgeContribution): string {
  if (c.number != null) return `subject:${c.provider}:${c.repo.fullName}:${c.number}`
  return `burst:${c.provider}:${c.actor.login}:${c.kind}:${c.repo.fullName}`
}

function highestImpact(events: ForgeContribution[]): ForgeContribution {
  return events.reduce((best, e) => ((e.impact ?? 0) > (best.impact ?? 0) ? e : best))
}

function sameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** `items` must already be sorted newest-first. */
export function aggregateTimeline(items: ForgeContribution[]): TimelineEntry[] {
  const openByKey = new Map<string, TimelineEntry>()
  const order: TimelineEntry[] = []

  for (const c of items) {
    const key = subjectGroupKey(c)
    const existing = openByKey.get(key)
    const hasSubject = c.number != null
    const continuesBurst =
      hasSubject || (existing && sameCalendarDay(existing.events[0]!.createdAt, c.createdAt))

    if (existing && continuesBurst) {
      existing.events.push(c)
      continue
    }

    const entry: TimelineEntry = {
      key: `${key}:${c.id}`,
      provider: c.provider,
      actor: c.actor,
      repo: c.repo,
      createdAt: c.createdAt,
      primary: c,
      events: [c]
    }
    openByKey.set(key, entry)
    order.push(entry)
  }

  // Second pass so `primary` reflects the whole burst, not just its first event.
  for (const entry of order) {
    entry.primary = highestImpact(entry.events)
  }
  return order
}

/**
 * Total commit count represented by a (possibly aggregated) push entry. Some
 * forges report a `count` without the individual commits (or vice versa) —
 * take whichever side of that pair actually has a number, per event.
 */
export function totalCommitCount(entry: TimelineEntry): number {
  return entry.events.reduce((sum, e) => sum + Math.max(e.count ?? 0, e.commits?.length ?? 0), 0)
}
