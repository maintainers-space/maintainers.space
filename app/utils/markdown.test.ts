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

  it('renders review suggestions as a labelled suggested change', () => {
    const container = render(renderMarkdown('```suggestion\nconst a = <b>\n```', true))
    const suggestion = container.querySelector('.markdown-suggestion')

    expect(suggestion?.querySelector('.markdown-suggestion__title')?.textContent).toBe(
      'Suggested change'
    )
    expect(suggestion?.querySelector('code')?.textContent).toBe('const a = <b>\n')
    expect(suggestion?.querySelector('b')).toBeNull()
  })

  it('describes an empty suggestion as removing the selected lines', () => {
    const container = render(renderMarkdown('```suggestion\n```', true))

    expect(container.querySelector('.markdown-suggestion code')).toBeNull()
    expect(container.querySelector('.markdown-suggestion__empty')?.textContent).toBe(
      'Removes the selected lines.'
    )
  })

  it('keeps other fenced code blocks unchanged', () => {
    const container = render(renderMarkdown('```ts\nconst a = 1\n```', true))

    expect(container.querySelector('.markdown-suggestion')).toBeNull()
    expect(container.querySelector('code.language-ts')?.textContent).toBe('const a = 1\n')
  })
})
