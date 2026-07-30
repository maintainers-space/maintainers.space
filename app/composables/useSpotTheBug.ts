import challenges from '~/data/spot-the-bug.json'

export interface SpotTheBugChallenge {
  id: string
  title: string
  language: string
  buggy: string
  fixed: string
  diff: string
  explanation: string
  sponsor: { name: string; url: string }
}

const STORAGE_KEY = 'maintainers.space:spot-the-bug-solved'

function loadSolved(): Set<string> {
  if (!import.meta.client) return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

/** Whitespace differences (indentation, spacing, line breaks) shouldn't fail a correct fix. */
function normalize(code: string): string {
  return code.replace(/\s+/g, '')
}

/** A new puzzle daily, shared by everyone that day — same spirit as a newsletter issue. */
function dailyIndex(length: number): number {
  const days = Math.floor(Date.now() / 86_400_000)
  return ((days % length) + length) % length
}

const list = challenges as SpotTheBugChallenge[]

/** "Spot the bug" mini-game shown when the notifications inbox is empty. */
export function useSpotTheBug() {
  const challenge = computed(() => list[dailyIndex(list.length)]!)
  const solved = ref<Set<string>>(loadSolved())

  function markSolved(id: string): void {
    if (solved.value.has(id)) return
    const next = new Set(solved.value)
    next.add(id)
    solved.value = next
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  }

  /** Graceful check: only meaningful (non-whitespace) differences count as wrong. */
  function check(submitted: string): boolean {
    const ok = normalize(submitted) === normalize(challenge.value.fixed)
    if (ok) markSolved(challenge.value.id)
    return ok
  }

  const isSolved = computed(() => solved.value.has(challenge.value.id))

  return { challenge, check, isSolved }
}
