// A small, GitHub-inspired search query language shared across all providers.
/* eslint-disable @stylistic/max-statements-per-line -- compact hand-written tokenizer */
//
//   term term            implicit AND
//   term OR term         explicit OR (also `term | term`, and `a|b` shorthand)
//   NOT term  /  -term    negation
//   key:value            qualifier (value may be "quoted")
//   "exact phrase"       phrase term
//   ( ... )              grouping
//
// Precedence: NOT > AND > OR.
//
// A few "control" qualifiers never reach a provider — they configure the search
// itself: `provider:`/`forge:`, `type:`/`is:<kind>`, `sort:`, `order:`.

import type { ForgeId } from '~/types/forge'

export type ResultType = 'repos' | 'code' | 'issues' | 'users' | 'discussions'

export type QueryNode =
  | { type: 'term'; value: string; phrase?: boolean }
  | { type: 'qualifier'; key: string; value: string }
  | { type: 'not'; node: QueryNode }
  | { type: 'and'; nodes: QueryNode[] }
  | { type: 'or'; nodes: QueryNode[] }

export interface ParsedQuery {
  root: QueryNode | null
  raw: string
  /** Providers explicitly requested via `provider:`/`forge:` (empty = caller default). */
  providers: ForgeId[]
  /** Result types requested via `type:`/`is:<kind>` (empty = caller default). */
  resultTypes: ResultType[]
  sortKey?: string
  sortOrder?: 'asc' | 'desc'
  /** Qualifier keys that appeared but are meaningless (informational). */
  warnings: string[]
}

interface RawToken {
  t: 'term' | 'phrase' | 'qualifier' | 'or' | 'not' | 'lparen' | 'rparen'
  v: string
  k?: string
}

const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'

function tokenize(input: string): RawToken[] {
  const tokens: RawToken[] = []
  let i = 0
  const n = input.length

  const readQuoted = (): string => {
    i++
    let s = ''
    while (i < n && input[i] !== '"') {
      s += input[i]
      i++
    }
    if (i < n) i++
    return s
  }
  const readBareword = (): string => {
    let s = ''
    while (i < n) {
      const ch = input[i]!
      if (isSpace(ch) || ch === '(' || ch === ')' || ch === '|' || ch === '"') break
      s += ch
      i++
    }
    return s
  }

  while (i < n) {
    const c = input[i]!
    if (isSpace(c)) {
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ t: 'lparen', v: '(' })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ t: 'rparen', v: ')' })
      i++
      continue
    }
    if (c === '|') {
      tokens.push({ t: 'or', v: 'OR' })
      i++
      continue
    }

    let negated = false
    if (c === '-') {
      const nx = input[i + 1]
      if (nx && !isSpace(nx) && nx !== '-' && nx !== '(') {
        negated = true
        i++
      } else {
        i++
        continue
      }
    }

    if (input[i] === '"') {
      const v = readQuoted()
      if (negated) tokens.push({ t: 'not', v: 'NOT' })
      if (v) tokens.push({ t: 'phrase', v })
      continue
    }

    const word = readBareword()
    if (!word) {
      i++
      continue
    }

    const colon = word.indexOf(':')
    if (colon > 0 && /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(word.slice(0, colon))) {
      const key = word.slice(0, colon).toLowerCase()
      let value = word.slice(colon + 1)
      if (value === '' && input[i] === '"') value = readQuoted()
      if (negated) tokens.push({ t: 'not', v: 'NOT' })
      tokens.push({ t: 'qualifier', v: value, k: key })
      continue
    }

    const upper = word.toUpperCase()
    if (upper === 'OR') {
      tokens.push({ t: 'or', v: 'OR' })
      continue
    }
    if (upper === 'NOT') {
      tokens.push({ t: 'not', v: 'NOT' })
      continue
    }
    if (upper === 'AND') {
      continue
    }
    if (negated) tokens.push({ t: 'not', v: 'NOT' })
    tokens.push({ t: 'term', v: word })
  }
  return tokens
}

function orJoin(a: QueryNode, b: QueryNode): QueryNode {
  const nodes = [...(a.type === 'or' ? a.nodes : [a]), ...(b.type === 'or' ? b.nodes : [b])]
  return { type: 'or', nodes }
}

function andJoin(a: QueryNode, b: QueryNode): QueryNode {
  const nodes = [...(a.type === 'and' ? a.nodes : [a]), ...(b.type === 'and' ? b.nodes : [b])]
  return { type: 'and', nodes }
}

