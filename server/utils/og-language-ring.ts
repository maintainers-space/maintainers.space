import { languageColor } from './og-language-colors'

export interface LanguageRingSegment {
  name: string
  color: string
  /** Share of the ring, 0-100. */
  percent: number
}

const MAX_SEGMENTS = 6

/**
 * Turns a raw byte-count breakdown (as returned by GitHub/GitLab/Gitea's
 * `/languages` endpoints) into ring segments: largest languages first, capped
 * to `MAX_SEGMENTS` with the long tail folded into a single "Other" wedge so
 * the ring never gets so busy it's unreadable at OG-image size.
 */
export function buildLanguageRing(bytes: Record<string, number>): LanguageRingSegment[] {
  const total = Object.values(bytes).reduce((sum, n) => sum + n, 0)
  if (total <= 0) return []

  const sorted = Object.entries(bytes)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])

  const shown = sorted.slice(0, MAX_SEGMENTS)
  const rest = sorted.slice(MAX_SEGMENTS)

  const segments: LanguageRingSegment[] = shown.map(([name, n]) => ({
    name,
    color: languageColor(name),
    percent: (n / total) * 100
  }))

  const otherBytes = rest.reduce((sum, [, n]) => sum + n, 0)
  if (otherBytes > 0) {
    segments.push({ name: 'Other', color: '#6e7681', percent: (otherBytes / total) * 100 })
  }

  return segments
}
