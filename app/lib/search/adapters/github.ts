import type { QueryNode } from '~/lib/search/parser'

// koinon qualifier key -> GitHub search qualifier. Unknown keys are dropped and
// reported so the UI can show a "partial results" hint.
const GH_KEYS: Record<string, string> = {
  language: 'language', lang: 'language',
  org: 'org', user: 'user', owner: 'user',
  repo: 'repo',
  in: 'in',
  stars: 'stars', forks: 'forks', size: 'size',
  created: 'created', pushed: 'pushed', updated: 'pushed',
  merged: 'merged', closed: 'closed',
  label: 'label', milestone: 'milestone',
  author: 'author', assignee: 'assignee', mentions: 'mentions', commenter: 'commenter', involves: 'involves',
  state: 'state', is: 'is', draft: 'draft', reason: 'reason',
  topic: 'topic', license: 'license', archived: 'archived', fork: 'fork',
  path: 'path', filename: 'filename', extension: 'extension', ext: 'extension'
}

function needsQuote(v: string): boolean {
  return /\s/.test(v) || v === ''
}

function quote(v: string): string {
  return needsQuote(v) ? `"${v.replace(/"/g, '\\"')}"` : v
}

export interface GitHubQueryResult {
  query: string
  dropped: string[]
}

/** Render a koinon AST into a GitHub search query string. */
export function astToGitHubQuery(node: QueryNode | null): GitHubQueryResult {
  const dropped: string[] = []

  const render = (n: QueryNode | null): string => {
    if (!n) return ''
    switch (n.type) {
      case 'term':
        return n.phrase ? `"${n.value.replace(/"/g, '\\"')}"` : n.value
      case 'qualifier': {
        const gh = GH_KEYS[n.key]
        if (!gh) {
          if (!dropped.includes(n.key)) dropped.push(n.key)
          return ''
        }
        return `${gh}:${quote(n.value)}`
      }
      case 'not': {
        const inner = n.node
        if (inner.type === 'term' || inner.type === 'qualifier') {
          const r = render(inner)
          return r ? `-${r}` : ''
        }
        const r = render(inner)
        return r ? `NOT (${r})` : ''
      }
      case 'and':
        return n.nodes.map(render).filter(Boolean).join(' ')
      case 'or': {
        const parts = n.nodes.map(render).filter(Boolean)
        if (parts.length === 0) return ''
        if (parts.length === 1) return parts[0]!
        return `(${parts.join(' OR ')})`
      }
    }
  }

  return { query: render(node).trim(), dropped }
}
