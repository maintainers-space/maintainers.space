import type { ForgeJobLog } from '~/types/forge'

const GROUP_START = /^(?:[^\s]+\s)?##\[group\](.*)$/
const GROUP_END = /^(?:[^\s]+\s)?##\[endgroup\]$/

/** Splits a GitHub/Gitea Actions runner log (##[group]/##[endgroup] markers) into per-step sections. */
export function parseActionsRunnerLog(text: string): ForgeJobLog {
  const sections: { name: string; lines: string[] }[] = []
  let current: { name: string; lines: string[] } | null = null

  for (const line of text.split(/\r?\n/)) {
    const start = line.match(GROUP_START)
    if (start) {
      current = { name: (start[1] ?? '').trim(), lines: [] }
      sections.push(current)
      continue
    }
    if (GROUP_END.test(line)) {
      current = null
      continue
    }
    current?.lines.push(line)
  }

  return sections.length ? { sections } : { raw: text }
}
