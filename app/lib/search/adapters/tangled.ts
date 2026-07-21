import type { QueryNode } from '~/lib/search/parser'

// Tangled has no search API, so we translate the AST into an owner-scoped filter
// plan: resolve an owner from the query, list their repos/issues, then match text
// terms client-side. Without an owner qualifier Tangled search is not usable.

export interface TangledPlan {
  owner?: string
  repoName?: string
  /** Lowercased positive terms (AND-matched). */
  terms: string[]
  /** Lowercased negated terms (must be absent). */
  negatedTerms: string[]
  /** Issue/PR state filter derived from `is:`/`state:`. */
  state?: string
  usable: boolean
}

function walk(node: QueryNode | null, plan: TangledPlan, negated: boolean): void {
  if (!node) return
  switch (node.type) {
    case 'term':
      (negated ? plan.negatedTerms : plan.terms).push(node.value.toLowerCase())
      break
    case 'qualifier': {
      const key = node.key
      const val = node.value
      if (['owner', 'user', 'org', 'handle', 'from', 'author'].includes(key)) {
        if (!plan.owner) plan.owner = val
      } else if (key === 'repo') {
        const [o, r] = val.split('/')
        if (o && !plan.owner) plan.owner = o
        if (r) plan.repoName = r
      } else if (key === 'is' || key === 'state') {
        if (['open', 'closed', 'merged'].includes(val.toLowerCase())) plan.state = val.toLowerCase()
      }
      break
    }
    case 'not':
      walk(node.node, plan, !negated)
      break
    case 'and':
    case 'or':
      node.nodes.forEach(c => walk(c, plan, negated))
      break
  }
}

export function astToTangledPlan(node: QueryNode | null): TangledPlan {
  const plan: TangledPlan = { terms: [], negatedTerms: [], usable: false }
  walk(node, plan, false)
  plan.usable = !!plan.owner
  return plan
}

/** True when `text` satisfies the plan's positive/negative term constraints. */
export function tangledMatches(plan: TangledPlan, ...fields: Array<string | null | undefined>): boolean {
  const haystack = fields.filter(Boolean).join(' \u0000 ').toLowerCase()
  for (const t of plan.terms) if (!haystack.includes(t)) return false
  for (const t of plan.negatedTerms) if (haystack.includes(t)) return false
  return true
}
