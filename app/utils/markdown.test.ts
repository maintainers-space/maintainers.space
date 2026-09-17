import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

const alerts = [
  ['NOTE', 'Note'],
  ['TIP', 'Tip'],
  ['IMPORTANT', 'Important'],
  ['WARNING', 'Warning'],
  ['CAUTION', 'Caution']
] as const

function render(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('renderMarkdown', () => {
  it.each(alerts)('renders GitHub %s alerts with a visible %s label', (type, label) => {
    const html = renderMarkdown(`> [!${type}]\n> Useful **details**.`, true)
    expect(html).toContain('github-markdown-alert')
    const container = render(html)
    const alert = container.querySelector('blockquote')

    expect(alert?.className).toBe('github-markdown-alert')
    expect(alert?.dataset.githubAlert).toBe(type.toLowerCase())
    expect(alert?.textContent).toContain(`${label}Useful details.`)
    expect(alert?.querySelector('strong')?.textContent).toBe('details')
  })

  it('keeps non-alert blockquotes, inline markers, and fenced code unchanged', () => {
    const container = render(
      renderMarkdown(
        [
          '> A regular quote',
          '',
          '> [!NOTE] This is not an alert.',
          '',
          '```markdown',
          '> [!WARNING]',
          '> This is code.',
          '```'
        ].join('\n'),
        true
      )
    )

    expect(container.querySelector('.github-markdown-alert')).toBeNull()
    expect(container.textContent).toContain('[!NOTE] This is not an alert.')
    expect(container.querySelector('code')?.textContent).toContain('[!WARNING]')
  })

  it('renders an alert in file Markdown without requiring hard line breaks', () => {
    const container = render(renderMarkdown('> [!TIP]\n> Read the **guide**.', false))
    const alert = container.querySelector('blockquote')

    expect(alert?.className).toBe('github-markdown-alert')
    expect(alert?.textContent).toContain('Tip')
    expect(alert?.textContent).toContain('Read the guide.')
    expect(alert?.querySelector('strong')?.textContent).toBe('guide')
  })
})
