import { marked } from 'marked'

const GITHUB_ALERTS = {
  NOTE: { label: 'Note', icon: 'ⓘ' },
  TIP: { label: 'Tip', icon: '✦' },
  IMPORTANT: { label: 'Important', icon: '❗' },
  WARNING: { label: 'Warning', icon: '⚠' },
  CAUTION: { label: 'Caution', icon: '⛔' }
} as const

const GITHUB_ALERT_PATTERN =
  /<blockquote>\n<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?=<br>|\n|<\/p>)/g

/**
 * Render GitHub-flavored Markdown, including GitHub's standalone blockquote
 * alerts. Decorating parsed HTML rather than source Markdown ensures markers
 * inside fenced code remain literal code.
 */
export function renderMarkdown(content: string, breaks: boolean): string {
  const html = marked.parse(content, { async: false, gfm: true, breaks })

  return html.replace(GITHUB_ALERT_PATTERN, (_match, type: keyof typeof GITHUB_ALERTS) => {
    const alert = GITHUB_ALERTS[type]
    return `<blockquote class="github-markdown-alert" data-github-alert="${type.toLowerCase()}">\n<p><span class="github-markdown-alert__title"><span aria-hidden="true">${alert.icon}</span>${alert.label}</span>`
  })
}
