import emojiByChar from 'unicode-emoji-json/data-by-emoji.json'
import orderedEmoji from 'unicode-emoji-json/data-ordered-emoji.json'
import type { ReactionContent } from 'forges'

export interface EmojiEntry {
  emoji: string
  slug: string
  name: string
}

const emojiInfo = emojiByChar as Record<string, { name: string; slug: string }>

const ALL_EMOJI: EmojiEntry[] = orderedEmoji
  .filter((emoji): emoji is string => emoji in emojiInfo)
  .map((emoji) => ({ emoji, slug: emojiInfo[emoji]!.slug, name: emojiInfo[emoji]!.name }))

export function searchEmoji(query: string, limit = 20): EmojiEntry[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '_')
  if (!q) return ALL_EMOJI.slice(0, limit)
  const results: EmojiEntry[] = []
  for (const entry of ALL_EMOJI) {
    if (entry.slug.includes(q) || entry.name.includes(query.trim().toLowerCase())) {
      results.push(entry)
      if (results.length >= limit) break
    }
  }
  return results
}

/** The classic 8-emoji reaction set every reacting forge accepts, named as `forges` names them. */
export const REACTION_KINDS: ReactionContent[] = [
  '+1',
  '-1',
  'laugh',
  'hooray',
  'confused',
  'heart',
  'rocket',
  'eyes'
]

export const REACTION_EMOJI: Record<ReactionContent, string> = {
  '+1': '👍',
  '-1': '👎',
  laugh: '😄',
  hooray: '🎉',
  confused: '😕',
  heart: '❤️',
  rocket: '🚀',
  eyes: '👀'
}

export const REACTION_LABEL: Record<ReactionContent, string> = {
  '+1': 'thumbs up',
  '-1': 'thumbs down',
  laugh: 'laugh',
  hooray: 'hooray',
  confused: 'confused',
  heart: 'heart',
  rocket: 'rocket',
  eyes: 'eyes'
}
