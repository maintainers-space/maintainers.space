// Turns a Colibri message (text plus facets over UTF-8 byte ranges) into blocks of styled runs,
// ready for a template to render without `v-html`.
import type { ColibriRichTextFacet } from './facets'

type Feature = ColibriRichTextFacet['features'][number]

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  code?: boolean
  spoiler?: boolean
  link?: string
  mention?: string
  channel?: string
  role?: string
  time?: string
}

export type BlockKind = 'paragraph' | 'codeblock' | 'quote' | 'heading' | 'list' | 'subtext'

export interface Block {
  kind: BlockKind
  runs: Run[]
  level?: number
  lang?: string
  ordered?: boolean
}

const BLOCK_KINDS = new Set(['codeblock', 'quote', 'heading', 'list', 'subtext'])

function kindOf(feature: Feature): string {
  return (feature.$type ?? '').split('#')[1] ?? ''
}

/** UTF-8 byte offset → string index, for every code point boundary. */
function byteToIndex(text: string): Map<number, number> {
  const map = new Map<number, number>()
  const encoder = new TextEncoder()
  let byte = 0
  let i = 0
  for (const ch of text) {
    map.set(byte, i)
    byte += encoder.encode(ch).length
    i += ch.length
  }
  map.set(byte, i)
  return map
}

interface Span {
  start: number
  end: number
  feature: Feature
  id: number
}

/** Splits a message into blocks of runs. Overlapping and nested facets are both fine. */
export function renderRichText(
  text: string,
  facets: readonly ColibriRichTextFacet[] = []
): Block[] {
  const index = byteToIndex(text)
  const spans: Span[] = []
  facets.forEach((facet, id) => {
    const start = index.get(facet.index.byteStart)
    const end = index.get(facet.index.byteEnd)
    if (start === undefined || end === undefined || end <= start) return
    for (const feature of facet.features) spans.push({ end, feature, id, start })
  })

  const cuts = new Set([0, text.length])
  for (const s of spans) cuts.add(s.start).add(s.end)
  const points = [...cuts].toSorted((a, b) => a - b)

  const blocks: Block[] = []
  let current: { block: Block; key: string } | undefined
  for (let i = 0; i < points.length - 1; i++) {
    const [from, to] = [points[i]!, points[i + 1]!]
    const active = spans.filter((s) => s.start <= from && s.end >= to)
    const blockSpan = active.find((s) => BLOCK_KINDS.has(kindOf(s.feature)))
    const key = blockSpan ? `${blockSpan.id}` : 'p'
    const run: Run = { text: text.slice(from, to) }
    for (const { feature } of active) {
      const f = feature as Record<string, unknown>
      switch (kindOf(feature)) {
        case 'bold':
          run.bold = true
          break
        case 'italic':
          run.italic = true
          break
        case 'underline':
          run.underline = true
          break
        case 'strikethrough':
          run.strike = true
          break
        case 'code':
          run.code = true
          break
        case 'spoiler':
          run.spoiler = true
          break
        case 'link':
          run.link = String(f.uri ?? '')
          break
        case 'mention':
          run.mention = String(f.did ?? '')
          break
        case 'channel':
          run.channel = String(f.channel ?? '')
          break
        case 'role':
          run.role = String(f.role ?? '')
          break
        case 'time':
          run.time = String(f.datetime ?? '')
          break
      }
    }
    if (!current || current.key !== key || (key === 'p' && current.block.kind !== 'paragraph')) {
      const f = (blockSpan?.feature ?? {}) as Record<string, unknown>
      const block: Block = {
        kind: (blockSpan ? kindOf(blockSpan.feature) : 'paragraph') as BlockKind,
        runs: []
      }
      if (typeof f.level === 'number') block.level = f.level
      if (typeof f.lang === 'string') block.lang = f.lang
      if (typeof f.ordered === 'boolean') block.ordered = f.ordered
      blocks.push(block)
      current = { block, key }
    }
    current.block.runs.push(run)
  }
  return blocks.filter((b) => b.runs.some((r) => r.text))
}

/** Only web links are followed; anything else stays plain text. */
export function safeHref(uri: string | undefined): string | undefined {
  if (!uri) return undefined
  try {
    const url = new URL(uri)
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:'
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}
