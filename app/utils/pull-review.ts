import type { ForgePullReviewComment } from '~/types/forge'

export const REVIEW_STATE_LABEL: Record<string, string> = {
  APPROVED: 'approved these changes',
  CHANGES_REQUESTED: 'requested changes',
  COMMENTED: 'reviewed',
  PENDING: 'has a pending review',
  DISMISSED: 'had this review dismissed',
  UNKNOWN: 'reviewed'
}

export const REVIEW_STATE_ICON: Record<string, string> = {
  APPROVED: 'i-lucide-circle-check',
  CHANGES_REQUESTED: 'i-lucide-circle-x',
  COMMENTED: 'i-lucide-message-square',
  PENDING: 'i-lucide-clock',
  DISMISSED: 'i-lucide-ban',
  UNKNOWN: 'i-lucide-circle'
}

export const REVIEW_STATE_COLOR: Record<string, 'success' | 'error' | 'neutral'> = {
  APPROVED: 'success',
  CHANGES_REQUESTED: 'error',
  COMMENTED: 'neutral',
  PENDING: 'neutral',
  DISMISSED: 'neutral',
  UNKNOWN: 'neutral'
}

export function reviewStateLabel(state: string): string {
  return REVIEW_STATE_LABEL[state] ?? 'reviewed'
}

export function commentLocation(comment: ForgePullReviewComment): string {
  return comment.line ? `${comment.path}:${comment.line}` : comment.path
}