function parseTokens(tokens: RawToken[]): QueryNode | null {
  let pos = 0
  const peek = () => tokens[pos]
  const startsPrimary = (tok?: RawToken) =>
    !!tok &&
    (tok.t === 'term' ||
      tok.t === 'phrase' ||
      tok.t === 'qualifier' ||
      tok.t === 'lparen' ||
      tok.t === 'not')

  function parsePrimary(): QueryNode | null {
    const tok = peek()
    if (!tok) return null
    if (tok.t === 'lparen') {
      pos++
      const inner = parseOr()
      if (peek()?.t === 'rparen') pos++
      return inner
    }
    if (tok.t === 'term') {
      pos++
      return { type: 'term', value: tok.v }
    }
    if (tok.t === 'phrase') {
      pos++
      return { type: 'term', value: tok.v, phrase: true }
    }
    if (tok.t === 'qualifier') {
      pos++
      return { type: 'qualifier', key: tok.k!, value: tok.v }
    }
    pos++ // stray rparen / or
    return null
  }

  function parseNot(): QueryNode | null {
    if (peek()?.t === 'not') {
      pos++
      const node = parseNot()
      return node ? { type: 'not', node } : null
    }
    return parsePrimary()
  }

  function parseAnd(): QueryNode | null {
    let left = parseNot()
    while (startsPrimary(peek()) && peek()?.t !== 'or') {
      const right = parseNot()
      if (right) left = left ? andJoin(left, right) : right
    }
    return left
  }

  function parseOr(): QueryNode | null {
    let left = parseAnd()
    while (peek()?.t === 'or') {
      pos++
      const right = parseAnd()
      if (right) left = left ? orJoin(left, right) : right
    }
    return left
  }

  return parseOr()
}

const PROVIDER_ALIASES: Record<string, ForgeId> = {
  github: 'github',
  gh: 'github',
  tangled: 'tangled',
  tg: 'tangled',
  gitlab: 'gitlab',
  gl: 'gitlab',
  gitea: 'gitea',
  forgejo: 'forgejo',
  bitbucket: 'bitbucket',
  bb: 'bitbucket'
}

function typeAlias(value: string): ResultType | undefined {
  switch (value.toLowerCase()) {
    case 'repo':
    case 'repos':
    case 'repository':
    case 'repositories':
      return 'repos'
    case 'code':
      return 'code'
    case 'issue':
    case 'issues':
    case 'pr':
    case 'prs':
    case 'pull':
    case 'pulls':
    case 'pullrequest':
      return 'issues'
    case 'user':
    case 'users':
    case 'org':
    case 'orgs':
      return 'users'
    case 'discussion':
    case 'discussions':
      return 'discussions'
    default:
      return undefined
  }
}

/** Strip control qualifiers into `meta`, returning the cleaned content AST. */
function stripControls(node: QueryNode | null, meta: ParsedQuery): QueryNode | null {
  if (!node) return null
  if (node.type === 'term') return node
  if (node.type === 'qualifier') {
    const key = node.key
    const val = node.value
    if (key === 'provider' || key === 'forge') {
      for (const p of val
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)) {
        const id = PROVIDER_ALIASES[p]
        if (id && !meta.providers.includes(id)) meta.providers.push(id)
      }
      return null
    }
    if (key === 'type') {
      const rt = typeAlias(val)
      if (rt && !meta.resultTypes.includes(rt)) meta.resultTypes.push(rt)
      return null
    }
    if (key === 'is') {
      const rt = typeAlias(val)
      if (rt) {
        if (!meta.resultTypes.includes(rt)) meta.resultTypes.push(rt)
        return null
      }
      return node // is:open / is:closed / is:merged etc. stay for the provider
    }
    if (key === 'sort') {
      meta.sortKey = val.toLowerCase()
      return null
    }
    if (key === 'order') {
      meta.sortOrder = val.toLowerCase() === 'asc' ? 'asc' : 'desc'
      return null
    }
    return node
  }
  if (node.type === 'not') {
    const inner = stripControls(node.node, meta)
    return inner ? { type: 'not', node: inner } : null
  }
  // and / or
  const kept = node.nodes.map((c) => stripControls(c, meta)).filter((c): c is QueryNode => !!c)
  if (kept.length === 0) return null
  if (kept.length === 1) return kept[0]!
  return { type: node.type, nodes: kept }
}

export function parseQuery(raw: string): ParsedQuery {
  const meta: ParsedQuery = { root: null, raw, providers: [], resultTypes: [], warnings: [] }
  const tokens = tokenize(raw)
  const ast = parseTokens(tokens)
  meta.root = stripControls(ast, meta)
  return meta
}

/** Collect every qualifier for previewing or chip rendering. */
export function collectQualifiers(
  node: QueryNode | null,
  out: Array<{ key: string; value: string; negated: boolean }> = [],
  negated = false
): Array<{ key: string; value: string; negated: boolean }> {
  if (!node) return out
  if (node.type === 'qualifier') out.push({ key: node.key, value: node.value, negated })
  else if (node.type === 'not') collectQualifiers(node.node, out, !negated)
  else if (node.type === 'and' || node.type === 'or')
    node.nodes.forEach((c) => collectQualifiers(c, out, negated))
  return out
}
