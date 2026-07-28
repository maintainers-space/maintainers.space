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

// eslint-disable-next-line no-control-regex -- matching the ANSI escape byte is the point
const ANSI_ESCAPE = /\x1b\[[0-9;]*[A-Za-z]/g
const SECTION_TOKEN = /section_(start|end):\d+:([^\r\n[]+)(?:\[collapsed=\w+\])?\r?/g

/** Splits a GitLab job trace (section_start/section_end markers) into named sections. */
export function parseGitlabJobTrace(text: string): ForgeJobLog {
  const stripped = text.replace(ANSI_ESCAPE, '')
  const sections: { name: string; lines: string[] }[] = []
  let open: { name: string; contentStart: number } | null = null
  let match: RegExpExecArray | null
  SECTION_TOKEN.lastIndex = 0
  while ((match = SECTION_TOKEN.exec(stripped))) {
    const kind = match[1]
    const name = (match[2] ?? '').trim()
    const tokenEnd = match.index + match[0].length
    if (kind === 'start') {
      open = { name, contentStart: tokenEnd }
    } else if (open && open.name === name) {
      const content = stripped.slice(open.contentStart, match.index)
      sections.push({ name, lines: content.split(/\r?\n/).filter((l) => l.length > 0) })
      open = null
    }
  }
  return sections.length ? { sections } : { raw: stripped }
}
